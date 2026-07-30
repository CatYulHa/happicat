import { useEffect, useMemo, useRef, useState } from 'react'
import { useApp } from '../store/AppState'
import type { CheckinOutcome } from '../store/AppState'
import { BottomSheet } from '../components/BottomSheet'
import { MeowCoin, PinIcon } from '../components/MeowIcon'
import { formatDistance, getCurrentFix, GeoError, haversineM } from '../lib/geo'
import { hasKakaoKey, loadKakaoMaps } from '../lib/kakao'
import type { CatLocation } from '../types'

const CATEGORY_LABEL: Record<CatLocation['category'], string> = {
  cafe: '고양이카페',
  popup: '팝업스토어',
  shelter: '보호소',
  store: '제휴매장',
  event: '이벤트',
}

const CATEGORY_EMOJI: Record<CatLocation['category'], string> = {
  cafe: '☕',
  popup: '🎪',
  shelter: '🏠',
  store: '🛍️',
  event: '🎯',
}

export function MapTab() {
  const { locations, balance } = useApp()
  const [selected, setSelected] = useState<CatLocation | null>(null)
  const [kakaoReady, setKakaoReady] = useState<boolean | null>(null) // null=판단중

  useEffect(() => {
    let alive = true
    void loadKakaoMaps().then((maps) => alive && setKakaoReady(Boolean(maps)))
    return () => {
      alive = false
    }
  }, [])

  return (
    <div className="paper relative h-full">
      {kakaoReady === true ? (
        <KakaoMap locations={locations} onSelect={setSelected} />
      ) : (
        <FallbackMap locations={locations} onSelect={setSelected} loading={kakaoReady === null && hasKakaoKey()} />
      )}

      {/* 상단 헤더 */}
      <header className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between px-4 pt-[max(12px,env(safe-area-inset-top))]">
        <div className="sketch-pill bg-paper-2 pointer-events-auto px-3 py-1">
          <h1 className="font-hand text-2xl leading-none">주변 스팟 {locations.length}곳</h1>
        </div>
        <span className="sketch-pill bg-paper-2 pointer-events-auto flex items-center gap-1.5 px-3 py-1">
          <MeowCoin className="h-5 w-5" />
          <span className="font-hand text-xl leading-none font-bold">{balance.toLocaleString()}</span>
        </span>
      </header>

      {/* 하단 스팟 카드 캐러셀 */}
      <div className="no-scrollbar absolute inset-x-0 bottom-[84px] z-20 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 py-2">
        {locations.map((loc, i) => (
          <button
            key={loc.locationId}
            type="button"
            onClick={() => setSelected(loc)}
            className={`sketch sketch-press bg-paper-2 min-w-[76%] snap-start p-3.5 text-left ${
              i % 2 === 0 ? 'tilt-l' : 'tilt-r'
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <span className="text-ink-2 font-hand text-lg leading-none">
                  {CATEGORY_EMOJI[loc.category]} {CATEGORY_LABEL[loc.category]}
                </span>
                <h3 className="font-hand truncate text-2xl leading-tight">{loc.name}</h3>
                <p className="text-ink-3 truncate text-[11px]">{loc.address}</p>
              </div>
              <span className="font-hand text-honey-2 flex shrink-0 items-center gap-1 text-2xl leading-none">
                +{loc.rewardMeow}
                <MeowCoin className="h-5 w-5" />
              </span>
            </div>
            <div className="text-ink-3 mt-2 flex items-center gap-2 text-[10px] font-semibold">
              <span>반경 {loc.radiusM}m</span>
              <span>·</span>
              <span>{loc.cooldownHours}시간마다 1회</span>
              <span>·</span>
              <span>
                오늘 {loc.todayCheckinCount}/{loc.dailyCap}명
              </span>
            </div>
          </button>
        ))}
      </div>

      <CheckinSheet location={selected} onClose={() => setSelected(null)} />
    </div>
  )
}

/* ───────────────────────── 카카오맵 ───────────────────────── */

function KakaoMap({ locations, onSelect }: { locations: CatLocation[]; onSelect: (l: CatLocation) => void }) {
  const boxRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const box = boxRef.current
    if (!box || !locations.length) return

    void loadKakaoMaps().then((maps) => {
      if (!maps || !boxRef.current) return

      const center = new maps.LatLng(locations[0].geo.lat, locations[0].geo.lng)
      const map = new maps.Map(boxRef.current, { center, level: 8 })

      const bounds = new maps.LatLngBounds()
      for (const loc of locations) {
        const pos = new maps.LatLng(loc.geo.lat, loc.geo.lng)
        bounds.extend(pos)

        const marker = new maps.Marker({ map, position: pos, title: loc.name })
        maps.event.addListener(marker, 'click', () => onSelect(loc))

        // 체크인 허용 반경 시각화 (연필로 그린 듯한 옅은 원)
        new maps.Circle({
          map,
          center: pos,
          radius: loc.radiusM,
          strokeWeight: 2,
          strokeColor: '#34302a',
          strokeOpacity: 0.55,
          strokeStyle: 'shortdash',
          fillColor: '#dda641',
          fillOpacity: 0.16,
        })

        const label = new maps.CustomOverlay({
          map,
          position: pos,
          yAnchor: 2.2,
          content:
            `<div style="background:#fffdf8;border:2.5px solid #34302a;color:#34302a;` +
            `font:700 13px Gaegu,Pretendard,sans-serif;padding:2px 9px;border-radius:999px;` +
            `box-shadow:2px 2px 0 rgba(52,48,42,.18);white-space:nowrap">+${loc.rewardMeow} MEOW</div>`,
        })
        label.setMap(map)
      }
      map.setBounds(bounds)
    })
  }, [locations, onSelect])

  return <div ref={boxRef} className="h-full w-full" />
}

