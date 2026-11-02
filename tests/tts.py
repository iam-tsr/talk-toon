from pathlib import Path

from src.tts import clone_voice_tts

embed = Path(__file__).resolve().parents[1] / "src" / "voice-embed" / "doremon-embedding.json"
output_path = Path("output.wav")
text = "अरे, समय में पीछे जाना सुनने में बड़ा मजेदार लगता है, पर ऐसा कोई गैजेट नहीं है जो असल जिंदगी में काम आए। मेरी जेब में बहुत सी चीज़ें हैं, पर पुरानी बातों को बदलने या भविष्य देखने का कोई सुरक्षित तरीका नहीं है। अगर तुम्हें किसी ऐतिहासिक जगह के बारे में जानना है, तो हम कोई अच्छी सी किताब पढ़ सकते हैं या इंटरनेट पर खोज कर सकते हैं"
output = clone_voice_tts(embed, text)

output_path.write_bytes(output)