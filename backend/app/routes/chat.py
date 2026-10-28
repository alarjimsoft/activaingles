from fastapi import APIRouter

from pydantic import BaseModel

from typing import Any, Optional

from app.services.openai_service import (
    get_tutor_response
)

router = APIRouter(
    prefix="/chat",
    tags=["chat"]
)


class ChatRequest(BaseModel):

    id_inscripcion: int

    mission_id: int

    mission: dict

    message: str

    progress_percent: int

    history: list[dict[str, Any]] = []

    learning_context: Optional[dict] = None


@router.post("/message")
async def chat_message(
    request: ChatRequest
):

    """
    AI Response
    """
    response = get_tutor_response(

        request.mission,

        request.message,

        request.history,

        request.learning_context
    )

    """
    GRAMMAR SCORE
    Derived from GPT correction:
    - correction is None  → student had no errors → 90
    - correction has data → error was detected    → 55
    """
    correction = response.get("correction")
    grammar_score = 55 if (
        correction
        and isinstance(correction, dict)
        and correction.get("original")
    ) else 90

    """
    El XP ya no se suma por mensaje: se calcula por fase desde los puntajes
    guardados en Oracle (frontend: src/utils/missionXp.js)
    """

    """
    Return AI response + grammar_score
    so the frontend can persist the real value
    """
    return {
        "reply": response["reply"],
        "correction": response["correction"],
        "grammar_score": grammar_score,
    }