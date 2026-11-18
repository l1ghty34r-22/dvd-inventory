from pydantic import field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

DEFAULT_SECRET_KEY = "change-me-in-production"


class Settings(BaseSettings):
    """App configuration, read from environment variables or a .env file."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_env: str = "development"
    database_url: str = "sqlite:///./dvd.db"
    secret_key: str = DEFAULT_SECRET_KEY
    access_token_expire_minutes: int = 60 * 24
    tmdb_api_key: str = ""
    # Optional. Without it barcode lookups use UPCitemdb's free tier (about 100 a day).
    upcitemdb_user_key: str = ""
    cors_origins: str = "http://localhost:5173"
    # The site's public address, used in links inside emails (password reset), e.g.
    # https://neverdisc.onrender.com. Required in production so links can't be pointed elsewhere.
    app_url: str = ""
    # Outgoing email (SMTP). Leave smtp_host empty to print emails to the log instead.
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_username: str = ""
    smtp_password: str = ""
    # Who the email is from, e.g. "NeverDisc <no-reply@yourdomain.com>".
    mail_from: str = ""
    # Folder holding the built frontend. Only present in the production image.
    static_dir: str = "static"

    @field_validator("database_url")
    @classmethod
    def use_psycopg_driver(cls, value: str) -> str:
        # Hosting providers hand out "postgres://" or "postgresql://" URLs.
        # SQLAlchemy needs to be told which driver to use.
        if value.startswith("postgres://"):
            value = "postgresql://" + value.removeprefix("postgres://")
        if value.startswith("postgresql://"):
            value = "postgresql+psycopg://" + value.removeprefix("postgresql://")
        return value

    @model_validator(mode="after")
    def require_real_secret_in_production(self) -> "Settings":
        if self.app_env == "production" and self.secret_key == DEFAULT_SECRET_KEY:
            raise ValueError("Set SECRET_KEY to a long random value before running in production")
        return self

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


settings = Settings()
