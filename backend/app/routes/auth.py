from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.services import oracle_quiz
from app.services.auth_service import create_token

router = APIRouter(prefix="/auth")


class AcademicoLoginRequest(BaseModel):
    idAcademico: str = Field(min_length=1, max_length=20)
    password: str = Field(min_length=1, max_length=200)


@router.post("/academico")
def login_academico(request: AcademicoLoginRequest):
    """Valida al académico contra Oracle y devuelve sus datos y el token para las rutas de quizzes.

    Responde lo mismo que el endpoint ORDS auth/loginacademicos que usa hoy el frontend
    ({ success, message, academico }) más { token, expiresAt }.
    """
    result = oracle_quiz.login_academico(request.idAcademico.strip(), request.password)
    if not result.get("success"):
        raise HTTPException(
            status_code=401,
            detail={"code": "INVALID_CREDENTIALS", "message": result.get("message") or "Credenciales inválidas"},
        )
    academico = result.get("academico") or {}
    token, expires = create_token(request.idAcademico.strip(), academico.get("nombre", ""), academico.get("rol"))
    return {**result, "token": token, "expiresAt": expires}
