"""Pruebas de las rutas de quizzes con un Oracle y un bucket falsos (en memoria).

FakeOracle imita las reglas de PKG_QUIZ (versiones, archivos pendientes, desbloqueo,
intentos); las reglas reales ya se probaron dentro de Oracle con
backend-oracle/tests/quiz_smoke_test.sql. Aquí se prueba lo que hace FastAPI.
"""

import copy
import datetime
import io
import json
import time
from pathlib import Path

import jwt
import pytest
from docx import Document
from fastapi.testclient import TestClient

from app.main import app
from app.services import oracle_quiz, quiz_ai, quiz_storage
from app.services.oracle_quiz import OracleQuizError

TEMPLATE = Path(__file__).resolve().parents[2] / "docs" / "quiz" / "Plantilla_Quiz_ActivaIngles.docx"
SECRET = "secreto-de-prueba-con-longitud-suficiente-32"

PERFECT = {
    "S1-P1": "a", "S1-P2": False,
    "S2-P1": {"Good morning": "Buenos días", "Good night": "Buenas noches",
              "See you later": "Hasta luego", "Nice to meet you": "Mucho gusto"},
    "S2-P2": "b", "S3-P1": "meet", "S3-P2": "are", "S3-P3": "My",
    "S4-P1": "Hello! I'm Ana. Nice to meet you.",
}


def iso(moment: datetime.datetime) -> str:
    return moment.strftime("%Y-%m-%dT%H:%M:%SZ")


