from fastapi import APIRouter

from pydantic import BaseModel

from app.services.openai_service import (
    get_tutor_response
)

router = APIRouter(
    prefix="/chat",
    tags=["chat"]
)


class ChatRequest(BaseModel):

    mission: dict

    message: str


@router.post("/message")
async def chat_message(
    request: ChatRequest
):

    response = get_tutor_response(

        request.mission,

        request.message
    )

    return {
        "response": response
    }