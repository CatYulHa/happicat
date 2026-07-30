"""요청/응답 모델. LLM 응답은 반드시 RiskAssessment 로 검증해서 받는다."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

RiskCategory = Literal[
    "none",
    "fake_gps",
    "bot_farming",
    "multi_account",
    "nsfw",
    "spam",
    "copyright",
    "animal_abuse",
]

SuggestedAction = Literal["allow", "review", "hold_reward", "ban"]


class GeoPoint(BaseModel):
    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)


# ─────────────────────────── LLM 구조화 출력 ───────────────────────────


class RiskAssessment(BaseModel):
    """LLM이 채워야 하는 스키마. 이 형태로 파싱되지 않으면 재시도 후 규칙 판정으로 폴백한다."""

    is_risk: bool = Field(description="어뷰징/유해 콘텐츠로 판단되면 true")
    reason: str = Field(description="판정 근거를 한국어 1~2문장으로", max_length=400)
    risk_level: int = Field(ge=0, le=5, description="0=정상, 5=확실한 어뷰징")
    category: RiskCategory = Field(default="none", description="위험 유형")
    confidence: float = Field(default=0.5, ge=0, le=1, description="판정 확신도")
    suggested_action: SuggestedAction = Field(default="allow", description="권고 조치")
    tags: list[str] = Field(
        default_factory=list,
        description="콘텐츠 심사일 때만: 고양이 콘텐츠 태그(꾹꾹이/먹방/식빵/우다다/그루밍/골골송/냥냥펀치/박스)",
    )


class AssessmentResponse(RiskAssessment):
    """API 응답 = LLM 판정 + 결정론적 근거 + 출처."""

    signals: list[str] = Field(default_factory=list, description="규칙 엔진이 찾은 근거")
    source: Literal["rules", "llm", "llm+rules"] = "rules"
    subject_type: Literal["checkin", "content"] = "checkin"
    subject_id: str = ""


# ─────────────────────────── 요청 ───────────────────────────


class CheckinModerationRequest(BaseModel):
    """O2O GPS 인증 로그."""

    uid: str
    device_id: str = "unknown"
    location_id: str
    location_name: str = ""
    location_geo: GeoPoint
    radius_m: float = 100
    reward_meow: int = 0
    cooldown_hours: float = 24

    reported_geo: GeoPoint
    accuracy_m: float = Field(default=0, ge=0, description="GPS 정확도(m). 0이면 모의 위치 의심")
    distance_m: float | None = Field(default=None, description="클라이언트가 계산한 거리(서버가 재계산해 검증)")
    fix_elapsed_ms: int | None = None

    last_checkin_at: datetime | None = None
    last_checkin_geo: GeoPoint | None = None
    accounts_on_device: int = Field(default=1, ge=1, description="같은 deviceId 를 쓰는 계정 수")
    checkins_last_hour: int = Field(default=0, ge=0)


class ContentModerationRequest(BaseModel):
    """업로드 콘텐츠 메타데이터."""

    uid: str
    video_id: str
    caption: str = ""
    duration_sec: float = 0
    video_url: str = ""
    uploads_last_hour: int = Field(default=0, ge=0)
    duplicate_of: str | None = Field(default=None, description="동일 해시/캡션 영상이 이미 있으면 그 videoId")
