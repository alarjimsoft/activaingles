from fastapi import (
    APIRouter,
    UploadFile,
    File,
    Form
)

from app.services.google_speech import (
    transcribe_audio
)

from app.services.azure_pronunciation import (
    evaluate_pronunciation
)

router = APIRouter(

    prefix="/speech",

    tags=["speech"]
)


"""
GOOGLE SPEECH TO TEXT
"""
@router.post("/to-text")
async def speech_to_text(

    audio: UploadFile = File(...)

):

    audio_bytes = await audio.read()

    transcript = transcribe_audio(
        audio_bytes
    )

    return {
        "transcript": transcript
    }


"""
AZURE PRONUNCIATION ASSESSMENT
"""
@router.post(
    "/pronunciation-score"
)
async def pronunciation_score(

    reference_text: str = Form(...),

    audio: UploadFile = File(...)

):

    audio_bytes = await audio.read()

    result = evaluate_pronunciation(

        audio_bytes,

        reference_text
    )

    return result