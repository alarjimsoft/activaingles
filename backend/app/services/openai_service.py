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
    user_message
):

    system_prompt = f"""
You are an English tutor
inside the application
Activa Ingles.

Mission:
{mission["title"]}

Mission description:
{mission["description"]}

Objectives:
{", ".join(mission["objectives"])}

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

    response = client.chat.completions.create(

        model="gpt-4.1-mini",

        response_format={
           "type": "json_object"
        },

        messages=[

            {
                "role": "system",
                "content": system_prompt
            },

            {
                "role": "user",
                "content": user_message
            }
        ],

        temperature=0.7
    )
  
    return json.loads (
        response.choices[0]
        .message.content
    )