/* ───────────────────────── 폴백 목업 지도 ───────────────────────── */

/** 카카오 키가 없을 때 쓰는 손그림 지도 — 체크인 플로우 검증용 */
function FallbackMap({
  locations,
  onSelect,
  loading,
}: {
  locations: CatLocation[]
  onSelect: (l: CatLocation) => void
  loading: boolean
}) {
  const bounds = useMemo(() => {
    if (!locations.length) return null
    const lats = locations.map((l) => l.geo.lat)
    const lngs = locations.map((l) => l.geo.lng)
    const pad = 0.012
    return {
      minLat: Math.min(...lats) - pad,
      maxLat: Math.max(...lats) + pad,
      minLng: Math.min(...lngs) - pad,
      maxLng: Math.max(...lngs) + pad,
    }
  }, [locations])

  return (
    <div className="paper-grid relative h-full w-full overflow-hidden">
      {/* 손으로 그린 강과 길 */}
      <svg className="absolute inset-0 h-full w-full" preserveAspectRatio="none" viewBox="0 0 100 100" aria-hidden>
        <path
          d="M-4 62 C 18 58, 30 68, 48 64 S 78 56, 104 61"
          fill="none"
          stroke="var(--color-sky)"
          strokeWidth="7"
          strokeLinecap="round"
          opacity="0.35"
        />
        <path
          d="M12 -4 C 16 24, 34 38, 40 66 S 46 92, 44 104"
          fill="none"
          stroke="var(--color-ink)"
          strokeWidth="1.1"
          strokeDasharray="3 3"
          opacity="0.28"
        />
        <path
          d="M-4 30 C 28 26, 56 36, 104 28"
          fill="none"
          stroke="var(--color-ink)"
          strokeWidth="1.1"
          strokeDasharray="3 3"
          opacity="0.28"
        />
      </svg>

      {bounds &&
        locations.map((loc) => {
          const left = ((loc.geo.lng - bounds.minLng) / (bounds.maxLng - bounds.minLng)) * 100
          const top = (1 - (loc.geo.lat - bounds.minLat) / (bounds.maxLat - bounds.minLat)) * 100
          return (
            <button
              key={loc.locationId}
              type="button"
              onClick={() => onSelect(loc)}
              className="sketch-press absolute z-10 -translate-x-1/2 -translate-y-full"
              style={{ left: `${left}%`, top: `${top}%` }}
              aria-label={`${loc.name} 스팟`}
            >
              <span className="border-ink absolute -bottom-3 left-1/2 h-10 w-10 -translate-x-1/2 animate-ping-ring rounded-full border-2 opacity-40" />
              <span className="relative flex flex-col items-center">
                <span className="sketch-pill bg-paper-2 font-hand px-2 py-0 text-lg leading-tight whitespace-nowrap">
                  +{loc.rewardMeow}
                </span>
                <PinIcon className="text-ink mt-0.5 h-8 w-8" />
              </span>
            </button>
          )
        })}

      <div className="text-ink-3 font-hand absolute top-[38%] left-1/2 z-0 w-60 -translate-x-1/2 text-center text-lg leading-snug">
        {loading ? (
          '카카오맵을 불러오는 중…'
        ) : (
          <>
            <span className="text-ink-2">손그림 목업 지도</span>
            <br />
            .env 에 VITE_KAKAO_MAP_KEY 를 넣으면
            <br />
            실제 카카오맵으로 바뀝니다
          </>
        )}
      </div>
    </div>
  )
}

