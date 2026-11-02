from pathlib import Path

from src.tts import clone_voice_tts

embed = Path(__file__).resolve().parents[1] / "src" / "voice-embed" / "jack-sparrow-embedding.json"
output_path = Path("output.wav")
text = "हवा में खज़ाने की महक हमेशा रहती है दोस्त। मेरा मतलब, जो सच में मिलने वाला हो, वह बहुत कम होता है। अपनी ब्लैक पर्ल की पतवार कस लो और नज़रें खुली रखो, रास्ता अपने आप दिख जाएगा।"
output = clone_voice_tts(embed, text)

output_path.write_bytes(output)