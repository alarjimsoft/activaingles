
import os
import json
import tempfile

from dotenv import load_dotenv

import azure.cognitiveservices.speech as speechsdk
import ffmpeg




load_dotenv()


speech_key = os.getenv(
    "AZURE_SPEECH_KEY"
)

service_region = os.getenv(
    "AZURE_SPEECH_REGION"
)


def evaluate_pronunciation(

    audio_bytes,

    reference_text

):

    """
    Save WEBM temp file
    """
    with tempfile.NamedTemporaryFile(

        delete=False,

        suffix=".webm"

    ) as temp_webm:

        temp_webm.write(audio_bytes)

        webm_path = temp_webm.name

    """
    Convert WEBM → WAV
    """
    wav_path = webm_path.replace(
        ".webm",
        ".wav"
    )

    (
    ffmpeg
    .input(webm_path)
    .output(

        wav_path,

        format="wav"
    )
    .run(overwrite_output=True)
    )

    """
    Azure Speech Config
    """
    speech_config = speechsdk.SpeechConfig(

        subscription=speech_key,

        region=service_region
    )

    """
    WAV audio config
    """
    audio_config = speechsdk.audio.AudioConfig(

        filename=wav_path
    )

    """
    Speech recognizer
    """
    speech_recognizer = speechsdk.SpeechRecognizer(

        speech_config=speech_config,

        audio_config=audio_config,

        language="en-US"
    )

    """
    Pronunciation Assessment Config
    """
    pronunciation_config = (
        speechsdk.PronunciationAssessmentConfig(

            reference_text=reference_text,

            grading_system=speechsdk.PronunciationAssessmentGradingSystem.HundredMark,

            granularity=speechsdk.PronunciationAssessmentGranularity.Phoneme,

            enable_miscue=True
        )
    )

    pronunciation_config.apply_to(
        speech_recognizer
    )

    """
    Recognize speech
    """
    result = speech_recognizer.recognize_once()

    if result.reason != speechsdk.ResultReason.RecognizedSpeech:

        return {

            "success": False,

            "error": "Speech not recognized"
        }

    """
    Azure JSON result
    """
    pronunciation_result_json = result.properties.get(

        speechsdk.PropertyId.SpeechServiceResponse_JsonResult
    )

    pronunciation_data = json.loads(
        pronunciation_result_json
    )

    scores = pronunciation_data["NBest"][0]["PronunciationAssessment"]

    return {

        "success": True,

        "recognized_text":
            pronunciation_data["DisplayText"],

        "pronunciation_score":
            scores["PronScore"],

        "accuracy_score":
            scores["AccuracyScore"],

        "fluency_score":
            scores["FluencyScore"],

        "completeness_score":
            scores["CompletenessScore"]
    }

