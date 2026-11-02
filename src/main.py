import json
import shutil
from pathlib import Path
from tempfile import TemporaryDirectory
from typing import Annotated

import httpx
import requests
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import Response
from sarvamai.core.api_error import ApiError

from . import persona as personas
from .gen import reasoning
from .stt import transcribe
from .tts import clone_voice_tts

app = FastAPI(title="Talk Toon")

PERSONAS = {
    name.removesuffix("_prompt").replace("_", "-"): getattr(personas, name)
    for name in personas.__all__
}
EMBEDDINGS_DIR = Path(__file__).resolve().parent / "voice-embed"


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/talk", response_class=Response, responses={200: {"content": {"audio/wav": {}}}})
def talk(
    audio_file: Annotated[UploadFile, File()],
    persona: Annotated[str, Form()] = "jack-sparrow",
    language_code: Annotated[str, Form()] = "indic-auto",
) -> Response:
    if persona not in PERSONAS:
        raise HTTPException(status_code=422, detail=f"Unknown persona. Choose from: {', '.join(PERSONAS)}")

    try:
        with audio_file.file, TemporaryDirectory() as directory:
            audio_path = Path(directory) / (Path(audio_file.filename or "audio.wav").name or "audio.wav")
            with audio_path.open("wb") as destination:
                shutil.copyfileobj(audio_file.file, destination)
            result = transcribe(audio_path, language_code=language_code)

        transcript = result["transcript"]
        if not transcript.strip():
            raise HTTPException(status_code=422, detail="No speech detected in the audio.")

        reply = reasoning(PERSONAS[persona], transcript)
        if not reply or not reply.strip():
            raise HTTPException(status_code=502, detail="Text generation returned no reply.")

        embedding = json.loads((EMBEDDINGS_DIR / f"{persona}-embedding.json").read_text())
        audio = clone_voice_tts(embedding, reply)
    except (RuntimeError, ApiError, httpx.HTTPError, requests.RequestException) as exc:
        raise HTTPException(status_code=502, detail="Speech pipeline provider request failed.") from exc

    return Response(
        content=audio,
        media_type="audio/wav",
        headers={"Content-Disposition": 'attachment; filename="reply.wav"'},
    )
