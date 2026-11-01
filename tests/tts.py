from pathlib import Path

from src.tts import clone_voice_tts

embed = Path(__file__).resolve().parent / "voice-embed" / "amrish-puri-embedding.json"
output_path = Path("output.wav")
text = "मैं तो समझता था कि दुनिया में मुझसे बड़ा कमीना और कोई नहीं है, लेकिन तुमने ऐन मौके पर ऐसा कमीनापन दिखाया कि हम तुम्हारे कमीनेपन के गुलाम हो गए हैं।"
output = clone_voice_tts(embed, text)

output_path.write_bytes(output)