class FakeOracle:
    def __init__(self):
        self.quizzes = {1: {"quizId": 1, "title": "Quiz 1 · Temas 1 a 3", "afterTopicId": 3,
                            "afterTopicTitle": "Localización de lugares", "publishedVersionId": None}}
        self.versions: dict[int, dict] = {}
        self.attempts: dict[int, dict] = {}
        self.unlocked = {10, 11}

    # Académicos
    def admin_list(self):
        return [dict(q) for q in self.quizzes.values()]

    def get_quiz(self, quiz_id):
        if quiz_id not in self.quizzes:
            raise OracleQuizError(404, "QUIZ_NOT_FOUND", "no existe")
        versions = sorted((v for v in self.versions.values() if v["quizId"] == quiz_id),
                          key=lambda v: -v["versionNumber"])
        return {**self.quizzes[quiz_id], "versions": [
            {"versionId": v["versionId"], "versionNumber": v["versionNumber"], "status": v["status"]} for v in versions]}

    def get_version(self, version_id):
        if version_id not in self.versions:
            raise OracleQuizError(404, "VERSION_NOT_FOUND", "no existe")
        return copy.deepcopy(self.versions[version_id])

    def create_version(self, payload):
        version_id = len(self.versions) + 1
        number = 1 + sum(1 for v in self.versions.values() if v["quizId"] == payload["quizId"])
        self.versions[version_id] = {
            "versionId": version_id, "quizId": payload["quizId"], "versionNumber": number, "status": "BORRADOR",
            "title": payload["title"], "passingScore": payload["passingScore"], "maxAttempts": payload["maxAttempts"],
            "timeLimitMinutes": payload["timeLimitMinutes"], "totalPoints": payload["totalPoints"],
            "questionCount": payload["questionCount"], "docxObjectKey": payload["docxObjectKey"],
            "uploadedBy": payload["uploadedBy"],
            "definitionJson": json.dumps(payload["definition"]), "validationJson": json.dumps(payload["validation"]),
            "media": copy.deepcopy(payload["media"]),
        }
        return {"success": True, "versionId": version_id, "versionNumber": number}

    def _pending(self, version):
        return sum(1 for m in version["media"] if m["isUploaded"] == "N" and m["mediaType"] != "LINK")

    def save_media(self, payload):
        version = self.versions[payload["versionId"]]
        if version["status"] != "BORRADOR":
            raise OracleQuizError(409, "VERSION_NOT_EDITABLE", "publicada")
        item = next(m for m in version["media"] if m["fileName"] == payload["fileName"])
        item.update({k: payload[k] for k in ("objectKey", "sizeBytes", "sha256", "contentType")}, isUploaded="Y")
        return {"success": True, "versionId": version["versionId"], "pending": {"count": self._pending(version)}}

    def publish_version(self, version_id):
        version = self.versions[version_id]
        if self._pending(version):
            raise OracleQuizError(409, "MEDIA_PENDING", f"faltan {self._pending(version)} archivos por subir")
        for other in self.versions.values():
            if other["quizId"] == version["quizId"] and other["status"] == "PUBLICADA":
                other["status"] = "ARCHIVADA"
        version["status"] = "PUBLICADA"
        self.quizzes[version["quizId"]]["publishedVersionId"] = version_id
        return {"success": True, "quizId": version["quizId"], "versionId": version_id}

    def get_stats(self, quiz_id, version_id=None):
        version_id = version_id or self.quizzes[quiz_id]["publishedVersionId"]
        submitted = [a for a in self.attempts.values() if a["versionId"] == version_id and a["status"] == "ENTREGADO"]
        # Oracle ordena por clave (texto): S1-P1, S1-P2, S2-P1... y omite las preguntas sin respuestas
        keys = sorted({ans["questionKey"] for a in submitted for ans in a["answers"] if ans["studentAnswer"]})
        questions = []
        for key in keys:
            rows = [ans for a in submitted for ans in a["answers"] if ans["questionKey"] == key]
            questions.append({
                "questionKey": key, "questionType": rows[0]["questionType"], "answers": len(rows),
                "correct": sum(r["isCorrect"] == "Y" for r in rows), "partial": sum(r["isCorrect"] == "P" for r in rows),
                "successRate": round(100 * sum(r["pointsEarned"] / r["pointsPossible"] for r in rows) / len(rows), 1),
            })
        return {"success": True, "quizId": quiz_id, "versionId": version_id, "attempts": len(submitted),
                "students": len({a["idInscripcion"] for a in submitted}), "questions": questions}

    # Estudiantes
    def available(self, id_inscripcion):
        return [{"quizId": 1, "status": "ACTIVE" if id_inscripcion in self.unlocked else "LOCKED"}]

    def _record(self, attempt_id):
        attempt = self.attempts[attempt_id]
        version = self.versions[attempt["versionId"]]
        record = copy.deepcopy(attempt)
        for key in ("title", "passingScore", "maxAttempts", "timeLimitMinutes", "totalPoints",
                    "questionCount", "definitionJson", "media"):
            record[key] = copy.deepcopy(version[key])
        record["serverNow"] = iso(datetime.datetime.now(datetime.timezone.utc))
        return record

    def start_attempt(self, quiz_id, id_inscripcion):
        version_id = self.quizzes[quiz_id]["publishedVersionId"]
        if version_id is None:
            raise OracleQuizError(409, "QUIZ_NOT_PUBLISHED", "no publicado")
        if id_inscripcion not in self.unlocked:
            raise OracleQuizError(403, "QUIZ_LOCKED", "faltan misiones por completar antes del quiz")
        mine = [a for a in self.attempts.values() if a["quizId"] == quiz_id and a["idInscripcion"] == id_inscripcion]
        current = next((a for a in mine if a["status"] == "EN_CURSO"), None)
        if current:
            return {**self._record(current["attemptId"]), "resumed": "Y"}
        max_attempts = self.versions[version_id]["maxAttempts"]
        if max_attempts is not None and len(mine) >= max_attempts:
            raise OracleQuizError(409, "NO_ATTEMPTS_LEFT", "sin intentos")
        attempt_id = len(self.attempts) + 1
        now = datetime.datetime.now(datetime.timezone.utc)
        self.attempts[attempt_id] = {
            "attemptId": attempt_id, "quizId": quiz_id, "versionId": version_id, "idInscripcion": id_inscripcion,
            "attemptNumber": len(mine) + 1, "status": "EN_CURSO", "shuffleSeed": 1234, "resumed": "N",
            "startedAt": iso(now), "expiresAt": iso(now + datetime.timedelta(minutes=20)),
            "scorePoints": None, "maxPoints": None, "scorePercent": None, "passed": None, "xpEarned": 0,
            "bestScorePercent": None, "bestXp": None, "answers": [],
        }
        return self._record(attempt_id)

    def get_attempt(self, attempt_id):
        if attempt_id not in self.attempts:
            raise OracleQuizError(404, "ATTEMPT_NOT_FOUND", "no existe")
        return self._record(attempt_id)

    def finish_attempt(self, payload):
        attempt = self.attempts[payload["attemptId"]]
        if attempt["status"] != "EN_CURSO":
            raise OracleQuizError(409, "ATTEMPT_CLOSED", "cerrado")
        attempt.update(status="ENTREGADO", answers=payload["answers"],
                       **{k: payload[k] for k in ("scorePoints", "maxPoints", "scorePercent", "passed", "xpEarned")})
        return self._record(payload["attemptId"])

    def login_academico(self, id_academico, password):
        if (id_academico, password) == ("A001", "correcta"):
            return {"success": True, "academico": {"nombre": "Laura", "apellidoPaterno": "Pérez", "rol": "DOCENTE"}}
        return {"success": False, "message": "Credenciales inválidas"}


