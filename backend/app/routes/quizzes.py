"""Rutas de quizzes.

Académicos (requieren el token de /api/auth/academico):
    GET  /quizzes/admin                                  lista para el Content Manager
    GET  /quizzes/admin/{quiz_id}                        quiz con historial de versiones
    POST /quizzes/admin/{quiz_id}/upload                 sube el Word: reporte y versión en borrador
    GET  /quizzes/admin/versions/{version_id}            versión: reporte, archivos y vista previa
    POST /quizzes/admin/versions/{version_id}/media-upload-url   URL para subir un audio/video
    POST /quizzes/admin/versions/{version_id}/media-complete     confirma la subida
    POST /quizzes/admin/versions/{version_id}/grade      califica la vista previa (no guarda nada)
    POST /quizzes/admin/versions/{version_id}/publish    publica la versión
    GET  /quizzes/admin/versions/{version_id}/docx       descarga el Word de esa versión
    GET  /quizzes/admin/{quiz_id}/stats                  resultados por pregunta

Estudiantes (identificados por idInscripcion, igual que el resto de la app hoy):
    GET  /quizzes/available/{id_inscripcion}             quizzes y su estado
    POST /quizzes/{quiz_id}/start                        crea o reanuda un intento (sin respuestas)
    GET  /quizzes/attempts/{attempt_id}?idInscripcion=   intento en curso o resultado
    POST /quizzes/attempts/{attempt_id}/submit           califica y guarda el intento
"""

import datetime
import hashlib
import json
from typing import Any

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel, Field

from app.services import oracle_quiz as oracle
from app.services import quiz_ai
from app.services import quiz_storage as storage
from app.services.auth_service import require_academico
from app.services.quiz_grading import finish_payload, grade, results_view, student_view, with_media_urls
from app.services.quiz_validator import AUDIO_TYPES, VIDEO_TYPES, analyze_docx

router = APIRouter(prefix="/quizzes")

DOCX_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
MAX_DOCX_BYTES = 25 * 1024 * 1024
MAX_AUDIO_BYTES = 20 * 1024 * 1024
MAX_VIDEO_BYTES = 200 * 1024 * 1024
SUBMIT_GRACE = datetime.timedelta(minutes=2)   # la misma tolerancia que PKG_QUIZ
PLAYABLE = ("AUDIO", "VIDEO")


def _fail(status: int, code: str, message: str) -> HTTPException:
    return HTTPException(status_code=status, detail={"code": code, "message": message})


def _media_urls(media: list[dict]) -> dict[str, str]:
    """URL firmada (2 horas) de cada imagen y audio ya subidos."""
    return {
        m["fileName"]: storage.signed_get_url(m["objectKey"])
        for m in media or []
        if m.get("isUploaded") == "Y" and m.get("objectKey") and m.get("mediaType") != "LINK"
    }


def _definition(record: dict) -> dict:
    return json.loads(record.get("definitionJson") or "{}")


def _required_media(version: dict, file_name: str) -> dict:
    target = next(
        (m for m in version.get("media", [])
         if m["mediaType"] in PLAYABLE and m["fileName"].lower() == file_name.strip().lower()),
        None,
    )
    if target is None:
        expected = [m["fileName"] for m in version.get("media", []) if m["mediaType"] in PLAYABLE]
        raise _fail(400, "FILE_NOT_REQUIRED",
                    f"El Word no menciona un archivo llamado «{file_name}». "
                    + (f"Archivos esperados: {', '.join(expected)}." if expected else "Este quiz no usa audios ni videos."))
    return target


def _editable_version(version_id: int) -> dict:
    version = oracle.get_version(version_id)
    if version["status"] != "BORRADOR":
        raise _fail(409, "VERSION_NOT_EDITABLE", "Esta versión ya fue publicada; para cambiarla sube el Word de nuevo.")
    return version


