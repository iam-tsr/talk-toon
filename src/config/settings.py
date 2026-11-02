from pydantic_settings import BaseSettings, SettingsConfigDict


class GnaniSettings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_prefix="GNANI_", extra="ignore")

    api_key: str

class LLMSettings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_prefix="LLM_", extra="ignore")

    api_key: str
    base_url: str
    model: str

gnani_settings = GnaniSettings()
llm_settings = LLMSettings()