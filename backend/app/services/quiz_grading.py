"""Calificación de quizzes y las vistas que se envían al navegador.

- student_view: el quiz para presentarlo. NUNCA incluye respuestas, criterios, respuesta
  modelo ni retroalimentación (todo eso se puede ver en las herramientas del navegador).
- grade: califica en el servidor. Las respuestas abiertas las califica la IA (se recibe la
  función como parámetro para poder probar sin OpenAI).
- results_view: resultados de un intento entregado; las respuestas correctas solo se
  muestran si `reveal` es verdadero (aprobó o ya no le quedan intentos).

XP: hasta 200 por quiz, proporcional al porcentaje (cuenta el mejor intento, en Oracle).
"""

import copy
import json
import random
import re
import unicodedata
from typing import Any, Callable

MAX_XP = 200

HIDDEN_FIELDS = ("answer", "acceptedAnswers", "criteria", "modelAnswer", "feedback", "pairs")

OpenGrader = Callable[[dict, str], dict]   # (pregunta, respuesta) -> {"score": 0-100, "feedback": str}


def questions(definition: dict) -> list[dict]:
    return [q for section in definition.get("sections", []) for q in section.get("questions", [])]


def normalize_answer(text: Any) -> str:
    """Para comparar respuestas escritas: sin mayúsculas, espacios dobles, comillas tipográficas
    ni signos al final. 'Meet.' == 'meet' y 'I’m' == "I'm"."""
    text = unicodedata.normalize("NFKC", str(text or ""))
    text = text.replace("’", "'").replace("‘", "'").replace("“", '"').replace("”", '"')
    text = " ".join(text.lower().split())
    return re.sub(r"[\s.!?;:,\"']+$", "", re.sub(r"^[\s\"']+", "", text))


def _attach_media(item: dict | None, media_urls: dict[str, str]) -> dict | None:
    if not item:
        return item
    item = dict(item)
    if item.get("fileName") in media_urls:
        item["url"] = media_urls[item["fileName"]]
    return item


def with_media_urls(definition: dict, media_urls: dict[str, str]) -> dict:
    """Copia de la definición con la URL firmada de cada imagen y audio."""
    result = copy.deepcopy(definition)
    for section in result.get("sections", []):
        section["media"] = _attach_media(section.get("media"), media_urls)
        section["image"] = _attach_media(section.get("image"), media_urls)
        for question in section.get("questions", []):
            question["media"] = _attach_media(question.get("media"), media_urls)
            question["image"] = _attach_media(question.get("image"), media_urls)
    return result


def student_view(definition: dict, media_urls: dict[str, str], seed: int) -> dict:
    """El quiz como lo ve el estudiante: sin nada que revele las respuestas."""
    view = with_media_urls(definition, media_urls)
    for question in questions(view):
        if question["type"] == "matching":
            pairs = question.get("pairs", [])
            rights = [p["right"] for p in pairs]
            # Mismo orden si el estudiante recarga la página (semilla del intento)
            random.Random(f"{seed}-{question['key']}").shuffle(rights)
            question["left"] = [p["left"] for p in pairs]
            question["right"] = rights
        for hidden in HIDDEN_FIELDS:
            question.pop(hidden, None)
    return view


# ── Calificación por tipo: devuelve (fracción 0..1, respuesta como texto, comentario de la IA) ──

def _grade_multiple_choice(q, raw, _):
    answer = normalize_answer(raw)
    return (1.0 if answer and answer == (q.get("answer") or "") else 0.0), answer, None


def _parse_bool(raw) -> bool | None:
    if isinstance(raw, bool):
        return raw
    word = normalize_answer(raw)
    if word in ("true", "verdadero", "v", "t"):
        return True
    if word in ("false", "falso", "f"):
        return False
    return None


def _grade_true_false(q, raw, _):
    value = _parse_bool(raw)
    text = "" if value is None else ("true" if value else "false")
    return (1.0 if value is not None and value == q.get("answer") else 0.0), text, None


def _grade_fill_blank(q, raw, _):
    answer = normalize_answer(raw)
    accepted = {normalize_answer(a) for a in q.get("acceptedAnswers", [])}
    return (1.0 if answer and answer in accepted else 0.0), str(raw or "").strip(), None