class FakeStorage:
    def __init__(self):
        self.objects: dict[str, bytes] = {}

    def upload_bytes(self, key, data, content_type):
        self.objects[key] = data

    def object_size(self, key):
        return len(self.objects[key]) if key in self.objects else None

    def signed_get_url(self, key, minutes=120, download_name=None):
        return f"https://storage.test/{key}?firma"

    def signed_put_url(self, key, content_type, minutes=30):
        return {"url": f"https://storage.test/{key}?subir", "method": "PUT", "headers": {"Content-Type": content_type}}

    def set_cache_control(self, key):
        self.cache_set = getattr(self, "cache_set", []) + [key]


@pytest.fixture
def fakes(monkeypatch):
    monkeypatch.setenv("QUIZ_JWT_SECRET", SECRET)
    oracle, storage = FakeOracle(), FakeStorage()
    for name in ("admin_list", "get_quiz", "get_version", "create_version", "save_media", "publish_version",
                 "get_stats", "available", "start_attempt", "get_attempt", "finish_attempt", "login_academico"):
        monkeypatch.setattr(oracle_quiz, name, getattr(oracle, name))
    for name in ("upload_bytes", "object_size", "signed_get_url", "signed_put_url", "set_cache_control"):
        monkeypatch.setattr(quiz_storage, name, getattr(storage, name))
    ai_calls = []
    monkeypatch.setattr(quiz_ai, "grade_open_answer",
                        lambda q, a: ai_calls.append(a) or {"score": 100, "feedback": "Muy bien."})
    return oracle, storage, ai_calls


@pytest.fixture
def client(fakes):
    return TestClient(app)


@pytest.fixture
def auth(client):
    response = client.post("/api/auth/academico", json={"idAcademico": "A001", "password": "correcta"})
    return {"Authorization": f"Bearer {response.json()['token']}"}


def upload(client, auth, data: bytes, name="quiz.docx"):
    return client.post("/api/quizzes/admin/1/upload", headers=auth,
                       files={"file": (name, data, "application/octet-stream")})


