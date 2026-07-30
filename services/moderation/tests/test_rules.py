"""규칙 엔진 단위 테스트 — 네트워크/LLM 없이 실행된다."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest

from app.config import Settings
from app.rules import evaluate_checkin, evaluate_content, fallback_tags, haversine_m, travel_kmh
from app.schemas import CheckinModerationRequest, ContentModerationRequest, GeoPoint

SPOT = GeoPoint(lat=37.5445, lng=127.0557)  # 고양이별 카페 성수점


@pytest.fixture
def cfg() -> Settings:
    return Settings(
        _env_file=None,  # type: ignore[call-arg]
        nvidia_api_key="",
        openai_api_key="",
        slack_webhook_url="",
    )


def checkin(**over) -> CheckinModerationRequest:
    base = dict(
        uid="u_test",
        device_id="dev_test",
        location_id="loc_seongsu_catstar",
        location_name="고양이별 카페 성수점",
        location_geo=SPOT,
        radius_m=100,
        reward_meow=50,
        reported_geo=GeoPoint(lat=37.5446, lng=127.0558),
        accuracy_m=12.0,
        distance_m=13.0,
        fix_elapsed_ms=1200,
    )
    base.update(over)
    return CheckinModerationRequest(**base)  # type: ignore[arg-type]


# ─────────────────────────── 거리/속도 ───────────────────────────


def test_haversine_matches_known_distance():
    # 성수 ↔ 홍대 팝업: 약 11~12km
    hongdae = GeoPoint(lat=37.5563, lng=126.9236)
    d = haversine_m(SPOT, hongdae)
    assert 11_000 < d < 12_500


def test_haversine_same_point_is_zero():
    assert haversine_m(SPOT, SPOT) == pytest.approx(0, abs=1e-6)


def test_travel_kmh_detects_teleport():
    hongdae = GeoPoint(lat=37.5563, lng=126.9236)
    # 11km 를 60초에 이동 = 660km/h
    assert travel_kmh(SPOT, hongdae, 60) > 600


# ─────────────────────────── 체크인 규칙 ───────────────────────────


def test_normal_checkin_is_clean(cfg):
    out = evaluate_checkin(checkin(), cfg)
    assert out.risk_level == 0
    assert out.is_risk is False
    assert out.signals == []


def test_out_of_radius_is_hard_fail(cfg):
    far = GeoPoint(lat=37.5600, lng=127.0700)  # 스팟에서 2km 이상
    out = evaluate_checkin(checkin(reported_geo=far, distance_m=None), cfg)
    assert out.hard_fail is True
    assert out.category == "fake_gps"
    assert out.risk_level == 5


def test_client_reported_distance_mismatch_is_hard_fail(cfg):
    # 좌표는 스팟 안이지만 클라이언트가 거리를 조작해 보낸 경우
    out = evaluate_checkin(checkin(distance_m=900.0), cfg)
    assert out.hard_fail is True
    assert any("불일치" in s for s in out.signals)


def test_zero_accuracy_flags_mock_location(cfg):
    out = evaluate_checkin(checkin(accuracy_m=0), cfg)
    assert out.risk_level == 3
    assert out.category == "fake_gps"
    assert out.is_risk is True


def test_teleport_from_last_checkin(cfg):
    out = evaluate_checkin(
        checkin(
            last_checkin_at=datetime.now(timezone.utc) - timedelta(minutes=1),
            last_checkin_geo=GeoPoint(lat=35.1796, lng=129.0756),  # 부산
        ),
        cfg,
    )
    assert out.hard_fail is True
    assert out.risk_level == 5
    assert any("텔레포트" in s for s in out.signals)


def test_naive_datetime_is_treated_as_utc(cfg):
    """tz 없는 last_checkin_at 이 와도 예외 없이 처리되어야 한다."""
    out = evaluate_checkin(
        checkin(
            last_checkin_at=datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(hours=5),
            last_checkin_geo=GeoPoint(lat=37.5446, lng=127.0558),
        ),
        cfg,
    )
    assert out.hard_fail is False


def test_cooldown_violation_is_flagged(cfg):
    out = evaluate_checkin(
        checkin(
            cooldown_hours=24,
            last_checkin_at=datetime.now(timezone.utc) - timedelta(hours=2),
            last_checkin_geo=SPOT,  # 같은 스팟
        ),
        cfg,
    )
    assert any("쿨다운" in s for s in out.signals)


def test_multi_account_on_same_device(cfg):
    out = evaluate_checkin(checkin(accounts_on_device=4), cfg)
    assert out.category == "multi_account"
    assert out.risk_level == 4
    assert out.is_risk is True


def test_bot_like_checkin_frequency(cfg):
    out = evaluate_checkin(checkin(checkins_last_hour=9), cfg)
    assert out.category == "bot_farming"
    assert out.is_risk is True


def test_instant_gps_fix_is_suspicious(cfg):
    out = evaluate_checkin(checkin(fix_elapsed_ms=5), cfg)
    assert any("자동화" in s for s in out.signals)


# ─────────────────────────── 콘텐츠 규칙 ───────────────────────────


def content(**over) -> ContentModerationRequest:
    base = dict(uid="u_test", video_id="v_test", caption="이불 꾹꾹이 3단 콤보", duration_sec=14)
    base.update(over)
    return ContentModerationRequest(**base)  # type: ignore[arg-type]


def test_normal_content_is_clean(cfg):
    out = evaluate_content(content(), cfg)
    assert out.is_risk is False


def test_gambling_spam_caption(cfg):
    out = evaluate_content(content(caption="바카라 첫충 이벤트 텔레그램 오세요"), cfg)
    assert out.risk_level >= 4
    assert out.category == "spam"


def test_duplicate_upload_is_hard_fail(cfg):
    out = evaluate_content(content(duplicate_of="v_20260730_0007"), cfg)
    assert out.hard_fail is True


def test_dummy_short_video_is_farming(cfg):
    out = evaluate_content(content(duration_sec=0.4), cfg)
    assert out.category == "bot_farming"


def test_fallback_tags_from_caption():
    assert "꾹꾹이" in fallback_tags("이불 꾹꾹이 3단 콤보")
    assert "먹방" in fallback_tags("츄르 뜯는 소리")
    assert fallback_tags("그냥 평범한 하루") == []
