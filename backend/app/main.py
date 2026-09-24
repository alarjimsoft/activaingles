import os
from dotenv import load_dotenv

load_dotenv()

# Local: credencial JSON. Cloud Run: cuenta de servicio (sin archivo).
GOOGLE_CREDENTIALS_PATH = "credentials/google-speech.json"
if os.path.exists(GOOGLE_CREDENTIALS_PATH):
    os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = GOOGLE_CREDENTIALS_PATH

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routes.speech import router as speech_router
from app.routes.tts import router as tts_router
from app.routes.chat import router as chat_router
from app.routes.activities import router as activities_router

app = FastAPI()

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


@app.get("/api/health")
def health():
    return {"status": "ok"}
