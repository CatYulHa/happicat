import type { GeoPoint } from '../types'

const EARTH_R = 6371e3

/** 두 좌표 사이 거리(m). 체크인 반경 검사의 기준 — 백엔드 rules.py 와 동일한 공식을 쓴다. */
export function haversineM(a: GeoPoint, b: GeoPoint): number {
  const φ1 = (a.lat * Math.PI) / 180
  const φ2 = (b.lat * Math.PI) / 180
  const dφ = φ2 - φ1
  const dλ = ((b.lng - a.lng) * Math.PI) / 180

  const h = Math.sin(dφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(dλ / 2) ** 2
  return 2 * EARTH_R * Math.asin(Math.min(1, Math.sqrt(h)))
}

export function formatDistance(m: number): string {
  if (m < 1000) return `${Math.round(m)}m`
  return `${(m / 1000).toFixed(m < 10000 ? 1 : 0)}km`
}

/** 이동 속도(km/h). 텔레포트(가짜 GPS) 탐지 신호. */
export function speedKmh(from: GeoPoint, to: GeoPoint, elapsedSec: number): number {
  if (elapsedSec <= 0) return Infinity
  return haversineM(from, to) / elapsedSec / 1000 * 3600
}

export interface GeoFix {
  coords: GeoPoint
  accuracyM: number
  /** 개발용 모의 좌표인지 (?mockGps=1) */
  mocked: boolean
  elapsedMs: number
}

export class GeoError extends Error {
  constructor(
    public code: 'unsupported' | 'denied' | 'unavailable' | 'timeout',
    message: string,
  ) {
    super(message)
  }
}

/**
 * 현재 위치 1회 측정.
 * `?mockGps=1` 이면 실제 GPS 대신 target 근처(약 20~40m) 좌표를 반환한다 —
 * 데스크톱에서 체크인 성공 플로우를 확인하기 위한 개발 스위치.
 */
export function getCurrentFix(target?: GeoPoint): Promise<GeoFix> {
  const useMock = new URLSearchParams(window.location.search).get('mockGps') === '1'

  if (useMock && target) {
    const jitter = () => (Math.random() - 0.5) * 0.0006 // 약 ±33m
    return new Promise((resolve) =>
      setTimeout(
        () =>
          resolve({
            coords: { lat: target.lat + jitter(), lng: target.lng + jitter() },
            accuracyM: 12 + Math.random() * 8,
            mocked: true,
            elapsedMs: 900,
          }),
        900,
      ),
    )
  }

  if (!('geolocation' in navigator)) {
    return Promise.reject(new GeoError('unsupported', '이 브라우저는 위치 확인을 지원하지 않습니다.'))
  }

  const startedAt = Date.now()
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          coords: { lat: pos.coords.latitude, lng: pos.coords.longitude },
          accuracyM: pos.coords.accuracy,
          mocked: false,
          elapsedMs: Date.now() - startedAt,
        }),
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          reject(new GeoError('denied', '위치 권한이 거부되었습니다. 브라우저 설정에서 허용해 주세요.'))
        } else if (err.code === err.TIMEOUT) {
          reject(new GeoError('timeout', 'GPS 신호를 찾지 못했습니다. 실외에서 다시 시도해 주세요.'))
        } else {
          reject(new GeoError('unavailable', '위치를 확인할 수 없습니다.'))
        }
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    )
  })
}
