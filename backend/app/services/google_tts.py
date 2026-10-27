import base64
from html import escape

from google.cloud import texttospeech
from google.cloud import texttospeech_v1beta1


def generate_speech(text):

    client = texttospeech.TextToSpeechClient()

    synthesis_input = (
        texttospeech.SynthesisInput(
            text=text
        )
    )

    voice = (
        texttospeech.VoiceSelectionParams(
            language_code="en-US",

            name="en-US-Neural2-J"
        )
    )

    audio_config = (
        texttospeech.AudioConfig(
            audio_encoding=
            texttospeech.AudioEncoding.MP3
        )
    )

    response = client.synthesize_speech(

        input=synthesis_input,

        voice=voice,

        audio_config=audio_config
    )

    return response.audio_content


# Voces del avatar: inglés para las frases modelo, español para instrucciones
AVATAR_VOICES = {
    "en": ("en-US", "en-US-Neural2-F"),
    "es": ("es-US", "es-US-Neural2-A"),
}


def generate_speech_with_timepoints(text, language="en"):
    """
    Audio MP3 + momento en que empieza cada palabra (ms), para sincronizar
    los labios del avatar. Usa una marca SSML antes de cada palabra.
    """

    client = texttospeech_v1beta1.TextToSpeechClient()

    words = text.split()

    ssml = "<speak>" + " ".join(
        f'<mark name="{i}"/>{escape(word)}' for i, word in enumerate(words)
    ) + "</speak>"

    language_code, voice_name = AVATAR_VOICES[language]

    response = client.synthesize_speech(
        request=texttospeech_v1beta1.SynthesizeSpeechRequest(
            input=texttospeech_v1beta1.SynthesisInput(ssml=ssml),
            voice=texttospeech_v1beta1.VoiceSelectionParams(
                language_code=language_code,
                name=voice_name,
            ),
            audio_config=texttospeech_v1beta1.AudioConfig(
                audio_encoding=texttospeech_v1beta1.AudioEncoding.MP3
            ),
            enable_time_pointing=[
                texttospeech_v1beta1.SynthesizeSpeechRequest.TimepointType.SSML_MARK
            ],
        )
    )

    times = {
        tp.mark_name: round(tp.time_seconds * 1000)
        for tp in response.timepoints
    }

    timed = [
        (word, times[str(i)])
        for i, word in enumerate(words)
        if str(i) in times
    ]

    return {
        "audio": base64.b64encode(response.audio_content).decode("ascii"),
        "words": [word for word, _ in timed],
        "wtimes": [time for _, time in timed],
    }
