"""Pruebas de la calificación y de lo que se envía al navegador del estudiante."""

import json
from pathlib import Path

import pytest

from app.services.quiz_grading import (
    finish_payload, grade, normalize_answer, questions, results_view, student_view,
)
from app.services.quiz_validator import analyze_docx

TEMPLATE = Path(__file__).resolve().parents[2] / "docs" / "quiz" / "Plantilla_Quiz_ActivaIngles.docx"

# Respuestas correctas de la plantilla aprobada
PERFECT = {
    "S1-P1": "a",
    "S1-P2": False,
    "S2-P1": {"Good morning": "Buenos días", "Good night": "Buenas noches",
              "See you later": "Hasta luego", "Nice to meet you": "Mucho gusto"},
    "S2-P2": "b",
    "S3-P1": "meet",
    "S3-P2": "are",
    "S3-P3": "Her",
    "S4-P1": "Hello! My name is Ana. Nice to meet you.",
}


@pytest.fixture(scope="module")
def definition():
    return analyze_docx(TEMPLATE.read_bytes()).definition


def ai_grader(score):
    calls = []

    def grader(question, answer):
        calls.append((question["key"], answer))
        return {"score": score, "feedback": "Buen saludo."}

    grader.calls = calls
    return grader


# ─────────────── Vista del estudiante ───────────────

def test_la_vista_del_estudiante_no_revela_respuestas(definition):
    view = student_view(definition, {}, seed=7)
    for q in questions(view):
        for hidden in ("answer", "acceptedAnswers", "criteria", "modelAnswer", "feedback", "pairs"):
            assert hidden not in q, f"{q['key']} incluye {hidden}"
    text = json.dumps(view, ensure_ascii=False)
    for secret in ("They say “Good morning”", "Usa un saludo", "My name is Carlos", '"meet"'):
        assert secret not in text


def test_relacionar_se_presenta_revuelto_y_estable(definition):
    view_a = student_view(definition, {}, seed=7)
    view_b = student_view(definition, {}, seed=7)
    match_a = next(q for q in questions(view_a) if q["type"] == "matching")
    match_b = next(q for q in questions(view_b) if q["type"] == "matching")
    assert match_a["left"] == ["Good morning", "Good night", "See you later", "Nice to meet you"]
    assert sorted(match_a["right"]) == sorted(["Buenos días", "Buenas noches", "Hasta luego", "Mucho gusto"])
    assert match_a["right"] == match_b["right"]          # misma semilla, mismo orden al recargar
    orders = {tuple(next(q for q in questions(student_view(definition, {}, s)) if q["type"] == "matching")["right"])
              for s in range(20)}
    assert len(orders) > 1                               # distintos intentos, distinto orden


def test_la_vista_agrega_las_urls_de_los_archivos(definition):
    image = questions(definition)[3]["image"]["fileName"]
    view = student_view(definition, {"dialogo_saludos.mp3": "https://audio", image: "https://imagen"}, seed=1)
    assert view["sections"][0]["media"]["url"] == "https://audio"
    assert questions(view)[3]["image"]["url"] == "https://imagen"
    assert "url" not in (questions(definition)[3]["image"])   # no modifica la original


# ─────────────── Calificación ───────────────

def test_todo_correcto(definition):
    grader = ai_grader(100)
    graded = grade(definition, PERFECT, grader)
    assert graded["scorePoints"] == 14 and graded["maxPoints"] == 14
    assert graded["scorePercent"] == 100 and graded["passed"] == "Y" and graded["xpEarned"] == 200
    assert all(a["isCorrect"] == "Y" for a in graded["answers"])
    assert grader.calls == [("S4-P1", PERFECT["S4-P1"])]


def test_sin_responder_nada(definition):
    grader = ai_grader(100)
    graded = grade(definition, {}, grader)
    assert graded["scorePoints"] == 0 and graded["scorePercent"] == 0
    assert graded["passed"] == "N" and graded["xpEarned"] == 0
    assert grader.calls == []                            # una respuesta abierta vacía no gasta IA


def test_calificacion_parcial_y_xp(definition):
    answers = dict(PERFECT)
    answers["S1-P1"] = "b"                                # -2
    answers["S2-P1"] = {"Good morning": "Buenos días", "Good night": "Hasta luego",
                        "See you later": "Buenas noches", "Nice to meet you": "Mucho gusto"}   # 2 de 4 -> -2
    graded = grade(definition, answers, ai_grader(50))    # abierta 3 pts al 50 % -> -1.5
    by_key = {a["questionKey"]: a for a in graded["answers"]}
    assert by_key["S1-P1"]["isCorrect"] == "N"
    assert by_key["S2-P1"]["isCorrect"] == "P" and by_key["S2-P1"]["pointsEarned"] == 2
    assert by_key["S4-P1"]["isCorrect"] == "P" and by_key["S4-P1"]["pointsEarned"] == 1.5
    assert by_key["S4-P1"]["aiFeedback"] == "Buen saludo."
    assert graded["scorePoints"] == 8.5
    assert graded["scorePercent"] == 60.71
    assert graded["passed"] == "N"                        # aprueba con 70
    assert graded["xpEarned"] == 121


