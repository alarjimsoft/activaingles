"""Archivos de los quizzes en Google Cloud Storage (bucket privado).

Rutas de los objetos (el nombre es el hash del contenido, así una versión nueva del quiz
reutiliza los archivos que no cambiaron):
    quizzes/<quizId>/docx/<sha256>.docx
    quizzes/<quizId>/media/<sha256>.<ext>

Credenciales:
  - Cloud Run: la cuenta del servicio (activa-backend-sa).
  - Local: main.py apunta GOOGLE_APPLICATION_CREDENTIALS a credentials/google-speech.json
    (otro proyecto, sin acceso al bucket). Por eso aquí se cargan las credenciales de
    `gcloud auth application-default login --impersonate-service-account activa-backend-sa@...`
    directamente desde su archivo, sin tocar las de Google Speech.

Las URLs firmadas se generan con la API IAM signBlob (la cuenta tiene el rol
serviceAccountTokenCreator sobre sí misma), así funcionan sin archivo de llave.
"""

import datetime
import os
import threading
from pathlib import Path

import google.auth
from google.auth.transport.requests import Request
from google.cloud import storage

SCOPES = ["https://www.googleapis.com/auth/cloud-platform"]
CACHE_CONTROL = "private, max-age=86400"
DEFAULT_SIGNER = "activa-backend-sa@alarjimsoft.iam.gserviceaccount.com"

_lock = threading.Lock()
_state: dict = {}


def bucket_name() -> str:
    name = os.getenv("QUIZ_BUCKET")
    if not name:
        raise RuntimeError("Falta la variable QUIZ_BUCKET (bucket de los quizzes)")
    return name


def _adc_file() -> Path | None:
    """Archivo de credenciales de `gcloud auth application-default login`."""
    if os.name == "nt":
        path = Path(os.environ.get("APPDATA", "")) / "gcloud" / "application_default_credentials.json"
    else:
        path = Path.home() / ".config" / "gcloud" / "application_default_credentials.json"
    return path if path.exists() else None


def _load_credentials():
    adc = _adc_file()
    # Local: GOOGLE_APPLICATION_CREDENTIALS es la llave de Google Speech; para el bucket se usan las ADC
    if os.getenv("GOOGLE_APPLICATION_CREDENTIALS") and adc:
        credentials, _ = google.auth.load_credentials_from_file(str(adc), scopes=SCOPES)
    else:
        credentials, _ = google.auth.default(scopes=SCOPES)
    return credentials


def _client() -> storage.Client:
    with _lock:
        if "client" not in _state:
            credentials = _load_credentials()
            _state["credentials"] = credentials
            _state["client"] = storage.Client(project=os.getenv("GCP_PROJECT", "alarjimsoft"),
                                              credentials=credentials)
        return _state["client"]


def _signing_args() -> dict:
    """Token vigente y correo de la cuenta que firma (IAM signBlob)."""
    _client()
    credentials = _state["credentials"]
    with _lock:
        if not credentials.valid:
            credentials.refresh(Request())
    email = (getattr(credentials, "service_account_email", None)
             or getattr(credentials, "signer_email", None))
    if not email or email == "default":
        email = os.getenv("QUIZ_SIGNER_EMAIL", DEFAULT_SIGNER)
    return {"service_account_email": email, "access_token": credentials.token}


def _blob(key: str):
    return _client().bucket(bucket_name()).blob(key)


def docx_key(quiz_id: int, sha256: str) -> str:
    return f"quizzes/{quiz_id}/docx/{sha256}.docx"


def media_key(quiz_id: int, sha256: str, extension: str) -> str:
    return f"quizzes/{quiz_id}/media/{sha256}.{extension.lower()}"


def upload_bytes(key: str, data: bytes, content_type: str) -> None:
    blob = _blob(key)
    blob.cache_control = CACHE_CONTROL
    blob.upload_from_string(data, content_type=content_type)


def object_size(key: str) -> int | None:
    """Tamaño del objeto en bytes, o None si no existe."""
    blob = _client().bucket(bucket_name()).get_blob(key)
    return blob.size if blob is not None else None


def delete(key: str) -> None:
    _blob(key).delete()


def signed_get_url(key: str, minutes: int = 120, download_name: str | None = None) -> str:
    params = {}
    if download_name:
        params["response_disposition"] = f'attachment; filename="{download_name}"'
    return _blob(key).generate_signed_url(
        version="v4",
        expiration=datetime.timedelta(minutes=minutes),
        method="GET",
        **params,
        **_signing_args(),
    )


def signed_put_url(key: str, content_type: str, minutes: int = 30) -> dict:
    """URL para que el navegador suba el archivo directo al bucket (PUT con ese Content-Type).

    Solo se firma Content-Type: el CORS del bucket permite ese encabezado y el navegador
    cancela la subida si envía otro (Cache-Control). La caché se pone después con
    set_cache_control, cuando el backend confirma la subida.
    """
    url = _blob(key).generate_signed_url(
        version="v4",
        expiration=datetime.timedelta(minutes=minutes),
        method="PUT",
        content_type=content_type,
        **_signing_args(),
    )
    return {"url": url, "method": "PUT", "headers": {"Content-Type": content_type}}


def set_cache_control(key: str) -> None:
    blob = _client().bucket(bucket_name()).get_blob(key)
    if blob is not None and blob.cache_control != CACHE_CONTROL:
        blob.cache_control = CACHE_CONTROL
        blob.patch()
