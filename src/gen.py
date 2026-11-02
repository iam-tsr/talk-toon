from openai import OpenAI

from .config import llm_settings

client = OpenAI(
    api_key=llm_settings.api_key,
    base_url=llm_settings.base_url
)

def reasoning(system_prompt: str, user_prompt: str):
    response = client.chat.completions.create(
        model=llm_settings.model,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt}
        ],
        temperature=1,
        max_tokens=100,
    )

    return response.choices[0].message.content