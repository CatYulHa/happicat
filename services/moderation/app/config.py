"""환경 설정. 키가 없어도 서비스가 뜨는 것이 원칙(DRY_RUN 폴백)."""

from __future__ import annotations

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict

NVIDIA_BASE_URL = "https://integrate.api.nvidia.com/v1"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # LLM
    nvidia_api_key: str = ""
    openai_api_key: str = ""
    moderation_model: str = "z-ai/glm-5.2"
    dry_run: bool = False
    llm_timeout_sec: float = 20.0

    # Slack
    slack_webhook_url: str = ""
    slack_channel_hint: str = "#happicat-abuse-alert"
    slack_min_risk_level: int = 1

    # 판정 임계값
    max_travel_kmh: float = 300.0
    max_accuracy_m: float = 200.0
    radius_tolerance_m: float = 30.0

    allowed_origins: str = "http://localhost:5173,http://127.0.0.1:5173"

    @property
    def origins(self) -> list[str]:
        return [o.strip() for o in self.allowed_origins.split(",") if o.strip()]

    @property
    def llm_provider(self) -> str:
        """사용할 LLM 공급자. 키가 없으면 'none' → 규칙 기반 판정만 수행."""
        if self.dry_run:
            return "none"
        if self.nvidia_api_key:
            return "nvidia"
        if self.openai_api_key:
            return "openai"
        return "none"

    @property
    def llm_base_url(self) -> str | None:
        # NVIDIA Build API 는 OpenAI 호환이므로 base_url 만 바꿔 같은 SDK를 쓴다.
        return NVIDIA_BASE_URL if self.llm_provider == "nvidia" else None

    @property
    def llm_api_key(self) -> str:
        return self.nvidia_api_key if self.llm_provider == "nvidia" else self.openai_api_key


@lru_cache
def get_settings() -> Settings:
    return Settings()
