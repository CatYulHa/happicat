# Role
당신은 Web3 및 O2O 플랫폼을 구축하는 시니어 풀스택 개발자이자 AI 엔지니어입니다. 아래의 PRD(제품 요구사항 정의서)를 바탕으로 'CatNip' 프로젝트의 MVP 목업 버전을 개발하기 위한 코드와 아키텍처를 작성해 주세요.

# Project Overview: CatNip
'CatNip'은 고양이 숏폼 콘텐츠 시청(Cat TikTok)과 오프라인 장소 방문(O2O)을 통해 토큰($MEOW)을 획득하고, 이를 범용적인 혜택(기프티콘, 포인트 등)으로 교환할 수 있는 Web3 기반 라이프스타일 리워드 앱입니다.

# 1. MVP 개발 목표 (Core Scope)
이번 MVP 목업에서는 전체 생태계 중 가장 핵심이 되는 **3가지 기능**만 우선 구현하여 사용자 플로우를 검증합니다.

1. **숏폼 피드 (Swipe Video Feed):** 화면을 위아래로 스와이프하여 고양이 영상을 보는 틱톡 UI
2. **O2O 맵핑 & 스팟 인증 (Map & Check-in):** 지도에서 오프라인 이벤트 장소/제휴 매장을 확인하고 GPS로 체크인하여 토큰을 받는 기능
3. **토큰 지갑 & 보상 교환 (Wallet & Reward):** 획득한 $MEOW 토큰 내역을 확인하고 기프티콘(목업)으로 교환하는 화면

# 2. 기술 스택 (Tech Stack) - 서버리스 및 자동화 중심
*   **Frontend:** React (또는 Next.js), TailwindCSS (빠른 UI 목업용)
*   **Backend & DB:** Firebase (Firestore/Auth) 또는 Supabase (서버리스 환경 구축)
*   **AI & Automation:** 
    *   OpenAI API (또는 Gemini API) + `Pydantic` (Structured Outputs 활용)
    *   Python (FastAPI 또는 Cloud Functions)
*   **Admin/Ops:** Slack Bot Webhook (실시간 어뷰징 및 O2O 인증 모니터링 연동)

# 3. 단계별 구현 요구사항 (Implementation Steps)

## Step 1: 데이터베이스 스키마 설계 (NoSQL 기반)
다음 컬렉션에 대한 스키마를 JSON 형태로 설계해 주세요.
*   `Users`: 유저 정보, 현재 보유 토큰량, 지갑 주소
*   `Videos`: 영상 URL, 좋아요 수, LLM이 분류한 태그(예: 꾹꾹이, 먹방)
*   `Locations`: O2O 스팟 정보(위도, 경도, 장소명, 체크인 보상 토큰량)
*   `Transactions`: 토큰 획득/소비 로그

## Step 2: 프론트엔드 핵심 UI 컴포넌트 개발
모바일 뷰 기준으로 아래 3개의 탭(Tab) 화면을 React 코드로 구현해 주세요.
*   **Tab 1 (피드):** 전체 화면 비디오 플레이어, 스와이프 애니메이션, 우측(좋아요, 토큰 후원) 버튼 디자인.
*   **Tab 2 (지도):** Google Maps API 또는 카카오맵 API를 연동한 지도 뷰. 마커(스팟) 클릭 시 "GPS 인증하고 50 MEOW 받기" 모달창 오픈.
*   **Tab 3 (지갑):** 현재 보유 토큰 UI, "스타벅스 아메리카노 교환 (3,000 MEOW)" 버튼이 있는 리워드 샵 UI.

## Step 3: LLM 기반 어뷰징 필터링 및 슬랙(Slack) 모니터링 파이프라인 (백엔드 로직)
유저가 악의적인 콘텐츠를 올리거나 가짜 GPS로 인증하는 리스크를 방지하기 위해 파이썬(Python)으로 백엔드 로직을 작성해 주세요.
*   **요구사항:** 
    1. 유저가 생성한 콘텐츠 메타데이터나 위치 인증 로그가 들어오면 LLM API를 호출하여 위험도를 평가합니다.
    2. LLM의 응답은 반드시 `Pydantic`을 활용해 구조화된 JSON(예: `is_risk`: bool, `reason`: str, `risk_level`: int)으로 받도록 설계하세요.
    3. `is_risk`가 True일 경우, 즉시 Slack Bot Webhook API를 호출하여 백오피스 채널에 알림을 전송하는 코드를 포함하세요.

# 4. 첫 번째 작업 지시
우선 **"Step 1: 데이터베이스 스키마 설계"**와 **"Step 2의 Tab 1(숏폼 피드) React 컴포넌트 목업 코드"**를 먼저 작성해서 보여주세요. 코드는 복사해서 바로 실행할 수 있는 수준이어야 합니다.