import os
from dotenv import load_dotenv

load_dotenv()

# Local: credencial JSON. Cloud Run: cuenta de servicio (sin archivo).
GOOGLE_CREDENTIALS_PATH = "credentials/google-speech.json"
if os.path.exists(GOOGLE_CREDENTIALS_PATH):
    os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = GOOGLE_CREDENTIALS_PATH

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.routes.speech import router as speech_router
from app.routes.tts import router as tts_router
from app.routes.chat import router as chat_router
from app.routes.activities import router as activities_router
from app.routes.auth import router as auth_router
from app.routes.quizzes import router as quizzes_router
from app.services.oracle_quiz import OracleQuizError

app = FastAPI()


# Errores de PKG_QUIZ (Oracle): mismo status y código para el frontend (QUIZ_LOCKED, NO_ATTEMPTS_LEFT...)
@app.exception_handler(OracleQuizError)
def oracle_quiz_error(request: Request, error: OracleQuizError):
    return JSONResponse(status_code=error.status, content={"detail": {"code": error.code, "message": error.message}})

# CORS
allowed_origins = os.getenv("ALLOWED_ORIGINS", "http://localhost:5173").split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routes
app.include_router(speech_router, prefix="/api")
app.include_router(tts_router, prefix="/api")
app.include_router(chat_router, prefix="/api")
app.include_router(activities_router, prefix="/api")
app.include_router(auth_router, prefix="/api")
app.include_router(quizzes_router, prefix="/api")


@app.get("/api/health")
def health():
    return {"status": "ok"}
