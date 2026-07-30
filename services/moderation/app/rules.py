"""결정론적 규칙 엔진.

LLM 앞단에 두는 이유:
  1) 확실한 어뷰징(반경 초과·텔레포트)은 LLM 없이도 즉시 잡아야 한다.
  2) LLM에게 '근거(signals)'를 함께 주면 환각이 줄고 판정이 재현 가능해진다.
  3) LLM 장애/미설정 시에도 서비스가 판정을 계속할 수 있다.
"""

from __future__ import annotations

import math
import re
from dataclasses import dataclass, field
from datetime import datetime, timezone

from .config import Settings
from .schemas import CheckinModerationRequest, ContentModerationRequest, GeoPoint, RiskCategory

EARTH_R = 6_371_000.0


def haversine_m(a: GeoPoint, b: GeoPoint) -> float:
    """두 좌표 사이 거리(m). 프론트 lib/geo.ts 와 동일한 공식."""
    phi1, phi2 = math.radians(a.lat), math.radians(b.lat)
    d_phi = phi2 - phi1
    d_lambda = math.radians(b.lng - a.lng)
    h = math.sin(d_phi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(d_lambda / 2) ** 2
    return 2 * EARTH_R * math.asin(min(1.0, math.sqrt(h)))


def travel_kmh(a: GeoPoint, b: GeoPoint, elapsed_sec: float) -> float:
    if elapsed_sec <= 0:
        return math.inf
    return haversine_m(a, b) / elapsed_sec * 3.6


@dataclass
class RuleOutcome:
    """규칙 판정 결과. LLM 프롬프트의 근거이자, LLM 부재 시의 최종 판정."""

    signals: list[str] = field(default_factory=list)
    risk_level: int = 0
    category: RiskCategory = "none"
    facts: dict[str, object] = field(default_factory=dict)
    """확정 위험 — LLM이 무해하다고 해도 뒤집을 수 없다."""
    hard_fail: bool = False

    def add(self, signal: str, level: int, category: RiskCategory, *, hard: bool = False) -> None:
        self.signals.append(signal)
        if level > self.risk_level:
            self.risk_level = level
            self.category = category
        if hard:
            self.hard_fail = True

    @property
    def is_risk(self) -> bool:
        return self.hard_fail or self.risk_level >= 3

    def reason(self) -> str:
        if not self.signals:
            return "규칙 검사에서 이상 신호가 없습니다."
        return " / ".join(self.signals)


# ─────────────────────────── 체크인 ───────────────────────────


def evaluate_checkin(req: CheckinModerationRequest, cfg: Settings) -> RuleOutcome:
    out = RuleOutcome()
    server_distance = haversine_m(req.reported_geo, req.location_geo)
    out.facts["server_distance_m"] = round(server_distance, 1)
    out.facts["radius_m"] = req.radius_m
    out.facts["accuracy_m"] = req.accuracy_m

    # 1) 반경 초과 — GPS 오차 완충값까지 감안해도 벗어났다면 확정 거절
    allowed = req.radius_m + cfg.radius_tolerance_m
    if server_distance > allowed:
        out.add(
            f"허용 반경 초과: 스팟에서 {server_distance:.0f}m (허용 {req.radius_m:.0f}m + 오차 {cfg.radius_tolerance_m:.0f}m)",
            5,
            "fake_gps",
            hard=True,
        )

    # 2) 클라이언트가 보낸 거리와 서버 재계산이 다르면 페이로드 조작 의심
    if req.distance_m is not None and abs(req.distance_m - server_distance) > 50:
        out.add(
            f"클라이언트 신고 거리({req.distance_m:.0f}m)와 서버 재계산({server_distance:.0f}m) 불일치",
            4,
            "fake_gps",
            hard=True,
        )

    # 3) 정확도 0 = 모의 위치 앱의 전형적인 흔적
    if req.accuracy_m == 0:
        out.add("GPS 정확도가 0m로 보고됨(모의 위치 앱 특징)", 3, "fake_gps")
    elif req.accuracy_m > cfg.max_accuracy_m:
        out.add(f"GPS 정확도가 낮음({req.accuracy_m:.0f}m)", 1, "none")

    # 4) 텔레포트 — 직전 체크인 대비 이동 속도
    if req.last_checkin_at and req.last_checkin_geo:
        now = datetime.now(timezone.utc)
        last = req.last_checkin_at
        if last.tzinfo is None:
            last = last.replace(tzinfo=timezone.utc)
        elapsed = (now - last).total_seconds()
        speed = travel_kmh(req.last_checkin_geo, req.reported_geo, elapsed)
        out.facts["travel_kmh"] = round(speed, 1) if math.isfinite(speed) else "inf"
        out.facts["since_last_checkin_sec"] = round(elapsed)

        if speed > cfg.max_travel_kmh:
            out.add(
                f"직전 체크인 대비 이동 속도 {speed:.0f}km/h (임계 {cfg.max_travel_kmh:.0f}km/h) — 텔레포트 의심",
                5,
                "fake_gps",
                hard=True,
            )

        # 5) 쿨다운 위반
        if elapsed < req.cooldown_hours * 3600 and haversine_m(req.last_checkin_geo, req.location_geo) < 30:
            out.add(f"쿨다운 위반: 같은 스팟을 {elapsed / 3600:.1f}시간 만에 재인증", 2, "bot_farming")

    # 6) 다계정 파밍
    if req.accounts_on_device >= 3:
        out.add(f"동일 기기에서 {req.accounts_on_device}개 계정 사용", 4, "multi_account")
    elif req.accounts_on_device == 2:
        out.add("동일 기기에서 2개 계정 사용", 1, "multi_account")

    # 7) 짧은 시간 내 반복 체크인
    if req.checkins_last_hour >= 5:
        out.add(f"최근 1시간 체크인 {req.checkins_last_hour}회", 3, "bot_farming")

    # 8) GPS 측위가 비현실적으로 빠름(자동화 스크립트 흔적)
    if req.fix_elapsed_ms is not None and req.fix_elapsed_ms < 30:
        out.add(f"GPS 측위 소요시간 {req.fix_elapsed_ms}ms (자동화 의심)", 2, "bot_farming")

    return out


# ─────────────────────────── 콘텐츠 ───────────────────────────

SPAM_PATTERNS = (
    (re.compile(r"(카지노|바카라|토토|먹튀|파워볼)"), "도박 관련 표현", 4, "spam"),
    (re.compile(r"(코인\s*리딩|급등주|수익\s*보장|원금\s*보장)"), "투자 유인 표현", 4, "spam"),
    (re.compile(r"(텔레\s*그램|오픈\s*카톡|디엠\s*주세요|dm\s*주세요)", re.I), "외부 채널 유도", 3, "spam"),
    (re.compile(r"(https?://|www\.)"), "캡션 내 외부 링크", 2, "spam"),
    (re.compile(r"(때리|학대|괴롭히|던지)"), "동물 학대 의심 표현", 4, "animal_abuse"),
    (re.compile(r"(무료\s*배포|팔로우\s*맞팔|선팔\s*하면)"), "어그로/맞팔 유도", 1, "spam"),
)

CAT_TAG_VOCAB = ("꾹꾹이", "먹방", "식빵", "우다다", "그루밍", "골골송", "냥냥펀치", "박스")


def evaluate_content(req: ContentModerationRequest, _cfg: Settings) -> RuleOutcome:
    out = RuleOutcome()
    out.facts["caption_len"] = len(req.caption)
    out.facts["duration_sec"] = req.duration_sec

    if req.duplicate_of:
        out.add(f"기존 영상({req.duplicate_of})과 중복 업로드", 4, "spam", hard=True)

    if req.uploads_last_hour >= 10:
        out.add(f"최근 1시간 업로드 {req.uploads_last_hour}건 — 봇 업로드 의심", 3, "bot_farming")

    for pattern, label, level, category in SPAM_PATTERNS:
        if pattern.search(req.caption):
            out.add(f"{label} 감지", level, category)  # type: ignore[arg-type]

    if req.duration_sec and req.duration_sec < 1:
        out.add("영상 길이가 1초 미만 — 보상 파밍용 더미 영상 의심", 3, "bot_farming")
    elif req.duration_sec > 180:
        out.add("숏폼 기준(180초) 초과", 1, "none")

    if not req.caption.strip():
        out.add("캡션이 비어 있음", 1, "none")

    return out


def fallback_tags(caption: str) -> list[str]:
    """LLM 미사용 시의 태그 분류(단순 키워드 매칭)."""
    hits = [tag for tag in CAT_TAG_VOCAB if tag in caption]
    if "츄르" in caption or "간식" in caption or "사료" in caption:
        hits.append("먹방")
    return sorted(set(hits))