/* ───────────────────────── 체크인 시트 ───────────────────────── */

type Phase = 'idle' | 'locating' | 'done'

function CheckinSheet({ location, onClose }: { location: CatLocation | null; onClose: () => void }) {
  const { checkin } = useApp()
  const [phase, setPhase] = useState<Phase>('idle')
  const [outcome, setOutcome] = useState<CheckinOutcome | null>(null)

  useEffect(() => {
    setPhase('idle')
    setOutcome(null)
  }, [location])

  if (!location) return null

  const run = async () => {
    setPhase('locating')
    try {
      const fix = await getCurrentFix(location.geo)
      const result = await checkin(location, fix)
      setOutcome({ ...result, distanceM: result.distanceM ?? haversineM(fix.coords, location.geo) })
    } catch (err) {
      const message = err instanceof GeoError ? err.message : '위치 확인에 실패했습니다.'
      setOutcome({ status: 'error', message })
    } finally {
      setPhase('done')
    }
  }

  const success = outcome?.status === 'success'

  return (
    <BottomSheet open onClose={onClose} title={location.name}>
      <div className="flex items-center gap-2">
        <span className="text-ink-2 font-hand text-lg leading-none">
          {CATEGORY_EMOJI[location.category]} {CATEGORY_LABEL[location.category]}
        </span>
        {location.requiresPhoto && (
          <span className="border-line text-ink-2 font-hand rounded-full border-2 bg-paper-2 px-2 text-base leading-tight">
            사진 인증 필요
          </span>
        )}
      </div>
      <p className="text-ink-2 mt-1.5 text-[13px]">{location.address}</p>
      {location.description && <p className="text-ink-3 mt-1 text-[12px]">{location.description}</p>}

      <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
        <Stat label="보상" value={`+${location.rewardMeow}`} accent />
        <Stat label="허용 반경" value={`${location.radiusM}m`} />
        <Stat label="재인증" value={`${location.cooldownHours}h`} />
      </dl>

      {/* 결과 표시 */}
      {outcome && (
        <div
          className={`sketch-soft mt-4 p-3.5 text-[13px] ${
            success
              ? 'border-sage bg-sage/15 text-ink'
              : outcome.status === 'duplicate'
                ? 'border-sky bg-sky/15 text-ink'
                : 'border-clay bg-clay/12 text-ink'
          }`}
        >
          <p className="font-hand text-xl leading-tight">{outcome.message}</p>
          {typeof outcome.distanceM === 'number' && (
            <p className="text-ink-2 mt-1 text-[11px]">
              스팟까지 {formatDistance(outcome.distanceM)} · 허용 {location.radiusM}m
            </p>
          )}
          {success && (
            <p className="text-ink-2 mt-1 text-[11px]">+{outcome.earned} MEOW 가 지갑에 적립되었습니다.</p>
          )}
          {outcome.risk?.is_risk && (
            <p className="text-clay mt-1.5 text-[11px]">
              ⚠️ 어뷰징 의심(위험도 {outcome.risk.risk_level}): {outcome.risk.reason}
            </p>
          )}
        </div>
      )}

      <button
        type="button"
        disabled={phase === 'locating' || success}
        onClick={() => void run()}
        className={`sketch-soft sketch-press font-hand mt-4 flex w-full items-center justify-center gap-2 py-3 text-2xl leading-none ${
          success ? 'bg-sage/30' : phase === 'locating' ? 'bg-paper-3' : 'bg-honey'
        }`}
      >
        {phase === 'locating' ? (
          <>
            <span className="border-ink/30 border-t-ink h-4 w-4 animate-spin rounded-full border-2" />
            GPS 확인 중…
          </>
        ) : success ? (
          '인증 완료 🐾'
        ) : (
          <>
            <PinIcon className="h-5 w-5" />
            GPS 인증하고 {location.rewardMeow} MEOW 받기
          </>
        )}
      </button>

      <p className="text-ink-3 mt-2.5 text-center text-[10px] leading-relaxed">
        인증 로그(좌표·정확도·거리)는 어뷰징 판정 서버로 전송됩니다.
        <br />
        데스크톱에서는 URL에 <code className="text-ink-2">?mockGps=1</code> 을 붙이면 성공 플로우를 볼 수 있어요.
      </p>
    </BottomSheet>
  )
}

function Stat({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={`sketch-thin py-2 ${accent ? 'bg-honey/25' : 'bg-paper-2'}`}>
      <dt className="text-ink-3 text-[10px] font-bold">{label}</dt>
      <dd className={`font-hand mt-0.5 text-xl leading-none ${accent ? 'text-honey-2' : 'text-ink'}`}>{value}</dd>
    </div>
  )
}
