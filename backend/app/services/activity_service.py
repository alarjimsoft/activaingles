import json
import os
import re

from openai import OpenAI
from dotenv import load_dotenv

from app.services.grammar_rules import grammar_rules

load_dotenv()

client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))


MATCHING_PAIR_COUNT = 4

MATCHING_EXAMPLE_PAIRS = [
    ("Good morning", "Buenos días"),
    ("Goodbye", "Adiós"),
    ("Thank you", "Gracias"),
    ("Please", "Por favor"),
]


def _matching_example(pairs: list) -> str:
    pair_lines = ",\n".join(
        f'        {{"left": "{left}", "right": "{right}"}}' for left, right in pairs
    )
    return f""",
    {{
      "id": 4,
      "type": "matching",
      "prompt": "Relaciona cada palabra en inglés con su significado en español.",
      "pairs": [
{pair_lines}
      ],
      "hint": "Piensa en cuándo usarías cada expresión",
      "difficulty": "easy"
    }}"""

MATCHING_RULES = f"""
- Include exactly 1 activity of type matching
- For matching: provide exactly {MATCHING_PAIR_COUNT} pairs taken from the vocabulary list; "left" is the English term, "right" is its meaning in Spanish (translate the definition to Spanish if needed)
- For matching: every "left" and every "right" must be unique; prompt is a short instruction in Spanish; do not include correct_answer"""


# Verbo TO BE en cualquier forma, incluidas contracciones ("I'm", "they're", "isn't")
TO_BE_PATTERN = re.compile(
    r"\b(am|is|are|was|were|be|been|being|isn't|aren't|wasn't|weren't|ain't)\b"
    r"|\b(i|you|we|they|he|she|it|that|what|where|who|how|there|here)'(m|re|s)\b"
    r"|\b\w+'re\b",
    re.IGNORECASE,
)

NO_TO_BE_RULES = """
- STRICT REQUIREMENT: do NOT use the verb TO BE in any form anywhere in English text: not in prompts, options, correct_answer or matching pairs
- Forbidden forms include: am, is, are, was, were, be, been, being, and contractions like I'm, you're, he's, she's, it's, we're, they're, isn't, aren't
- This applies even if the vocabulary or grammar focus contains TO BE: skip those expressions and use other verbs (have, like, say, meet, see, go, live, study...)
- For translation: the Spanish prompt must not require TO BE in English (avoid ser/estar sentences)"""

GREETINGS_ONLY_RULES = """
- STRICT REQUIREMENT: every activity must practice ONLY greetings and farewells (saying hello, asking how someone is, answering, saying goodbye)
- Every correct_answer and every matching pair must be a greeting or farewell expression from the vocabulary list
- Do not include any other topic (numbers, colors, family, jobs, classroom objects, daily routines, etc.)
- For multiple_choice: ask which greeting or farewell fits a situation (time of day, arriving, leaving)
- Do not copy the example activities above: use different expressions from the vocabulary, mixing greetings and farewells
- For fill_blank: give enough context (time of day, arriving or leaving) so only one answer fits"""

NO_NAMES_RULES = """
- STRICT REQUIREMENT: do NOT use names of people anywhere (no first names, surnames or titles like Mr., Mrs., Sr., Sra.), not even in Spanish text
- This applies even if the grammar focus or examples contain names: drop the name or use a word like teacher, friend or everyone instead"""

# Ejemplos sin TO BE, sin nombres y de saludos/despedidas, compatibles con todas las reglas
RULES_FILL_BLANK = ("Good [___], sleep well.", "night", "Es una despedida antes de dormir")
RULES_TRANSLATION = ("Te veo mañana.", "See you tomorrow.", "Es una despedida")
RULES_MATCHING_PAIRS = [
    ("Good morning", "Buenos días"),
    ("Good bye", "Adiós"),
    ("Good night", "Buenas noches"),
    ("Have a nice day", "Que tengas buen día"),
]

GREETING_PATTERN = re.compile(
    r"\b(hello|hi|hey|hallo|good\s*(morning|afternoon|evening|night|bye)|bye|"
    r"see you|(nice|pleased|glad) to (meet|see) you|how are you|how do you do|"
    r"how is it going|how's it going|what's up|have a (nice|good|great) day|"
    r"take care|welcome|fine,? thanks?|i'm fine|so long)\b",
    re.IGNORECASE,
)

