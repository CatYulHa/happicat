"""Slack Incoming Webhook 알림.

is_risk=True 인 판정을 백오피스 채널로 즉시 흘린다.
전송 실패는 로깅만 하고 요청 흐름을 막지 않는다(알림 장애가 서비스 장애가 되면 안 된다).
SLACK_WEBHOOK_URL 이 없으면 콘솔에 같은 내용을 출력한다 — 목업 단계에서도 흐름을 눈으로 확인할 수 있게.
"""

from __future__ import annotations

import json
import logging
from typing import Any

import httpx

from .config import Settings
from .schemas import AssessmentResponse

log = logging.getLogger("happicat.slack")

LEVEL_EMOJI = {0: "🟢", 1: "🟢", 2: "🟡", 3: "🟠", 4: "🔴", 5: "🚨"}
ACTION_LABEL = {
    "allow": "지급 유지",
    "review": "수동 검토 필요",
    "hold_reward": "보상 홀드",
    "ban": "계정 정지 권고",
}


def build_payload(result: AssessmentResponse, context: dict[str, Any], cfg: Settings) -> dict[str, Any]:
    emoji = LEVEL_EMOJI.get(result.risk_level, "❔")
    title = f"{emoji} 어뷰징 의심 감지 · risk {result.risk_level}/5 · {result.category}"

    fields = [
        f"*유저*\n`{context.get('uid', '-')}`",
        f"*대상*\n{result.subject_type} `{result.subject_id}`",
        f"*권고 조치*\n{ACTION_LABEL.get(result.suggested_action, result.suggested_action)}",
        f"*판정 출처*\n{result.source} (확신도 {result.confidence:.0%})",
    ]
    for key, label in (
        ("location_name", "스팟"),
        ("distance_m", "스팟까지 거리(m)"),
        ("accuracy_m", "GPS 정확도(m)"),
        ("reward_meow", "지급 예정(MEOW)"),
        ("device_id", "디바이스"),
    ):
        if context.get(key) is not None:
            fields.append(f"*{label}*\n{context[key]}")

    signal_text = "\n".join(f"• {s}" for s in result.signals) or "• (규칙 신호 없음 — LLM 판정)"

    return {
        "text": title,  # 알림 미리보기/폴백
        "blocks": [
            {"type": "header", "text": {"type": "plain_text", "text": title, "emoji": True}},
            {
                "type": "section",
                "text": {"type": "mrkdwn", "text": f"*판정 근거*\n{result.reason}"},
            },
            {"type": "section", "fields": [{"type": "mrkdwn", "text": f} for f in fields[:10]]},
            {"type": "section", "text": {"type": "mrkdwn", "text": f"*규칙 신호*\n{signal_text}"}},
            {
                "type": "actions",
                "elements": [
                    {
                        "type": "button",
                        "text": {"type": "plain_text", "text": "보상 회수", "emoji": True},
                        "style": "danger",
                        "value": f"reverse:{result.subject_id}",
                        "action_id": "happicat_reverse_reward",
                    },
                    {
                        "type": "button",
                        "text": {"type": "plain_text", "text": "정상 처리", "emoji": True},
                        "value": f"approve:{result.subject_id}",
                        "action_id": "happicat_approve",
                    },
                ],
            },
            {
                "type": "context",
                "elements": [
                    {"type": "mrkdwn", "text": f"HappiCat moderation · {cfg.slack_channel_hint}"},
                ],
            },
        ],
    }


def notify(result: AssessmentResponse, context: dict[str, Any], cfg: Settings) -> bool:
    """알림 전송. 성공 여부를 돌려주지만 호출자는 무시해도 된다."""
    payload = build_payload(result, context, cfg)

    if not cfg.slack_webhook_url:
        log.warning(
            "[SLACK 미설정 — 콘솔 출력] %s",
            json.dumps(payload, ensure_ascii=False, indent=2),
        )
        return False

    try:
        res = httpx.post(cfg.slack_webhook_url, json=payload, timeout=5.0)
        res.raise_for_status()
        log.info("Slack 알림 전송 완료: %s %s", result.subject_type, result.subject_id)
        return True
    except Exception as err:  # 알림 실패가 요청 실패로 번지지 않게 삼킨다
        log.error("Slack 알림 전송 실패: %s", err)
        return False
