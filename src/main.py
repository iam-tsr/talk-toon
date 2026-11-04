import json
import shutil
from pathlib import Path
from tempfile import TemporaryDirectory
from typing import Annotated
from uuid import UUID

import httpx
import requests
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from openai import OpenAIError
from pymongo.errors import PyMongoError

from .memory import chat
from .persona import PERSONAS
from .stt import transcribe
from .tts import clone_voice_tts
from .config import allowed_origins_settings

app = FastAPI(title="Talk Toon")
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins_settings.allowed_origins,
    allow_methods=["GET", "POST"],
    allow_credentials=True,
    allow_headers=["*"],
)

EMBEDDINGS_DIR = Path(__file__).resolve().parent / "voice-embed"


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/talk", response_class=Response, responses={200: {"content": {"audio/wav": {}}}})
def talk(
    audio_file: Annotated[UploadFile, File()],
    session_id: Annotated[UUID, Form()],
    persona: Annotated[str, Form()] = "jack-sparrow"
) -> Response:
    if persona not in PERSONAS:
        raise HTTPException(status_code=422, detail=f"Unknown persona. Choose from: {', '.join(PERSONAS)}")

    try:
        with audio_file.file, TemporaryDirectory() as directory:
            audio_path = Path(directory) / (Path(audio_file.filename or "audio.wav").name or "audio.wav")
            with audio_path.open("wb") as destination:
                shutil.copyfileobj(audio_file.file, destination)
            result = transcribe(audio_path)

        transcript = result["transcript"]
        if not transcript.strip():
            raise HTTPException(status_code=422, detail="No speech detected in the audio.")

        reply = chat(session_id, persona, transcript)

        embedding = json.loads((EMBEDDINGS_DIR / f"{persona}-embedding.json").read_text())
        audio = clone_voice_tts(embedding, reply)
    except (RuntimeError, OpenAIError, PyMongoError, httpx.HTTPError, requests.RequestException) as exc:
        raise HTTPException(status_code=502, detail="Speech pipeline provider request failed.") from exc

    return Response(
        content=audio,
        media_type="audio/wav",
        headers={"Content-Disposition": 'attachment; filename="reply.wav"'},
    )