def publish_template(client, auth, fakes, max_attempts=None):
    oracle, storage, _ = fakes
    created = upload(client, auth, TEMPLATE.read_bytes()).json()
    version_id = created["versionId"]
    if max_attempts is not None:
        oracle.versions[version_id]["maxAttempts"] = max_attempts
    sha = "a" * 64
    client.post(f"/api/quizzes/admin/versions/{version_id}/media-upload-url", headers=auth,
                json={"fileName": "dialogo_saludos.mp3", "sha256": sha, "sizeBytes": 5})
    storage.objects[f"quizzes/1/media/{sha}.mp3"] = b"ID3xx"
    client.post(f"/api/quizzes/admin/versions/{version_id}/media-complete", headers=auth,
                json={"fileName": "dialogo_saludos.mp3", "sha256": sha})
    assert client.post(f"/api/quizzes/admin/versions/{version_id}/publish", headers=auth).status_code == 200
    return version_id


# ─────────────── Sesión de académicos ───────────────

def test_login_de_academico(client):
    response = client.post("/api/auth/academico", json={"idAcademico": "A001", "password": "correcta"})
    body = response.json()
    assert response.status_code == 200 and body["success"] is True
    assert body["academico"]["nombre"] == "Laura"
    payload = jwt.decode(body["token"], SECRET, algorithms=["HS256"], audience="activa-academico")
    assert payload["sub"] == "A001" and payload["rol"] == "DOCENTE"


def test_login_con_credenciales_incorrectas(client):
    response = client.post("/api/auth/academico", json={"idAcademico": "A001", "password": "mala"})
    assert response.status_code == 401
    assert response.json()["detail"] == {"code": "INVALID_CREDENTIALS", "message": "Credenciales inválidas"}


@pytest.mark.parametrize("headers", [
    {},
    {"Authorization": "Bearer token-falso"},
    {"Authorization": "Bearer " + jwt.encode({"sub": "A001", "aud": "activa-academico", "exp": 1}, SECRET)},
    {"Authorization": "Bearer " + jwt.encode({"sub": "A001", "aud": "activa-academico",
                                              "exp": int(time.time()) + 60}, "otro-secreto-distinto-de-32-bytes!")},
])
def test_las_rutas_de_academico_exigen_token_valido(client, headers):
    for method, path in (("get", "/api/quizzes/admin"), ("post", "/api/quizzes/admin/1/upload"),
                         ("post", "/api/quizzes/admin/versions/1/publish")):
        response = getattr(client, method)(path, headers=headers)
        assert response.status_code == 401, path


# ─────────────── Carga del Word ───────────────

def test_subir_la_plantilla_crea_borrador(client, auth, fakes):
    oracle, storage, _ = fakes
    body = upload(client, auth, TEMPLATE.read_bytes()).json()
    assert body["created"] is True and body["versionNumber"] == 1
    assert body["report"]["summary"] == "Se detectaron 4 secciones y 8 preguntas (14 puntos en total)."
    assert body["pendingFiles"] == ["dialogo_saludos.mp3"]
    version = oracle.versions[body["versionId"]]
    assert version["uploadedBy"] == "A001" and version["status"] == "BORRADOR"
    assert version["docxObjectKey"] in storage.objects
    image = next(m for m in version["media"] if m["mediaType"] == "IMAGE")
    assert image["isUploaded"] == "Y" and storage.objects[image["objectKey"]].startswith(b"\x89PNG")


def test_word_con_errores_no_crea_version(client, auth, fakes):
    document = Document(str(TEMPLATE))
    row = document.tables[2].rows[5]                      # Respuesta correcta de la pregunta 1
    row.cells[-1].paragraphs[0].text = "d"
    buffer = io.BytesIO()
    document.save(buffer)
    body = upload(client, auth, buffer.getvalue()).json()
    assert body["created"] is False and body["report"]["errorCount"] == 1
    assert fakes[0].versions == {}


def test_solo_se_aceptan_docx(client, auth):
    response = upload(client, auth, b"%PDF", name="quiz.pdf")
    assert response.status_code == 400 and response.json()["detail"]["code"] == "NOT_DOCX"


