from fastapi import APIRouter

from pydantic import BaseModel

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


@router.post("/message")
async def chat_message(
    request: ChatRequest
):

    """
    AI Response
    """
    response = get_tutor_response(

        request.mission,

        request.message
    )

    """
    XP SYSTEM
    """
    xp_earned = calculate_xp(

        grammar_score=85,

        pronunciation_score=0,

        message_count=1,

        completed=False
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
    Return AI response
    """
    return response