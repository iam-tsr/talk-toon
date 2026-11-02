import mimetypes
from pathlib import Path

import requests

from .config import gnani_settings


def transcribe(audio_path: str | Path) -> dict:
    """Transcribe a short audio file with Gnani Prisma v3.0."""
    audio_path = Path(audio_path)
    content_type = mimetypes.guess_type(audio_path.name)[0] or "application/octet-stream"

    try:
        with audio_path.open("rb") as audio:
            response = requests.post(
                "https://api.vachana.ai/stt/v3",
                headers={"X-API-Key-ID": gnani_settings.api_key},
                files={"audio_file": (audio_path.name, audio, content_type)},
                data={"model": "prisma-v3.0", "language_code": "hi-IN", "format": "transcribe"},
                timeout=60,
            )
        response.raise_for_status()
    except requests.HTTPError as exc:
        raise RuntimeError(
            f"Gnani STT failed (HTTP {response.status_code}): {response.text}"
        ) from exc
    except requests.RequestException as exc:
        raise RuntimeError(f"Gnani STT request failed: {exc}") from exc

    return response.json()