import os

from openai import OpenAI

from dotenv import load_dotenv
import json

load_dotenv()

client = OpenAI(
    api_key=os.getenv(
        "OPENAI_API_KEY"
    )
)


def get_tutor_response(
    mission,
    user_message,
    history=None,
    learning_context=None
):
    if history is None:
        history = []

    objectives = mission.get(
        "objectives",
        [
            "Practice English conversation",
            "Improve grammar",
            "Answer naturally"
        ]
    )

    learning_section = ""
    if learning_context:
        vocab_terms = [w.get("term", "") for w in learning_context.get("vocabulary", [])]
        grammar     = learning_context.get("grammar") or {}
        score       = learning_context.get("practice_score")

        learning_section = "\n\nLEARNING CONTEXT (student already studied this):\n"
        if vocab_terms:
            learning_section += f"Vocabulary: {', '.join(vocab_terms)}\n"
        if grammar.get("title"):
            learning_section += f"Grammar focus: {grammar['title']} — {grammar.get('rule', '')}\n"
        if score is not None:
            if score >= 75:
                learning_section += f"Practice score: {score}% — Strong. Challenge them with complex sentences.\n"
            elif score >= 50:
                learning_section += f"Practice score: {score}% — Average. Guide correct grammar use.\n"
            else:
                learning_section += f"Practice score: {score}% — Needs help. Be encouraging, give extra guidance.\n"
        learning_section += "Guide the student to naturally use these words and grammar in conversation.\n"

    system_prompt = f"""
You are an English tutor
inside the application
Activa Ingles.

Mission:
{mission["title"]}

Mission description:
{mission["description"]}

Objectives:
{", ".join(objectives)}
{learning_section}
Your goals:

- Help the student practice English
- Correct grammar naturally
- Encourage conversation
- Keep responses concise
- Ask follow-up questions
- Be friendly and motivating

VERY IMPORTANT:

If the student makes grammar mistakes:

1. Detect the mistake
2. Provide corrected version
3. Explain briefly

Return your response ONLY as valid JSON.

Format:

{{
  "reply": "...",

  "correction": {{
    "original": "...",
    "corrected": "...",
    "explanation": "..."
  }}
}}

If there are no mistakes:

{{
  "reply": "...",
  "correction": null
}}
"""

    messages = [{"role": "system", "content": system_prompt}]

    for msg in history[-10:]:
        role = "user" if msg["sender"] == "student" else "assistant"
        messages.append({"role": role, "content": msg["text"]})

    messages.append({"role": "user", "content": user_message})

    response = client.chat.completions.create(

        model="gpt-4.1-mini",

        response_format={
           "type": "json_object"
        },

        messages=messages,

        temperature=0.7
    )
  
    return json.loads (
        response.choices[0]
        .message.content
    )