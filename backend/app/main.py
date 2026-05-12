from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routes.speech import router as speech_router
from app.routes.tts import router as tts_router

app = FastAPI()

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routes
app.include_router(speech_router)
app.include_router(tts_router)