def _reuse_previous_media(quiz: dict, media: list[dict]) -> list[str]:
    """Audios que ya se subieron en versiones anteriores con el mismo nombre: no hay que subirlos otra vez."""
    needed = {m["fileName"].lower(): m for m in media if m["mediaType"] in PLAYABLE and m["isUploaded"] != "Y"}
    reused = []
    for version in quiz.get("versions", [])[:5]:
        if not needed:
            break
        for previous in oracle.get_version(version["versionId"]).get("media", []):
            target = needed.get(previous["fileName"].lower())
            if target and previous.get("isUploaded") == "Y" and previous.get("objectKey"):
                target.update(objectKey=previous["objectKey"], sha256=previous.get("sha256"),
                              sizeBytes=previous.get("sizeBytes"), isUploaded="Y")
                reused.append(target["fileName"])
                del needed[previous["fileName"].lower()]
    return reused


# ───────────────────────────── Académicos ─────────────────────────────

@router.get("/admin")
def admin_list(academico: dict = Depends(require_academico)):
    return oracle.admin_list()


@router.get("/admin/{quiz_id}")
def admin_quiz(quiz_id: int, academico: dict = Depends(require_academico)):
    return oracle.get_quiz(quiz_id)


@router.post("/admin/{quiz_id}/upload")
def upload_docx(quiz_id: int, file: UploadFile = File(...), academico: dict = Depends(require_academico)):
    """Lee el Word. Con errores solo devuelve el reporte; sin errores guarda el Word y las imágenes
    en el bucket y crea una versión en borrador. Los audios se suben después (media-upload-url)."""
    if not (file.filename or "").lower().endswith(".docx"):
        raise _fail(400, "NOT_DOCX", "Sube el quiz como documento de Word (.docx).")
    data = file.file.read(MAX_DOCX_BYTES + 1)
    if len(data) > MAX_DOCX_BYTES:
        raise _fail(413, "FILE_TOO_LARGE", "El Word pesa más de 25 MB. Reduce el tamaño de las imágenes.")

    quiz = oracle.get_quiz(quiz_id)
    build = analyze_docx(data)
    if not build.ok:
        return {"created": False, "report": build.report}

    docx_key = storage.docx_key(quiz_id, hashlib.sha256(data).hexdigest())
    storage.upload_bytes(docx_key, data, DOCX_CONTENT_TYPE)

    media = [dict(m) for m in build.media]
    for item in media:
        if item["mediaType"] == "IMAGE":
            image = build.images[item["fileName"]]
            key = storage.media_key(quiz_id, image.sha256, image.extension)
            if storage.object_size(key) is None:
                storage.upload_bytes(key, image.data, image.content_type)
            item.update(objectKey=key, isUploaded="Y")
    reused = _reuse_previous_media(quiz, media)

    definition = build.definition
    created = oracle.create_version({
        "quizId": quiz_id,
        "uploadedBy": academico["sub"],
        "title": definition["title"],
        "passingScore": definition["passingScore"],
        "maxAttempts": definition["maxAttempts"],
        "timeLimitMinutes": definition["timeLimitMinutes"],
        "totalPoints": definition["totalPoints"],
        "questionCount": definition["questionCount"],
        "docxObjectKey": docx_key,
        "definition": definition,
        "validation": build.report,
        "media": media,
    })
    return {
        "created": True,
        "versionId": created["versionId"],
        "versionNumber": created["versionNumber"],
        "report": build.report,
        "pendingFiles": [m["fileName"] for m in media if m["mediaType"] in PLAYABLE and m["isUploaded"] != "Y"],
        "reusedFiles": reused,
    }


@router.get("/admin/versions/{version_id}")
def admin_version(version_id: int, academico: dict = Depends(require_academico)):
    version = oracle.get_version(version_id)
    definition = _definition(version)
    report = json.loads(version.pop("validationJson") or "null")
    version.pop("definitionJson", None)
    urls = _media_urls(version.get("media", []))
    for item in version.get("media", []):
        item["url"] = urls.get(item["fileName"]) or item.get("url")
    return {
        **version,
        "report": report,
        "pendingFiles": [m["fileName"] for m in version.get("media", [])
                         if m["mediaType"] in PLAYABLE and m["isUploaded"] != "Y"],
        "definition": with_media_urls(definition, urls),
        "preview": student_view(definition, urls, seed=version_id),
    }


class MediaUploadRequest(BaseModel):
    fileName: str = Field(min_length=1, max_length=255)
    sha256: str = Field(pattern=r"^[a-f0-9]{64}$")
    sizeBytes: int = Field(gt=0)


