import type { CatLocation, Video } from '../types'
import type { GeoFix } from './geo'

/**
 * 어뷰징 판정 백엔드(services/moderation) 클라이언트.
 * 판정은 UX를 막지 않는다 — 실패/타임아웃/미설정이면 조용히 null 을 돌려준다.
 * (보상 홀드·회수는 서버가 원장에서 처리하는 것이 원칙)
 */

const BASE = import.meta.env.VITE_MODERATION_API_URL?.replace(/\/$/, '') ?? ''

export interface RiskAssessment {
  is_risk: boolean
  reason: string
  risk_level: number
  category: string
  confidence: number
  suggested_action: 'allow' | 'review' | 'hold_reward' | 'ban'
  signals: string[]
  tags?: string[]
  source: string
}

async function post<T>(path: string, body: unknown): Promise<T | null> {
  if (!BASE) return null

  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 4000)
  try {
    const res = await fetch(`${BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return (await res.json()) as T
  } catch (err) {
    console.warn('[happicat] moderation 호출 실패(무시하고 진행):', err)
    return null
  } finally {
    clearTimeout(timer)
  }
}

/** 체크인 로그를 서버로 보내 가짜 GPS 여부를 판정받는다. */
export function reportCheckin(args: {
  uid: string
  deviceId: string
  location: CatLocation
  fix: GeoFix
  distanceM: number
  lastCheckinAt?: string
  lastCheckinGeo?: { lat: number; lng: number }
}): Promise<RiskAssessment | null> {
  return post<RiskAssessment>('/v1/moderate/checkin', {
    uid: args.uid,
    device_id: args.deviceId,
    location_id: args.location.locationId,
    location_name: args.location.name,
    location_geo: args.location.geo,
    radius_m: args.location.radiusM,
    reward_meow: args.location.rewardMeow,
    cooldown_hours: args.location.cooldownHours,
    reported_geo: args.fix.coords,
    accuracy_m: args.fix.accuracyM,
    distance_m: args.distanceM,
    fix_elapsed_ms: args.fix.elapsedMs,
    last_checkin_at: args.lastCheckinAt ?? null,
    last_checkin_geo: args.lastCheckinGeo ?? null,
  })
}

/** 업로드 콘텐츠 메타데이터 심사 + 태그 자동 분류 */
export function reportContent(args: { uid: string; video: Pick<Video, 'videoId' | 'caption' | 'durationSec' | 'videoURL'> }) {
  return post<RiskAssessment>('/v1/moderate/content', {
    uid: args.uid,
    video_id: args.video.videoId,
    caption: args.video.caption,
    duration_sec: args.video.durationSec,
    video_url: args.video.videoURL,
  })
}

export const moderationEnabled = Boolean(BASE)
