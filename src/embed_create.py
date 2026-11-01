import os
import requests

from .config import gnani_settings

url = "https://api.vachana.ai/api/v1/tts/voice-clone/embeddings"

files = { "audio_file": ("shinchan", open("voice-samples/shinchan.mp3", "rb")) }
headers = {"X-API-Key-ID": gnani_settings.api_key}

response = requests.post(url, files=files, headers=headers)


os.makedirs("voice-embed", exist_ok=True)
with open("voice-embed/shinchan-embedding.json", "w") as f:
    f.write(response.text)