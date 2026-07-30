/**
 * 카카오맵 SDK 동적 로더.
 * VITE_KAKAO_MAP_KEY 가 없거나 로드에 실패하면 null 을 반환하고,
 * MapTab 은 좌표 기반 폴백 목업 지도로 자동 전환된다(키 없이도 체크인 플로우 검증 가능).
 */

// SDK 타입 정의는 설치하지 않으므로 필요한 만큼만 최소로 선언한다.
type KakaoMaps = any // eslint-disable-line @typescript-eslint/no-explicit-any

declare global {
  interface Window {
    kakao?: { maps: KakaoMaps }
  }
}

const SCRIPT_ID = 'kakao-maps-sdk'
let pending: Promise<KakaoMaps | null> | null = null

export function hasKakaoKey(): boolean {
  return Boolean(import.meta.env.VITE_KAKAO_MAP_KEY)
}

export function loadKakaoMaps(): Promise<KakaoMaps | null> {
  if (pending) return pending

  const key = import.meta.env.VITE_KAKAO_MAP_KEY
  if (!key) {
    pending = Promise.resolve(null)
    return pending
  }

  pending = new Promise<KakaoMaps | null>((resolve) => {
    if (window.kakao?.maps?.Map) return resolve(window.kakao.maps)

    const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null
    const script = existing ?? document.createElement('script')

    const onReady = () => {
      // autoload=false 이므로 명시적으로 load 를 호출해야 maps 네임스페이스가 채워진다.
      window.kakao?.maps?.load?.(() => resolve(window.kakao ? window.kakao.maps : null))
    }

    script.onload = onReady
    script.onerror = () => {
      console.warn('[happicat] 카카오맵 SDK 로드 실패 — 폴백 지도로 전환합니다. (도메인 등록 여부 확인)')
      resolve(null)
    }

    if (!existing) {
      script.id = SCRIPT_ID
      script.async = true
      script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${key}&autoload=false`
      document.head.appendChild(script)
    } else if (window.kakao) {
      onReady()
    }

    // 네트워크가 막힌 환경에서 무한 대기하지 않도록 안전장치
    setTimeout(() => resolve(window.kakao?.maps?.Map ? window.kakao.maps : null), 8000)
  })

  return pending
}