TITLE_PATTERN = re.compile(r"\b(Mr|Mrs|Ms|Dr|Sr|Sra|Srta)\b\.?")

# Nombres que GPT suele usar en ejercicios; se detectan en cualquier posición
COMMON_NAMES = {
    "john", "mary", "anna", "ana", "lisa", "tom", "sarah", "sara", "maria", "maría",
    "juan", "carlos", "katty", "david", "mike", "emma", "peter", "paul", "laura",
    "kate", "jane", "jack", "sam", "alex", "ben", "luis", "pedro", "sofia", "sofía",
    "sophia", "emily", "james", "michael", "lucy", "linda", "mark", "jose", "josé",
    "pablo", "diego", "miguel", "rosa", "elena", "daniel", "andrea", "tim", "bob",
    "alice", "jenny", "amy", "olivia", "liam", "noah", "mia", "lily", "max", "leo",
    "lucas", "isabel", "carmen", "marta", "jorge", "ricardo", "fernando", "valeria",
    "camila", "tony", "susan", "robert", "anne", "jessica", "kevin", "nick", "steve",
}

# Palabras que pueden ir con mayúscula a mitad de frase sin ser nombres
CAPITALIZED_WORDS = {"english", "spanish", "inglés", "español", "ok", "okay"}

SENTENCE_SPLIT = re.compile(r"[.!?¿¡:;\"“”«»()\[\]]|(?<!\w)'|'(?!\w)")
WORD = re.compile(r"[A-Za-zÁÉÍÓÚÑáéíóúñü']+")


def _uses_to_be(text) -> bool:
    return bool(TO_BE_PATTERN.search(str(text or "").replace("’", "'")))


def _english_texts(activity: dict) -> list:
    """Texto en inglés del ejercicio (el prompt de traducción va en español)."""
    texts = [activity.get("correct_answer")]
    if activity.get("type") == "fill_blank":
        prompt = str(activity.get("prompt", ""))
        texts.append(prompt.replace("[___]", str(activity.get("correct_answer", ""))))
    elif activity.get("type") != "translation":
        texts.append(activity.get("prompt"))
    texts += activity.get("options") or []
    texts += [p.get("left") for p in activity.get("pairs") or [] if isinstance(p, dict)]
    return texts


def _activity_uses_to_be(activity: dict) -> bool:
    return any(_uses_to_be(t) for t in _english_texts(activity))


def _is_greeting(text) -> bool:
    return bool(GREETING_PATTERN.search(str(text or "").replace("’", "'")))


def _activity_off_topic(activity: dict) -> bool:
    """Fuera de tema si la respuesta (o algún par de relacionar) no es un saludo o despedida."""
    pairs = [p for p in activity.get("pairs") or [] if isinstance(p, dict)]
    if activity.get("type") == "matching":
        return not all(_is_greeting(p.get("left")) for p in pairs)
    texts = [activity.get("correct_answer")]
    if activity.get("type") == "fill_blank":
        prompt = str(activity.get("prompt", ""))
        texts.append(prompt.replace("[___]", str(activity.get("correct_answer", ""))))
    return not any(_is_greeting(t) for t in texts)


def _has_name(text, allowed_words: set) -> bool:
    """
    Un nombre es una palabra con mayúscula a mitad de frase que no está en el
    vocabulario, un título (Mr., Sra.) o un nombre común en cualquier posición.
    """
    text = str(text or "").replace("’", "'")
    if TITLE_PATTERN.search(text):
        return True
    for segment in SENTENCE_SPLIT.split(text):
        words = WORD.findall(segment)
        for i, word in enumerate(words):
            lower = word.lower().removesuffix("'s")
            if lower in COMMON_NAMES:
                return True
            if (
                i > 0
                and word[0].isupper()
                and lower not in allowed_words
                and lower not in CAPITALIZED_WORDS
                and not lower.startswith("i'")
                and lower != "i"
            ):
                return True
    return False


def _activity_has_names(activity: dict, allowed_words: set) -> bool:
    texts = [activity.get("prompt"), activity.get("correct_answer")]
    texts += activity.get("options") or []
    for p in activity.get("pairs") or []:
        if isinstance(p, dict):
            texts += [p.get("left"), p.get("right")]
    return any(_has_name(t, allowed_words) for t in texts)


