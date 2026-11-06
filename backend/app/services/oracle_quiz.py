"""Cliente del módulo ORDS "quiz" (Oracle).

El módulo está protegido con OAuth (client credentials): solo este backend tiene el
client_id y el client_secret. El token se pide una vez y se reutiliza hasta poco antes de
que venza; si ORDS responde 401, se pide uno nuevo y se reintenta una vez.

Errores de PKG_QUIZ: { "success": false, "code": "QUIZ_LOCKED", "error": "..." } con status
400/403/404/409. Se convierten en OracleQuizError con el mismo status y código.
"""

import os
import threading
import time

import requests

TIMEOUT = 30


class OracleQuizError(Exception):
    def __init__(self, status: int, code: str, message: str):
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message


_lock = threading.Lock()
_token: dict = {"value": None, "expires": 0.0}


def _base() -> str:
    base = os.getenv("ORDS_BASE_URL")
    if not base:
        raise RuntimeError("Falta la variable ORDS_BASE_URL")
    return base.rstrip("/")


def _fetch_token() -> str:
    client_id = os.getenv("ORDS_QUIZ_CLIENT_ID")
    client_secret = os.getenv("ORDS_QUIZ_CLIENT_SECRET")
    if not client_id or not client_secret:
        raise RuntimeError("Faltan ORDS_QUIZ_CLIENT_ID u ORDS_QUIZ_CLIENT_SECRET")
    response = requests.post(
        f"{_base()}/oauth/token",
        data={"grant_type": "client_credentials"},
        auth=(client_id.strip(), client_secret.strip()),
        timeout=TIMEOUT,
    )
    if response.status_code != 200:
        raise OracleQuizError(502, "ORDS_AUTH_FAILED",
                              f"Oracle rechazó las credenciales del backend ({response.status_code})")
    body = response.json()
    _token["value"] = body["access_token"]
    _token["expires"] = time.time() + int(body.get("expires_in", 3600)) - 60
    return _token["value"]


def _get_token(force: bool = False) -> str:
    with _lock:
        if force or not _token["value"] or time.time() >= _token["expires"]:
            return _fetch_token()
        return _token["value"]


def _request(method: str, path: str, json_body: dict | None = None, params: dict | None = None):
    url = f"{_base()}/quiz/{path.lstrip('/')}"
    for attempt in range(2):
        headers = {"Authorization": f"Bearer {_get_token(force=attempt == 1)}"}
        try:
            response = requests.request(method, url, headers=headers, json=json_body, params=params,
                                        timeout=TIMEOUT)
        except requests.RequestException as error:
            raise OracleQuizError(502, "ORACLE_UNAVAILABLE", f"No se pudo conectar con Oracle: {error}") from error
        if response.status_code == 401 and attempt == 0:
            continue
        break

    try:
        body = response.json()
    except ValueError:
        body = None

    if response.status_code >= 400 or (isinstance(body, dict) and body.get("success") is False):
        code = body.get("code", "ORACLE_ERROR") if isinstance(body, dict) else "ORACLE_ERROR"
        message = body.get("error", response.text[:300]) if isinstance(body, dict) else response.text[:300]
        status = response.status_code if response.status_code >= 400 else 500
        raise OracleQuizError(status, code, message)
    return body


# ── Académicos ──

def admin_list() -> list[dict]:
    return _request("GET", "admin/list")


def get_quiz(quiz_id: int) -> dict:
    return _request("GET", f"admin/quiz/{quiz_id}")


def get_version(version_id: int) -> dict:
    return _request("GET", f"admin/version/{version_id}")


def create_version(payload: dict) -> dict:
    return _request("POST", "admin/version", json_body=payload)


def save_media(payload: dict) -> dict:
    return _request("POST", "admin/media", json_body=payload)


def publish_version(version_id: int) -> dict:
    return _request("POST", f"admin/publish/{version_id}", json_body={})


def get_stats(quiz_id: int, version_id: int | None = None) -> dict:
    return _request("GET", f"admin/stats/{quiz_id}", params={"versionId": version_id} if version_id else None)


# ── Estudiantes ──

def available(id_inscripcion: int) -> list[dict]:
    return _request("GET", f"student/available/{id_inscripcion}")


def start_attempt(quiz_id: int, id_inscripcion: int) -> dict:
    return _request("POST", "student/start", json_body={"quiz_id": quiz_id, "id_inscripcion": id_inscripcion})


def get_attempt(attempt_id: int) -> dict:
    return _request("GET", f"student/attempt/{attempt_id}")


def finish_attempt(payload: dict) -> dict:
    return _request("POST", "student/finish", json_body=payload)


# ── Login de académicos (módulo público "auth", el mismo que usa hoy el frontend) ──

def login_academico(id_academico: str, password: str) -> dict:
    try:
        response = requests.post(
            f"{_base()}/auth/loginacademicos",
            data={"x01": id_academico, "x02": password},
            timeout=TIMEOUT,
        )
        return response.json()
    except (requests.RequestException, ValueError) as error:
        raise OracleQuizError(502, "ORACLE_UNAVAILABLE", "No se pudo conectar con Oracle") from error
