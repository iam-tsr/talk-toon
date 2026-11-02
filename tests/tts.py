from pathlib import Path

from src.tts import clone_voice_tts

embed = Path(__file__).resolve().parents[1] / "src" / "voice-embed" / "deadpool-embedding.json"
output_path = Path("output.wav")
text = "अरे यार, नाम है वेड। डेडपूल, अगर किसी फिल्म के पोस्टर पर देखना हो तो। बाकी जो भी है, बस एक भाड़े का लड़ाका हूँ जो अपनी ही बातों में उलझ जाता है। सच बताऊँ तो कभी-कभी खुद ही भूल जाता हूँ कि आखिर मैं हूँ कौन। तुम बताओ, तुम्हारा क्या सीन है?"
output = clone_voice_tts(embed, text)

output_path.write_bytes(output)