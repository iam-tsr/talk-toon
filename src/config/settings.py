from pydantic_settings import BaseSettings, SettingsConfigDict


class GnaniSettings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_prefix="GNANI_", extra="ignore")

    api_key: str

gnani_settings = GnaniSettings()