def test_quiz_inexistente(client, auth):
    response = client.post("/api/quizzes/admin/99/upload", headers=auth,
                           files={"file": ("q.docx", TEMPLATE.read_bytes(), "application/octet-stream")})
    assert response.status_code == 404 and response.json()["detail"]["code"] == "QUIZ_NOT_FOUND"


# ─────────────── Audios y publicación ───────────────

def test_flujo_de_audio_y_publicacion(client, auth, fakes):
    oracle, storage, _ = fakes
    version_id = upload(client, auth, TEMPLATE.read_bytes()).json()["versionId"]
    base = f"/api/quizzes/admin/versions/{version_id}"

    response = client.post(f"{base}/publish", headers=auth)
    assert response.status_code == 409 and response.json()["detail"]["code"] == "MEDIA_PENDING"

    response = client.post(f"{base}/media-upload-url", headers=auth,
                           json={"fileName": "otro.mp3", "sha256": "b" * 64, "sizeBytes": 10})
    assert response.status_code == 400 and "dialogo_saludos.mp3" in response.json()["detail"]["message"]

    response = client.post(f"{base}/media-upload-url", headers=auth,
                           json={"fileName": "DIALOGO_SALUDOS.MP3", "sha256": "b" * 64, "sizeBytes": 30 * 1024 * 1024})
    assert response.status_code == 413

    response = client.post(f"{base}/media-upload-url", headers=auth,
                           json={"fileName": "DIALOGO_SALUDOS.MP3", "sha256": "b" * 64, "sizeBytes": 10})
    body = response.json()
    assert body["alreadyUploaded"] is False and body["fileName"] == "dialogo_saludos.mp3"
    assert body["upload"]["headers"]["Content-Type"] == "audio/mpeg"

    complete = {"fileName": "dialogo_saludos.mp3", "sha256": "b" * 64}
    response = client.post(f"{base}/media-complete", headers=auth, json=complete)
    assert response.status_code == 409 and response.json()["detail"]["code"] == "UPLOAD_NOT_FOUND"

    assert set(body["upload"]["headers"]) == {"Content-Type"}   # el CORS del bucket solo permite ese encabezado
    storage.objects[body["objectKey"]] = b"0123456789"     # el navegador subió el archivo
    assert client.post(f"{base}/media-complete", headers=auth, json=complete).json()["pending"] == 0
    assert storage.cache_set == [body["objectKey"]]

    detail = client.get(base, headers=auth).json()
    assert detail["pendingFiles"] == []
    assert detail["preview"]["sections"][0]["media"]["url"].startswith("https://storage.test/quizzes/1/media/")
    assert "answer" not in detail["preview"]["sections"][0]["questions"][0]
    assert detail["definition"]["sections"][0]["questions"][0]["answer"] == "a"   # el académico sí ve respuestas

    assert client.post(f"{base}/publish", headers=auth).status_code == 200
    response = client.post(f"{base}/media-upload-url", headers=auth,
                           json={"fileName": "dialogo_saludos.mp3", "sha256": "c" * 64, "sizeBytes": 10})
    assert response.status_code == 409 and response.json()["detail"]["code"] == "VERSION_NOT_EDITABLE"


def test_segunda_version_reutiliza_el_audio(client, auth, fakes):
    publish_template(client, auth, fakes)
    body = upload(client, auth, TEMPLATE.read_bytes()).json()
    assert body["versionNumber"] == 2
    assert body["pendingFiles"] == [] and body["reusedFiles"] == ["dialogo_saludos.mp3"]


def test_archivo_ya_en_el_bucket_no_se_vuelve_a_subir(client, auth, fakes):
    oracle, storage, _ = fakes
    version_id = upload(client, auth, TEMPLATE.read_bytes()).json()["versionId"]
    storage.objects[f"quizzes/1/media/{'d' * 64}.mp3"] = b"12345"
    body = client.post(f"/api/quizzes/admin/versions/{version_id}/media-upload-url", headers=auth,
                       json={"fileName": "dialogo_saludos.mp3", "sha256": "d" * 64, "sizeBytes": 5}).json()
    assert body == {"alreadyUploaded": True, "fileName": "dialogo_saludos.mp3", "pending": 0}


