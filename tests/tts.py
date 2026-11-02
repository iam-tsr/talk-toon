import json
from pathlib import Path

from src.tts import clone_voice_tts

embedding = Path(__file__).resolve().parents[1] / "src" / "voice-embed" / "jack-sparrow-embedding.json"
with embedding.open(encoding="utf-8") as f:
    embedding_data = json.load(f)
output_path = Path("output.wav")
text = "खज़ाना? फिलहाल तो मैं सिर्फ़ अपनी आज़ादी और थोड़े सुकून की तलाश में हूँ। वैसे, अगर तुम किसी खास नक्शे की बात कर रहे हो, तो मेरा मतलब है, अगर तुम्हारे पास कोई ऐसी जानकारी है जिससे फायदा हो, तो हम एक सौदा कर सकते हैं। वैसे भी, सबसे बड़ा खज़ाना तो वही होता है जो बिना किसी मुश्किल के मिल जाए।"
output = clone_voice_tts(embedding_data, text)

output_path.write_bytes(output)