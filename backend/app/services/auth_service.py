"""Sesión de los académicos en FastAPI.

El académico inicia sesión con su id y contraseña; Oracle los valida (módulo ORDS auth) y
este backend entrega un token firmado (JWT, 12 horas). Las rutas de académicos exigen ese
token en el encabezado: Authorization: Bearer <token>.
"""

import os
import time

import jwt
from fastapi import Header, HTTPException

ALGORITHM = "HS256"
AUDIENCE = "activa-academico"
TOKEN_HOURS = 12


def _secret() -> str:
    secret = os.getenv("QUIZ_JWT_SECRET")
    if not secret:
        raise RuntimeError("Falta la variable QUIZ_JWT_SECRET")
    return secret


def create_token(id_academico: str, nombre: str = "", rol: str | None = None) -> tuple[str, int]:
    now = int(time.time())
    expires = now + TOKEN_HOURS * 3600
    token = jwt.encode(
        {"sub": str(id_academico), "nombre": nombre, "rol": rol, "aud": AUDIENCE, "iat": now, "exp": expires},
        _secret(),
        algorithm=ALGORITHM,
    )
    return token, expires


def _unauthorized(message: str) -> HTTPException:
    return HTTPException(status_code=401, detail={"code": "UNAUTHORIZED", "message": message},
                         headers={"WWW-Authenticate": "Bearer"})


def require_academico(authorization: str | None = Header(default=None)) -> dict:
    """Dependencia de FastAPI: devuelve los datos del token o responde 401."""
    if not authorization or not authorization.lower().startswith("bearer "):
        raise _unauthorized("Inicia sesión como académico para usar esta función.")
    try:
        return jwt.decode(authorization[7:].strip(), _secret(), algorithms=[ALGORITHM], audience=AUDIENCE)
    except jwt.ExpiredSignatureError:
        raise _unauthorized("Tu sesión expiró. Vuelve a iniciar sesión.")
    except jwt.InvalidTokenError:
        raise _unauthorized("La sesión no es válida. Vuelve a iniciar sesión.")