def test_vista_previa_calificada_no_guarda_nada(client, auth, fakes):
    version_id = upload(client, auth, TEMPLATE.read_bytes()).json()["versionId"]
    body = client.post(f"/api/quizzes/admin/versions/{version_id}/grade", headers=auth,
                       json={"answers": PERFECT}).json()
    assert body["scorePercent"] == 100 and body["questions"][0]["correctAnswer"]["key"] == "a"
    assert fakes[0].attempts == {}


def test_descargar_el_word(client, auth, fakes):
    version_id = upload(client, auth, TEMPLATE.read_bytes()).json()["versionId"]
    body = client.get(f"/api/quizzes/admin/versions/{version_id}/docx", headers=auth).json()
    assert body["fileName"] == "Quiz1_version1.docx" and body["url"].startswith("https://storage.test/quizzes/1/docx/")


# ─────────────── Estudiantes ───────────────

def test_el_estudiante_no_recibe_respuestas(client, auth, fakes):
    publish_template(client, auth, fakes)
    response = client.post("/api/quizzes/1/start", json={"idInscripcion": 10})
    body = response.json()
    assert response.status_code == 200 and body["status"] == "EN_CURSO" and "result" not in body
    text = json.dumps(body, ensure_ascii=False)
    for secret in ('"answer"', "acceptedAnswers", "criteria", "modelAnswer", '"pairs"', "They say", "definitionJson"):
        assert secret not in text, secret
    assert body["quiz"]["sections"][0]["media"]["url"].startswith("https://storage.test/")

    again = client.post("/api/quizzes/1/start", json={"idInscripcion": 10}).json()
    assert again["attemptId"] == body["attemptId"] and again["resumed"] == "Y"


def test_entregar_todo_correcto(client, auth, fakes):
    publish_template(client, auth, fakes, max_attempts=2)
    attempt_id = client.post("/api/quizzes/1/start", json={"idInscripcion": 10}).json()["attemptId"]
    body = client.post(f"/api/quizzes/attempts/{attempt_id}/submit",
                       json={"idInscripcion": 10, "answers": PERFECT}).json()
    result = body["result"]
    assert body["status"] == "ENTREGADO"
    assert result["scorePercent"] == 100 and result["passed"] == "Y" and result["xpEarned"] == 200
    assert result["revealAnswers"] is True                # aprobó: ve las respuestas
    assert result["questions"][7]["aiFeedback"] == "Muy bien."
    assert fakes[2] == [PERFECT["S4-P1"]]

    response = client.post(f"/api/quizzes/attempts/{attempt_id}/submit", json={"idInscripcion": 10, "answers": {}})
    assert response.status_code == 409 and response.json()["detail"]["code"] == "ATTEMPT_CLOSED"


def test_reprobado_con_intentos_no_ve_respuestas(client, auth, fakes):
    publish_template(client, auth, fakes, max_attempts=2)
    attempt_id = client.post("/api/quizzes/1/start", json={"idInscripcion": 10}).json()["attemptId"]
    body = client.post(f"/api/quizzes/attempts/{attempt_id}/submit",
                       json={"idInscripcion": 10, "answers": {"S1-P1": "b"}}).json()
    result = body["result"]
    assert result["passed"] == "N" and result["revealAnswers"] is False
    text = json.dumps(body, ensure_ascii=False)
    assert "correctAnswer" not in text and "They say" not in text
    assert fakes[2] == []                                 # la abierta vacía no se manda a la IA

    second = client.post("/api/quizzes/1/start", json={"idInscripcion": 10}).json()
    final = client.post(f"/api/quizzes/attempts/{second['attemptId']}/submit",
                        json={"idInscripcion": 10, "answers": {}}).json()
    assert final["result"]["revealAnswers"] is True       # sin intentos: ya puede ver las respuestas

    response = client.post("/api/quizzes/1/start", json={"idInscripcion": 10})
    assert response.status_code == 409 and response.json()["detail"]["code"] == "NO_ATTEMPTS_LEFT"


