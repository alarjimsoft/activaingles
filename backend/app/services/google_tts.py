from google.cloud import texttospeech


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