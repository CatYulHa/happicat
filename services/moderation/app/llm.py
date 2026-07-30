"""LLM 판정 계층.

- NVIDIA Build API(OpenAI 호환) 또는 OpenAI 를 같은 SDK로 호출한다.
- 응답은 반드시 Pydantic(`RiskAssessment`)으로 검증한다. 실패하면 오류를 되먹여 1회 재시도하고,
  그래도 실패하면 None 을 돌려 규칙 판정으로 폴백한다(서비스는 절대 멈추지 않는다).
"""

from __future__ import annotations

import json
import logging
from typing import Any

from pydantic import ValidationError

from .config import Settings
from .rules import RuleOutcome
from .schemas import RiskAssessment

log = logging.getLogger("happicat.llm")

SYSTEM_PROMPT = """당신은 Web3 리워드 앱 'HappiCat'의 어뷰징 심사관입니다.
HappiCat은 고양이 숏폼 시청과 오프라인 매장 방문(GPS 인증)으로 $MEOW 토큰을 지급합니다.
따라서 다음 두 가지가 회사에 직접적인 금전 손실을 일으킵니다.
  1) 가짜 GPS / 모의 위치 앱으로 방문하지 않고 보상을 받는 행위
  2) 봇·다계정으로 시청·업로드를 반복해 토큰을 파밍하는 행위
  3) 그 외 유해 콘텐츠(선정성, 동물 학대, 도박·투자 스팸, 저작권 침해)

규칙 엔진이 이미 찾아낸 근거(signals)와 원본 데이터를 함께 받습니다.
규칙 근거는 신뢰할 수 있는 사실입니다. 이를 무시하지 말고, 정황을 종합해 최종 판정하세요.
근거가 약하면 낮은 risk_level 과 suggested_action="allow" 를 주는 것이 옳습니다.
과잉 차단은 정상 유저 이탈로 이어지므로, 확실하지 않으면 "review" 를 택하세요.

반드시 지정된 JSON 스키마 하나만 출력하세요. 설명 문장이나 마크다운 코드블록을 붙이지 마세요.
reason 은 한국어로 1~2문장, 백오피스 담당자가 그대로 읽을 수 있게 씁니다."""


def _schema_hint() -> str:
    schema = RiskAssessment.model_json_schema()
    return json.dumps(schema, ensure_ascii=False, indent=2)


def build_user_prompt(kind: str, payload: dict[str, Any], outcome: RuleOutcome) -> str:
    return (
        f"# 심사 대상\n종류: {kind}\n\n"
        f"# 원본 데이터\n{json.dumps(payload, ensure_ascii=False, indent=2, default=str)}\n\n"
        f"# 규칙 엔진 근거 (신뢰 가능한 사실)\n"
        f"- 위험도: {outcome.risk_level}/5, 유형: {outcome.category}, 확정거절: {outcome.hard_fail}\n"
        + ("".join(f"- {s}\n" for s in outcome.signals) or "- (이상 신호 없음)\n")
        + f"\n# 계산된 수치\n{json.dumps(outcome.facts, ensure_ascii=False, default=str)}\n\n"
        f"# 출력 JSON 스키마\n{_schema_hint()}\n"
    )


class LlmJudge:
    """OpenAI 호환 엔드포인트 래퍼. 키가 없으면 enabled=False 로 조용히 비활성화된다."""

    def __init__(self, cfg: Settings) -> None:
        self.cfg = cfg
        self._client: Any | None = None

    @property
    def enabled(self) -> bool:
        return self.cfg.llm_provider != "none"

    def _client_or_none(self) -> Any | None:
        if not self.enabled:
            return None
        if self._client is None:
            try:
                from openai import OpenAI  # 지연 임포트 — 미설치/미사용 환경에서도 앱이 뜬다
            except ImportError:  # pragma: no cover
                log.warning("openai 패키지가 없어 LLM 판정을 건너뜁니다.")
                return None
            self._client = OpenAI(
                api_key=self.cfg.llm_api_key,
                base_url=self.cfg.llm_base_url,  # NVIDIA 일 때만 값이 있다
                timeout=self.cfg.llm_timeout_sec,
            )
        return self._client

    def assess(self, kind: str, payload: dict[str, Any], outcome: RuleOutcome) -> RiskAssessment | None:
        client = self._client_or_none()
        if client is None:
            return None

        messages: list[dict[str, str]] = [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": build_user_prompt(kind, payload, outcome)},
        ]

        raw = ""
        for attempt in (1, 2):
            try:
                completion = client.chat.completions.create(
                    model=self.cfg.moderation_model,
                    messages=messages,
                    temperature=0.1,
                    max_tokens=600,
                    # NVIDIA가 호스팅하는 오픈모델은 json_schema 모드를 지원하지 않는 경우가 있어
                    # json_object + 스키마 프롬프트 + Pydantic 검증 조합을 쓴다.
                    response_format={"type": "json_object"},
                )
                raw = (completion.choices[0].message.content or "").strip()
                return RiskAssessment.model_validate_json(_strip_fence(raw))
            except ValidationError as err:
                log.warning("LLM 응답 스키마 불일치(%s차): %s", attempt, err)
                messages.append({"role": "assistant", "content": raw})
                messages.append(
                    {
                        "role": "user",
                        "content": (
                            "위 응답이 스키마 검증에 실패했습니다. 아래 오류를 고쳐 JSON만 다시 출력하세요.\n"
                            f"{err}"
                        ),
                    }
                )
            except Exception as err:  # 네트워크/레이트리밋/모델 오류
                log.warning("LLM 호출 실패(%s차): %s", attempt, err)
                break

        return None


def _strip_fence(text: str) -> str:
    """모델이 ```json 펜스를 붙여 보내는 경우를 보정."""
    if text.startswith("```"):
        text = text.split("\n", 1)[-1]
        if text.endswith("```"):
            text = text[: -3]
    return text.strip()