def test_estudiante_bloqueado(client, auth, fakes):
    publish_template(client, auth, fakes)
    response = client.post("/api/quizzes/1/start", json={"idInscripcion": 99})
    assert response.status_code == 403
    assert response.json()["detail"]["code"] == "QUIZ_LOCKED"


def test_no_se_ve_el_intento_de_otro_estudiante(client, auth, fakes):
    publish_template(client, auth, fakes)
    attempt_id = client.post("/api/quizzes/1/start", json={"idInscripcion": 10}).json()["attemptId"]
    assert client.get(f"/api/quizzes/attempts/{attempt_id}", params={"idInscripcion": 11}).status_code == 404
    response = client.post(f"/api/quizzes/attempts/{attempt_id}/submit", json={"idInscripcion": 11, "answers": {}})
    assert response.status_code == 404
    assert client.get(f"/api/quizzes/attempts/{attempt_id}", params={"idInscripcion": 10}).json()["status"] == "EN_CURSO"


def test_tiempo_vencido(client, auth, fakes):
    publish_template(client, auth, fakes)
    attempt_id = client.post("/api/quizzes/1/start", json={"idInscripcion": 10}).json()["attemptId"]
    fakes[0].attempts[attempt_id]["expiresAt"] = iso(datetime.datetime.now(datetime.timezone.utc)
                                                     - datetime.timedelta(minutes=5))
    response = client.post(f"/api/quizzes/attempts/{attempt_id}/submit", json={"idInscripcion": 10, "answers": PERFECT})
    assert response.status_code == 409 and fakes[2] == []


# ─────────────── Resultados para el académico ───────────────

def test_resultados_por_pregunta_con_texto_y_en_orden(client, auth, fakes):
    version_id = publish_template(client, auth, fakes)
    for inscripcion, answers in ((10, PERFECT), (11, {"S1-P1": "b", "S3-P1": "meet"})):
        attempt_id = client.post("/api/quizzes/1/start", json={"idInscripcion": inscripcion}).json()["attemptId"]
        client.post(f"/api/quizzes/attempts/{attempt_id}/submit", json={"idInscripcion": inscripcion, "answers": answers})

    body = client.get("/api/quizzes/admin/1/stats", headers=auth).json()
    assert body["versionId"] == version_id and body["versionNumber"] == 1 and body["passingScore"] == 70
    assert body["attempts"] == 2 and body["students"] == 2
    questions = body["questions"]
    assert [q["number"] for q in questions] == list(range(1, 9))          # las 8, en el orden del quiz
    first = questions[0]
    assert first["prompt"] == "What time of day is it in the conversation?" and first["section"] == "Listening"
    assert first["answers"] == 2 and first["correct"] == 1 and first["successRate"] == 50
    fill = questions[4]
    assert fill["questionKey"] == "S3-P1" and fill["successRate"] == 100
    assert all("answer" not in q and "acceptedAnswers" not in q for q in questions)


def test_resultados_sin_intentos(client, auth, fakes):
    publish_template(client, auth, fakes)
    body = client.get("/api/quizzes/admin/1/stats", headers=auth).json()
    assert body["attempts"] == 0 and len(body["questions"]) == 8
    assert all(q["answers"] == 0 and q["successRate"] is None for q in body["questions"])


def test_resultados_de_un_quiz_sin_publicar(client, auth, fakes):
    body = client.get("/api/quizzes/admin/1/stats", headers=auth).json()
    assert body["questions"] == []


def test_resultados_exigen_token(client):
    assert client.get("/api/quizzes/admin/1/stats").status_code == 401
