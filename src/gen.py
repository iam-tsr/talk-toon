from sarvamai import SarvamAI

from .config import sarvam_settings

client = SarvamAI(api_subscription_key=sarvam_settings.api_key)

def reasoning(system_prompt: str, user_prompt: str):
    response = client.chat.completions(
        model="sarvam-105b-conversations",
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt}
        ],
        temperature=1,
        top_p=1,
        max_tokens=100,
    )

    return response.choices[0].message.content
