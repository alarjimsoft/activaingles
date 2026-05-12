from fastapi import APIRouter, UploadFile, File

from app.services.google_speech import transcribe_audio

router = APIRouter(prefix="/speech", tags=["speech"])


@router.post("/to-text")
async def speech_to_text(
    audio: UploadFile = File(...)
):

    audio_bytes = await audio.read()

    transcript = transcribe_audio(audio_bytes)

    return {
        "transcript": transcript
    }