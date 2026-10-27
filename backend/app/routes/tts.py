from typing import Literal

from fastapi import APIRouter

from fastapi.responses import Response

from pydantic import BaseModel

from app.services.google_tts import (
    generate_speech,
    generate_speech_with_timepoints
)

router = APIRouter(
    prefix="/tts",
    tags=["tts"]
)


class TTSRequest(BaseModel):
    text: str


class TimedTTSRequest(BaseModel):
    text: str
    language: Literal["en", "es"] = "en"


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


"""
AUDIO + TIEMPOS DE PALABRAS — labios del avatar
"""
@router.post("/speak-timed")
async def speak_timed(
    request: TimedTTSRequest
):

    return generate_speech_with_timepoints(
        request.text,
        request.language
    )
