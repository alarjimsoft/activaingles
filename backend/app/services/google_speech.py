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