@router.post("/admin/versions/{version_id}/media-upload-url")
def media_upload_url(version_id: int, request: MediaUploadRequest, academico: dict = Depends(require_academico)):
    version = _editable_version(version_id)
    target = _required_media(version, request.fileName)
    extension = target["fileName"].rsplit(".", 1)[-1].lower()
    content_type = AUDIO_TYPES.get(extension) or VIDEO_TYPES[extension]
    limit = MAX_AUDIO_BYTES if target["mediaType"] == "AUDIO" else MAX_VIDEO_BYTES
    if request.sizeBytes > limit:
        raise _fail(413, "FILE_TOO_LARGE",
                    f"«{target['fileName']}» pesa más de {limit // (1024 * 1024)} MB. Usa una versión más ligera.")

    key = storage.media_key(version["quizId"], request.sha256, extension)
    if storage.object_size(key) == request.sizeBytes:
        # El mismo archivo ya está en el bucket (otra versión o un reintento): solo se registra
        saved = oracle.save_media({"versionId": version_id, "fileName": target["fileName"],
                                   "mediaType": target["mediaType"], "objectKey": key, "contentType": content_type,
                                   "sizeBytes": request.sizeBytes, "sha256": request.sha256})
        return {"alreadyUploaded": True, "fileName": target["fileName"], "pending": saved["pending"]["count"]}

    return {
        "alreadyUploaded": False,
        "fileName": target["fileName"],
        "objectKey": key,
        "upload": storage.signed_put_url(key, content_type),
    }


class MediaCompleteRequest(BaseModel):
    fileName: str = Field(min_length=1, max_length=255)
    sha256: str = Field(pattern=r"^[a-f0-9]{64}$")


@router.post("/admin/versions/{version_id}/media-complete")
def media_complete(version_id: int, request: MediaCompleteRequest, academico: dict = Depends(require_academico)):
    version = _editable_version(version_id)
    target = _required_media(version, request.fileName)
    extension = target["fileName"].rsplit(".", 1)[-1].lower()
    key = storage.media_key(version["quizId"], request.sha256, extension)
    size = storage.object_size(key)
    if size is None:
        raise _fail(409, "UPLOAD_NOT_FOUND", f"«{target['fileName']}» todavía no llega al servidor. Vuelve a subirlo.")
    storage.set_cache_control(key)
    saved = oracle.save_media({"versionId": version_id, "fileName": target["fileName"],
                               "mediaType": target["mediaType"], "objectKey": key,
                               "contentType": AUDIO_TYPES.get(extension) or VIDEO_TYPES[extension],
                               "sizeBytes": size, "sha256": request.sha256})
    return {"fileName": target["fileName"], "pending": saved["pending"]["count"]}


class GradeRequest(BaseModel):
    answers: dict[str, Any] = {}


@router.post("/admin/versions/{version_id}/grade")
def preview_grade(version_id: int, request: GradeRequest, academico: dict = Depends(require_academico)):
    """Para que el académico conteste su vista previa y vea cómo se califica. No guarda nada."""
    version = oracle.get_version(version_id)
    definition = _definition(version)
    graded = grade(definition, request.answers, quiz_ai.grade_open_answer)
    urls = _media_urls(version.get("media", []))
    return {**{k: v for k, v in graded.items() if k != "answers"},
            "questions": results_view(definition, graded["answers"], True, urls)}


@router.post("/admin/versions/{version_id}/publish")
def publish(version_id: int, academico: dict = Depends(require_academico)):
    return oracle.publish_version(version_id)


@router.get("/admin/versions/{version_id}/docx")
def download_docx(version_id: int, academico: dict = Depends(require_academico)):
    version = oracle.get_version(version_id)
    if not version.get("docxObjectKey"):
        raise _fail(404, "DOCX_NOT_FOUND", "Esta versión no tiene Word guardado.")
    name = f"Quiz{version['quizId']}_version{version['versionNumber']}.docx"
    return {"url": storage.signed_get_url(version["docxObjectKey"], minutes=15, download_name=name), "fileName": name}