@pytest.mark.parametrize("answer, ok", [
    ("meet", True), ("Meet.", True), ("  MEET ", True), ("meat", False), ("", False), (None, False)])
def test_completar_tolera_mayusculas_y_punto(definition, answer, ok):
    graded = grade(definition, {"S3-P1": answer}, ai_grader(0))
    assert (graded["answers"][4]["isCorrect"] == "Y") is ok


def test_completar_acepta_cualquiera_de_las_respuestas(definition):
    for answer in ("My", "her"):
        assert grade(definition, {"S3-P3": answer}, ai_grader(0))["answers"][6]["isCorrect"] == "Y"


@pytest.mark.parametrize("answer, ok", [(False, True), ("false", True), ("Falso", True), (True, False), ("x", False)])
def test_verdadero_o_falso(definition, answer, ok):
    assert (grade(definition, {"S1-P2": answer}, ai_grader(0))["answers"][1]["isCorrect"] == "Y") is ok


def test_opcion_multiple_acepta_mayuscula(definition):
    assert grade(definition, {"S1-P1": "A"}, ai_grader(0))["answers"][0]["isCorrect"] == "Y"


def test_la_ia_no_puede_dar_mas_de_100(definition):
    graded = grade(definition, {"S4-P1": "hola"}, lambda q, a: {"score": 500, "feedback": ""})
    assert graded["answers"][7]["pointsEarned"] == 3


def test_respuestas_de_otro_tipo_no_rompen(definition):
    weird = {"S1-P1": ["a"], "S2-P1": "texto", "S3-P1": 42, "S1-P2": {"x": 1}}
    graded = grade(definition, weird, ai_grader(0))
    assert graded["scorePoints"] == 0


def test_payload_para_oracle(definition):
    payload = finish_payload(10, grade(definition, PERFECT, ai_grader(100)))
    assert payload["attemptId"] == 10 and len(payload["answers"]) == 8
    matching = payload["answers"][2]
    assert isinstance(matching["studentAnswer"], str) and json.loads(matching["studentAnswer"])["Good night"]
    assert {a["questionType"] for a in payload["answers"]} == {
        "multiple_choice", "true_false", "matching", "fill_blank", "open"}


# ─────────────── Resultados ───────────────

def test_resultados_sin_revelar(definition):
    saved = grade(definition, PERFECT, ai_grader(100))["answers"]
    results = results_view(definition, saved, reveal=False, media_urls={})
    assert all("correctAnswer" not in r and "feedback" not in r for r in results)
    assert results[2]["studentAnswer"]["Good morning"] == "Buenos días"   # el JSON guardado se recupera
    assert results[1]["studentAnswer"] is False


def test_resultados_revelando(definition):
    results = results_view(definition, [], reveal=True, media_urls={})
    assert results[0]["correctAnswer"] == {"key": "a", "text": "In the morning"}
    assert results[0]["feedback"].startswith("They say")
    assert results[1]["correctAnswer"] is False
    assert results[6]["correctAnswer"] == ["My", "Her"]
    assert results[7]["correctAnswer"].startswith("Hello! My name is Carlos")
    assert all(r["isCorrect"] == "N" for r in results)    # intento expirado sin respuestas


def test_normalize_answer():
    assert normalize_answer("  I’M   Fine!! ") == "i'm fine"
    assert normalize_answer('"Hello."') == "hello"


# ─────────────── IA de respuestas abiertas (sin llamar a OpenAI) ───────────────

class _FakeOpenAI:
    def __init__(self, content):
        message = type("M", (), {"content": content})
        choice = type("C", (), {"message": message})
        self.chat = type("Chat", (), {"completions": self})
        self._response = type("R", (), {"choices": [choice]})

    def create(self, **kwargs):
        self.kwargs = kwargs
        return self._response


@pytest.mark.parametrize("content, score", [
    ('{"in_english": true, "score": 85, "feedback": "Bien."}', 85),
    ('{"in_english": false, "score": 70, "feedback": "Bien."}', 0),   # en español: 0 aunque la IA diga 70
    ('{"in_english": true, "score": "mucho", "feedback": ""}', 0),
    ('{"in_english": true, "score": 140}', 100),
])
def test_calificador_de_ia(monkeypatch, definition, content, score):
    from app.services import quiz_ai
    fake = _FakeOpenAI(content)
    monkeypatch.setattr(quiz_ai, "_client", fake)
    question = questions(definition)[7]
    result = quiz_ai.grade_open_answer(question, "Hello, I am Ana.")
    assert result["score"] == score
    prompt = fake.kwargs["messages"][1]["content"]
    assert "<answer>\nHello, I am Ana.\n</answer>" in prompt and "Usa un saludo" in prompt
