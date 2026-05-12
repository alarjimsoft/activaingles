from fastapi import APIRouter

from fastapi.responses import Response

from pydantic import BaseModel

from app.services.google_tts import (
    generate_speech
)

router = APIRouter(
    prefix="/tts",
    tags=["tts"]
)


class TTSRequest(BaseModel):
    text: str


@router.post("/speak")
async def speak(
    request: TTSRequest
):

    audio_content = generate_speech(
        request.text
    )

    return Response(
        content=audio_content,
        media_type="audio/mpeg"
    )