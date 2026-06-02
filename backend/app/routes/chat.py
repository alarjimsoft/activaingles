from fastapi import APIRouter

from pydantic import BaseModel

from typing import Any

from app.services.openai_service import (
    get_tutor_response
)

from app.services.progress_service import (
    calculate_xp,
    add_xp_to_progress
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

        request.history
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
    XP SYSTEM
    """
    xp_earned = calculate_xp(

        grammar_score=grammar_score,

        pronunciation_score=0,

        message_count=1,

        completed=request.progress_percent>=100
    )

    """
    Update USER_PROGRESS
    through ORDS
    """
    add_xp_to_progress(

        request.id_inscripcion,

        request.mission_id,

        xp_earned
    )

    """
    Return AI response + grammar_score
    so the frontend can persist the real value
    """
    return {
        "reply": response["reply"],
        "correction": response["correction"],
        "grammar_score": grammar_score,
    }