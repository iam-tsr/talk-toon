import json

import requests

from .config import gnani_settings


def clone_voice_tts(embedding, text):
    with embedding.open(encoding="utf-8") as f:
        embedding_data = json.load(f)

    payload = {
        "text": text,
        "model": "vachana-vc-v1",
        "speaker_embedding": embedding_data["data"]["voice_clone_embedding"],
        "audio_config": {
            "sample_rate": 44100,
            "num_channels": 1,
            "sample_width": 2,
            "encoding": "linear_pcm",
            "container": "wav",
        },
    }
    headers = {
        "X-API-Key-ID": gnani_settings.api_key,
        "Content-Type": "application/json",
    }

    try:
        response = requests.post(
            "https://api.vachana.ai/api/v1/tts/inference",
            json=payload,
            headers=headers,
            timeout=(10, 120),
        )
        response.raise_for_status()
    except requests.HTTPError as exc:
        raise SystemExit(f"Gnani TTS failed (HTTP {response.status_code}): {response.text}") from exc
    except requests.RequestException as exc:
        raise SystemExit(f"Gnani TTS request failed: {exc}") from exc

    return response.content