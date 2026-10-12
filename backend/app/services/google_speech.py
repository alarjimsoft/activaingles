from google.cloud import speech


def transcribe_audio(audio_bytes):

    client = speech.SpeechClient()

    audio = speech.RecognitionAudio(
        content=audio_bytes
    )

    config = speech.RecognitionConfig(

        encoding=speech.RecognitionConfig.AudioEncoding.WEBM_OPUS,

        sample_rate_hertz=48000,

        language_code="en-US",

        enable_automatic_punctuation=True
    )

    response = client.recognize(
        config=config,
        audio=audio
    )

    transcript = ""

    for result in response.results:

        transcript += (
            result.alternatives[0].transcript
            + " "
        )

    return transcript.strip()


def transcribe_spelling(audio_bytes):
    """
    Transcribe una palabra deletreada letra por letra ("T. E. A. C. H. E. R.").
    No recibe la palabra esperada: así reporta las letras que realmente se dijeron
    (la evaluación de Azure con referencia tiende a "escuchar" la palabra correcta).
    """

    client = speech.SpeechClient()

    audio = speech.RecognitionAudio(
        content=audio_bytes
    )

    config = speech.RecognitionConfig(

        encoding=speech.RecognitionConfig.AudioEncoding.WEBM_OPUS,

        sample_rate_hertz=48000,

        language_code="en-US",

        max_alternatives=3,

        # Clase de Google para secuencias de letras
        speech_contexts=[
            speech.SpeechContext(
                phrases=["$OOV_CLASS_ALPHA_SEQUENCE"],
                boost=20
            )
        ]
    )

    response = client.recognize(
        config=config,
        audio=audio
    )

    transcript = " ".join(
        result.alternatives[0].transcript
        for result in response.results
    ).strip()

    letters = "".join(
        ch for ch in transcript.upper()
        if "A" <= ch <= "Z"
    )

    # Diagnóstico en los logs de Cloud Run (solo texto reconocido, sin audio ni datos
    # del estudiante) para ajustar el deletreo con voces reales
    alternatives = [
        (alt.transcript, round(alt.confidence, 2))
        for result in response.results
        for alt in result.alternatives
    ]
    print(f"[spelling] letters={letters!r} alternatives={alternatives}", flush=True)

    return {
        "transcript": transcript,
        "letters": letters
    }