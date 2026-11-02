from pydantic_settings import BaseSettings, SettingsConfigDict


class GnaniSettings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_prefix="GNANI_", extra="ignore")

    api_key: str

class SarvamSettings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_prefix="SARVAM_", extra="ignore")

    api_key: str

gnani_settings = GnaniSettings()
sarvam_settings = SarvamSettings()