from openai import OpenAI
from openai.types.chat import ChatCompletionMessageParam

from .config import llm_settings

client = OpenAI(
    api_key=llm_settings.api_key,
    base_url=llm_settings.base_url
)

def reasoning(messages: list[ChatCompletionMessageParam]) -> str | None:
    response = client.chat.completions.create(
        model=llm_settings.model,
        messages=messages,
        temperature=1,
        max_tokens=100,
    )

    return response.choices[0].message.content