def _vocabulary_words(vocabulary: list) -> set:
    """Palabras del vocabulario (inglés y español): pueden ir con mayúscula, como "Good Morning"."""
    return {
        w.lower()
        for item in vocabulary
        for field in ("term", "definition")
        for w in WORD.findall(str(item.get(field, "")))
    }


# Reglas que una misión puede activar para su práctica: texto para GPT
PRACTICE_RULES = {
    "greetings_only": GREETINGS_ONLY_RULES,
    "no_names": NO_NAMES_RULES,
    "no_to_be": NO_TO_BE_RULES,
}


def _breaks_rules(activity: dict, rules: list, allowed_words: set) -> bool:
    return (
        ("greetings_only" in rules and _activity_off_topic(activity))
        or ("no_names" in rules and _activity_has_names(activity, allowed_words))
        or ("no_to_be" in rules and _activity_uses_to_be(activity))
    )


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
    rules: list | None = None,
) -> list:
    """
    Genera actividades de práctica basadas en el contenido de la misión.
    mission_context: {vocabulary: [...], grammar: {...}, level_code: str}
    include_matching: agrega un ejercicio de relacionar (solo si el frontend lo soporta)
    rules: claves de PRACTICE_RULES; los ejercicios que no las cumplan se descartan
    """
    rules = [r for r in rules or [] if r in PRACTICE_RULES]
    if not rules:
        return _generate_once(mission_context, activity_count, include_matching, [])

    allowed_words = _vocabulary_words(mission_context.get("vocabulary", []))

    # GPT a veces se salta las reglas: se descartan los ejercicios que no las cumplen y se pide otra tanda
    valid = []
    for _ in range(3):
        for activity in _generate_once(mission_context, activity_count, include_matching, rules):
            if _breaks_rules(activity, rules, allowed_words):
                continue
            if activity.get("type") == "matching" and any(a.get("type") == "matching" for a in valid):
                continue
            valid.append(activity)
        if len(valid) >= activity_count:
            break

    selected = valid[:activity_count]
    for i, activity in enumerate(selected, start=1):
        activity["id"] = i
    return selected


def _generate_once(
    mission_context: dict,
    activity_count: int,
    include_matching: bool,
    rules: list,
) -> list:
    vocabulary  = mission_context.get("vocabulary", [])
    grammar     = mission_context.get("grammar", {}) or {}
    level_code  = mission_context.get("level_code", "A1")

    if "no_to_be" in rules:
        vocabulary = [w for w in vocabulary if not _uses_to_be(w.get("term"))]

    # Con reglas va todo el vocabulario: si se corta a 8, en la misión 1 se pierden las despedidas
    vocab_lines = "\n".join(
        f"- {w.get('term', '')}: {w.get('definition', '')}"
        for w in (vocabulary if rules else vocabulary[:8])
    )

    grammar_info = "\n\n".join(
        f"Title: {r.get('title', '')}\n"
        f"Rule: {r.get('rule', '')}\n"
        f"Explanation: {r.get('explanation', '')}"
        for r in grammar_rules(grammar)
    )

    matching_example = (
        _matching_example(RULES_MATCHING_PAIRS if rules else MATCHING_EXAMPLE_PAIRS)
        if include_matching else ""
    )
    matching_rules   = MATCHING_RULES if include_matching else ""
    extra_rules      = "".join(PRACTICE_RULES[r] for r in rules)

    fill_prompt, fill_answer, fill_hint = (
        RULES_FILL_BLANK if rules
        else ("She [___] studying English right now.", "is", "Usa el verbo BE")
    )
    translation_prompt, translation_answer, translation_hint = (
        RULES_TRANSLATION if rules
        else ("Ella está estudiando inglés en este momento.", "She is studying English right now.", "Usa el presente continuo")
    )

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
      "prompt": "{fill_prompt}",
      "correct_answer": "{fill_answer}",
      "hint": "{fill_hint}",
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
      "prompt": "{translation_prompt}",
      "correct_answer": "{translation_answer}",
      "hint": "{translation_hint}",
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
- All correct_answer values must be unambiguous{matching_rules}{extra_rules}
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
