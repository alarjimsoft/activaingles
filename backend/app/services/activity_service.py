import json
import os

from openai import OpenAI
from dotenv import load_dotenv

load_dotenv()

client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))


MATCHING_PAIR_COUNT = 4

MATCHING_EXAMPLE = """,
    {
      "id": 4,
      "type": "matching",
      "prompt": "Relaciona cada palabra en inglés con su significado en español.",
      "pairs": [
        {"left": "Good morning", "right": "Buenos días"},
        {"left": "Goodbye", "right": "Adiós"},
        {"left": "Thank you", "right": "Gracias"},
        {"left": "Please", "right": "Por favor"}
      ],
      "hint": "Piensa en cuándo usarías cada expresión",
      "difficulty": "easy"
    }"""

MATCHING_RULES = f"""
- Include exactly 1 activity of type matching
- For matching: provide exactly {MATCHING_PAIR_COUNT} pairs taken from the vocabulary list; "left" is the English term, "right" is its meaning in Spanish (translate the definition to Spanish if needed)
- For matching: every "left" and every "right" must be unique; prompt is a short instruction in Spanish; do not include correct_answer"""


def _normalize_matching(activity: dict):
    """
    Valida un ejercicio de relacionar y arma correct_answer desde los pares.
    Devuelve None si GPT generó pares inválidos: el ejercicio se descarta.
    """
    pairs = [
        {"left": str(p.get("left", "")).strip(), "right": str(p.get("right", "")).strip()}
        for p in activity.get("pairs") or []
        if isinstance(p, dict)
    ]
    lefts  = [p["left"] for p in pairs]
    rights = [p["right"] for p in pairs]

    if (
        len(pairs) < 2
        or not all(lefts) or not all(rights)
        or len(set(lefts)) != len(lefts)
        or len(set(rights)) != len(rights)
    ):
        return None

    return {
        **activity,
        "prompt": activity.get("prompt") or "Relaciona cada palabra con su significado.",
        "pairs": pairs,
        "correct_answer": json.dumps(pairs, ensure_ascii=False),
    }


def generate_activities(
    mission_context: dict,
    activity_count: int = 4,
    include_matching: bool = False,
) -> list:
    """
    Genera actividades de práctica basadas en el contenido de la misión.
    mission_context: {vocabulary: [...], grammar: {...}, level_code: str}
    include_matching: agrega un ejercicio de relacionar (solo si el frontend lo soporta)
    """
    vocabulary  = mission_context.get("vocabulary", [])
    grammar     = mission_context.get("grammar", {}) or {}
    level_code  = mission_context.get("level_code", "A1")

    vocab_lines = "\n".join(
        f"- {w.get('term', '')}: {w.get('definition', '')}"
        for w in vocabulary[:8]
    )

    grammar_info = ""
    if grammar:
        grammar_info = (
            f"Title: {grammar.get('title', '')}\n"
            f"Rule: {grammar.get('rule', '')}\n"
            f"Explanation: {grammar.get('explanation', '')}"
        )

    matching_example = MATCHING_EXAMPLE if include_matching else ""
    matching_rules   = MATCHING_RULES if include_matching else ""

    prompt = f"""You are an English language activity generator for {level_code} level students.

Based on this mission content:

VOCABULARY:
{vocab_lines if vocab_lines else "No vocabulary provided."}

GRAMMAR FOCUS:
{grammar_info if grammar_info else "No grammar provided."}

Generate exactly {activity_count} practice activities. Return a JSON object with this exact structure:

{{
  "activities": [
    {{
      "id": 1,
      "type": "fill_blank",
      "prompt": "She [___] studying English right now.",
      "correct_answer": "is",
      "hint": "Usa el verbo BE",
      "difficulty": "easy"
    }},
    {{
      "id": 2,
      "type": "multiple_choice",
      "prompt": "Which sentence uses the correct grammar?",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correct_answer": "Option C",
      "hint": "Piensa en la regla gramatical",
      "difficulty": "medium"
    }},
    {{
      "id": 3,
      "type": "translation",
      "prompt": "Ella está estudiando inglés en este momento.",
      "correct_answer": "She is studying English right now.",
      "hint": "Usa el presente continuo",
      "difficulty": "medium"
    }}{matching_example}
  ]
}}

Rules:
- Include at least 1 of each type: fill_blank, multiple_choice, translation
- For fill_blank: mark the blank with [___] inside the prompt sentence
- For multiple_choice: always provide exactly 4 options; correct_answer must match one option exactly
- For translation: prompt is in Spanish, correct_answer is in English
- Use vocabulary words from the list in at least 2 activities
- difficulty must be one of: "easy", "medium", "hard"
- hint must ALWAYS be written in Spanish: short and simple, without giving away the answer
- Keep language appropriate for {level_code} level
- All correct_answer values must be unambiguous{matching_rules}
"""

    response = client.chat.completions.create(
        model="gpt-4.1-mini",
        response_format={"type": "json_object"},
        messages=[{"role": "user", "content": prompt}],
        temperature=0.7,
    )

    result = json.loads(response.choices[0].message.content)
    activities = result.get("activities", [])

    normalized = []
    for activity in activities:
        if activity.get("type") == "matching":
            if not include_matching:
                continue
            activity = _normalize_matching(activity)
            if activity is None:
                continue
        normalized.append(activity)

    return normalized


def evaluate_answer(activity_type: str, prompt: str, correct_answer: str, student_answer: str) -> dict:
    """
    Evaluación semántica para fill_blank y translation.
    """
    eval_prompt = f"""You are an English language evaluator.

Activity type: {activity_type}
Question: {prompt}
Expected answer: {correct_answer}
Student's answer: {student_answer}

Evaluate the student's answer using these rules:
- Accept minor spelling errors if the meaning is clear
- For translation: accept multiple valid phrasings
- For fill_blank: accept grammatically equivalent synonyms
- Ignore capitalization and trailing punctuation differences

Return ONLY this JSON:
{{
  "is_correct": true,
  "score": 100,
  "explanation": "Great job! Your answer is correct."
}}

Or if wrong:
{{
  "is_correct": false,
  "score": 0,
  "explanation": "Not quite. The correct answer is '{correct_answer}' because [brief reason]."
}}

Score must be 100 if correct, 0 if incorrect. No partial scores.
"""

    response = client.chat.completions.create(
        model="gpt-4.1-mini",
        response_format={"type": "json_object"},
        messages=[{"role": "user", "content": eval_prompt}],
        temperature=0.2,
    )

    return json.loads(response.choices[0].message.content)