@router.get("/admin/{quiz_id}/stats")
def stats(quiz_id: int, versionId: int | None = None, academico: dict = Depends(require_academico)):
    """Resultados de una versión (por defecto la publicada). Oracle agrupa por clave de pregunta;
    aquí se agrega el texto, la sección y los puntos, en el orden del quiz, incluidas las
    preguntas que nadie ha contestado."""
    data = oracle.get_stats(quiz_id, versionId)
    version_id = data.get("versionId")
    if not version_id:
        return {**data, "questions": []}

    version = oracle.get_version(version_id)
    definition = _definition(version)
    by_key = {q["questionKey"]: q for q in data.get("questions", [])}
    data["questions"] = [
        {
            "questionKey": question["key"],
            "number": question["number"],
            "type": question["type"],
            "prompt": question["prompt"],
            "section": section["name"],
            "points": question["points"],
            "answers": by_key.get(question["key"], {}).get("answers", 0),
            "correct": by_key.get(question["key"], {}).get("correct", 0),
            "partial": by_key.get(question["key"], {}).get("partial", 0),
            "successRate": by_key.get(question["key"], {}).get("successRate"),
        }
        for section in definition.get("sections", [])
        for question in section.get("questions", [])
    ]
    data["versionNumber"] = version.get("versionNumber")
    data["passingScore"] = version.get("passingScore")
    return data


# ───────────────────────────── Estudiantes ─────────────────────────────

def _attempt_response(attempt: dict) -> dict:
    definition = _definition(attempt)
    urls = _media_urls(attempt.get("media", []))
    response = {key: attempt.get(key) for key in (
        "attemptId", "quizId", "versionId", "attemptNumber", "status", "resumed", "startedAt", "expiresAt",
        "serverNow", "title", "passingScore", "maxAttempts", "timeLimitMinutes", "totalPoints", "questionCount",
        "bestScorePercent", "bestXp")}

    if attempt["status"] == "EN_CURSO":
        response["quiz"] = student_view(definition, urls, attempt["shuffleSeed"])
        return response

    max_attempts = attempt.get("maxAttempts")
    # Las respuestas correctas solo se muestran si aprobó o ya no le quedan intentos
    reveal = attempt.get("passed") == "Y" or (max_attempts is not None and attempt["attemptNumber"] >= max_attempts)
    response["result"] = {
        "scorePoints": attempt.get("scorePoints"),
        "maxPoints": attempt.get("maxPoints") or definition.get("totalPoints"),
        "scorePercent": attempt.get("scorePercent") or 0,
        "passed": attempt.get("passed") or "N",
        "xpEarned": attempt.get("xpEarned") or 0,
        "revealAnswers": reveal,
        "questions": results_view(definition, attempt.get("answers", []), reveal, urls),
    }
    return response


def _own_attempt(attempt_id: int, id_inscripcion: int) -> dict:
    attempt = oracle.get_attempt(attempt_id)
    if attempt["idInscripcion"] != id_inscripcion:
        raise _fail(404, "ATTEMPT_NOT_FOUND", "No se encontró el intento.")
    return attempt


@router.get("/available/{id_inscripcion}")
def available(id_inscripcion: int):
    return oracle.available(id_inscripcion)


class StartRequest(BaseModel):
    idInscripcion: int


@router.post("/{quiz_id}/start")
def start(quiz_id: int, request: StartRequest):
    return _attempt_response(oracle.start_attempt(quiz_id, request.idInscripcion))


@router.get("/attempts/{attempt_id}")
def attempt(attempt_id: int, idInscripcion: int):
    return _attempt_response(_own_attempt(attempt_id, idInscripcion))


class SubmitRequest(BaseModel):
    idInscripcion: int
    answers: dict[str, Any] = {}


@router.post("/attempts/{attempt_id}/submit")
def submit(attempt_id: int, request: SubmitRequest):
    attempt = _own_attempt(attempt_id, request.idInscripcion)
    if attempt["status"] != "EN_CURSO":
        raise _fail(409, "ATTEMPT_CLOSED", "Este intento ya se entregó o se terminó el tiempo.")
    if attempt.get("expiresAt"):
        expires = datetime.datetime.fromisoformat(attempt["expiresAt"].replace("Z", "+00:00"))
        if datetime.datetime.now(datetime.timezone.utc) > expires + SUBMIT_GRACE:
            raise _fail(409, "ATTEMPT_CLOSED", "Se terminó el tiempo de este intento.")

    graded = grade(_definition(attempt), request.answers, quiz_ai.grade_open_answer)
    return _attempt_response(oracle.finish_attempt(finish_payload(attempt_id, graded)))
