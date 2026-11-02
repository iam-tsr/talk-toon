from sarvamai import SarvamAI

from .config import sarvam_settings
from .persona import deadpool_prompt

client = SarvamAI(api_subscription_key=sarvam_settings.api_key)

response = client.chat.completions(
    model="sarvam-105b-conversations",
    messages=[
        {"role": "system", "content": deadpool_prompt},
        {"role": "user", "content": "who are you?"}
    ],
    temperature=1,
    top_p=1,
    max_tokens=100,
)

print(response.choices[0].message.content)