def _grade_matching(q, raw, _):
    pairs = q.get("pairs", [])
    chosen = raw if isinstance(raw, dict) else {}
    correct = sum(1 for p in pairs if normalize_answer(chosen.get(p["left"])) == normalize_answer(p["right"]))
    fraction = correct / len(pairs) if pairs else 0.0
    return fraction, json.dumps(chosen, ensure_ascii=False), None


def _grade_open(q, raw, open_grader: OpenGrader | None):
    text = str(raw or "").strip()
    if not text:
        return 0.0, "", None
    if open_grader is None:
        raise RuntimeError("Falta el calificador de respuestas abiertas")
    result = open_grader(q, text)
    score = max(0.0, min(100.0, float(result.get("score", 0))))
    return score / 100, text, result.get("feedback")


GRADERS = {
    "multiple_choice": _grade_multiple_choice,
    "true_false": _grade_true_false,
    "fill_blank": _grade_fill_blank,
    "matching": _grade_matching,
    "open": _grade_open,
}


def grade(definition: dict, answers: dict[str, Any], open_grader: OpenGrader | None = None) -> dict:
    results = []
    for q in questions(definition):
        fraction, student_answer, ai_feedback = GRADERS[q["type"]](q, (answers or {}).get(q["key"]), open_grader)
        possible = float(q["points"])
        earned = round(possible * fraction, 2)
        results.append({
            "questionKey": q["key"],
            "questionType": q["type"],
            "studentAnswer": student_answer,
            "isCorrect": "Y" if fraction >= 0.999 else ("N" if fraction <= 0 else "P"),
            "pointsEarned": earned,
            "pointsPossible": possible,
            "aiFeedback": ai_feedback,
        })

    max_points = sum(r["pointsPossible"] for r in results)
    score_points = round(sum(r["pointsEarned"] for r in results), 2)
    percent = round(100 * score_points / max_points, 2) if max_points else 0.0
    passing = definition.get("passingScore")
    return {
        "scorePoints": score_points,
        "maxPoints": max_points,
        "scorePercent": percent,
        "passed": "Y" if passing is not None and percent >= float(passing) else "N",
        "xpEarned": round(MAX_XP * percent / 100),
        "answers": results,
    }


def finish_payload(attempt_id: int, graded: dict) -> dict:
    """Cuerpo para PKG_QUIZ.FINISH_ATTEMPT."""
    return {"attemptId": attempt_id, **graded}


# ── Resultados ──

def _correct_answer(q: dict):
    kind = q["type"]
    if kind == "multiple_choice":
        option = next((o for o in q.get("options", []) if o["key"] == q.get("answer")), None)
        return option
    if kind == "true_false":
        return q.get("answer")
    if kind == "fill_blank":
        return q.get("acceptedAnswers", [])
    if kind == "matching":
        return q.get("pairs", [])
    return q.get("modelAnswer")


def _student_answer_value(kind: str, text: str | None):
    if kind == "matching":
        try:
            return json.loads(text) if text else {}
        except ValueError:
            return {}
    if kind == "true_false":
        return {"true": True, "false": False}.get(text or "")
    return text or ""


def results_view(definition: dict, saved_answers: list[dict], reveal: bool, media_urls: dict[str, str]) -> list[dict]:
    """Resultado de cada pregunta de un intento entregado (en el orden del quiz)."""
    by_key = {a["questionKey"]: a for a in saved_answers or []}
    view = with_media_urls(definition, media_urls)
    results = []
    for q in questions(view):
        saved = by_key.get(q["key"], {})
        item = {
            "key": q["key"],
            "number": q["number"],
            "type": q["type"],
            "prompt": q["prompt"],
            "image": q.get("image"),
            "options": q.get("options"),
            "studentAnswer": _student_answer_value(q["type"], saved.get("studentAnswer")),
            "isCorrect": saved.get("isCorrect", "N"),
            "pointsEarned": saved.get("pointsEarned", 0),
            "pointsPossible": saved.get("pointsPossible", q["points"]),
            "aiFeedback": saved.get("aiFeedback"),
        }
        if q["type"] == "matching":
            item["left"] = [p["left"] for p in q.get("pairs", [])]
        if reveal:
            item["correctAnswer"] = _correct_answer(q)
            item["feedback"] = q.get("feedback")
        results.append(item)
    return results
