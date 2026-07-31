/**
 * 스케치풍 아이콘 세트.
 * 공통 규칙: 선은 굵고(1.9~2.2) 끝은 둥글게, 면은 최소한으로 — 연필로 그린 느낌.
 */

const STROKE = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}

/** 발바닥 */
export function PawIcon({ className = 'w-5 h-5', filled = false }: { className?: string; filled?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className={className} {...STROKE} fill={filled ? 'currentColor' : 'none'}>
      <ellipse cx="6.6" cy="9.8" rx="2.2" ry="2.8" />
      <ellipse cx="11" cy="6.9" rx="2.2" ry="2.9" />
      <ellipse cx="16.2" cy="7.6" rx="2.1" ry="2.8" />
      <ellipse cx="19.8" cy="11.7" rx="1.9" ry="2.4" />
      <path d="M12.9 12.6c3.2 0 5.8 2.1 5.8 4.7 0 2-1.8 3.4-4 3.4-1.3 0-2.2-.5-3.3-.5s-2 .5-3.3.5c-2.2 0-4-1.4-4-3.4 0-2.6 2.6-4.7 5.8-4.7z" />
    </svg>
  )
}

/** $MEOW 토큰 — 손으로 그린 동전 */
export function MeowCoin({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <circle cx="12" cy="12" r="9.2" fill="var(--color-honey)" stroke="var(--color-ink)" strokeWidth="2" />
      <circle cx="12" cy="12" r="6.4" fill="none" stroke="var(--color-ink)" strokeWidth="1" strokeDasharray="2 2.4" opacity="0.55" />
      {/* 발바닥 각인 */}
      <g fill="var(--color-ink)">
        <ellipse cx="9.6" cy="10.6" rx="0.85" ry="1.1" />
        <ellipse cx="11.9" cy="9.9" rx="0.85" ry="1.15" />
        <ellipse cx="14.2" cy="10.7" rx="0.8" ry="1.05" />
        <ellipse cx="12" cy="14" rx="2.5" ry="1.9" />
      </g>
    </svg>
  )
}

export function HeartIcon({ className = 'w-8 h-8', filled = false }: { className?: string; filled?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className={className} {...STROKE} strokeWidth={2.1} fill={filled ? 'currentColor' : 'none'}>
      {/* 한 번에 그은 듯 좌우가 살짝 비대칭 */}
      <path d="M12 20.4C8.8 18 4.6 14.9 4.6 10.9 4.6 8.4 6.5 6.7 8.7 6.7c1.5 0 2.6.8 3.3 1.9.6-1.2 1.8-2 3.3-2 2.3 0 4.1 1.8 4.1 4.3 0 4-4.1 7-7.4 9.5z" />
    </svg>
  )
}

export function ShareIcon({ className = 'w-7 h-7' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} {...STROKE}>
      <path d="M4.2 12.3v6.4c0 .8.6 1.4 1.4 1.4h12.8c.8 0 1.4-.6 1.4-1.4v-6.5" />
      <path d="M12 16.2V4.3" />
      <path d="M7.6 8.7 12 4.2l4.5 4.4" />
    </svg>
  )
}

export function SoundIcon({ className = 'w-6 h-6', muted = true }: { className?: string; muted?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className={className} {...STROKE}>
      <path d="M4.3 9.6h2.9l3.9-2.9v11l-3.9-2.9H4.3z" />
      {muted ? (
        <>
          <path d="M15.4 9.6l4.2 4.9" />
          <path d="M19.6 9.6l-4.2 4.9" />
        </>
      ) : (
        <>
          <path d="M15.4 9.2c1.2 1.7 1.2 4.3 0 6" />
          <path d="M18.1 7.1c2 2.7 2 8.2 0 10.1" />
        </>
      )}
    </svg>
  )
}

export function PinIcon({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} {...STROKE}>
      <path d="M12 20.8c.4-.5 6.3-6.2 6.3-10.7A6.3 6.3 0 0 0 5.7 9.9c0 4.5 5.9 10.3 6.3 10.9z" />
      <circle cx="12" cy="9.9" r="2.3" />
    </svg>
  )
}

export function WalletIcon({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} {...STROKE}>
      <path d="M3.6 8.2c0-1.3 1-2.3 2.3-2.3h12.3c1.2 0 2.2 1 2.2 2.3v9.5c0 1.3-1 2.3-2.3 2.3H5.8c-1.2 0-2.2-1-2.2-2.3z" />
      <path d="M3.7 10.4h16.6" />
      <circle cx="16.4" cy="14.8" r="1.1" fill="currentColor" stroke="none" />
    </svg>
  )
}

/** 랭킹 탭 — 트로피 */
export function TrophyIcon({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} {...STROKE}>
      <path d="M7.2 4.2h9.6v5.2c0 2.7-2.1 4.8-4.8 4.8s-4.8-2.1-4.8-4.8z" />
      <path d="M7.2 6.1H5c-.7 0-1.2.6-1.1 1.3.3 2 1.6 3.2 3.4 3.3" />
      <path d="M16.8 6.1H19c.7 0 1.2.6 1.1 1.3-.3 2-1.6 3.2-3.4 3.3" />
      <path d="M12 14.2v3.4" />
      <path d="M8.6 20.1h6.8c0-1.4-1-2.5-2.4-2.5h-2c-1.4 0-2.4 1.1-2.4 2.5z" />
    </svg>
  )
}

export function PlayIcon({ className = 'w-16 h-16' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} {...STROKE} strokeWidth={1.8}>
      <circle cx="12" cy="12" r="9.4" fill="var(--color-paper-2)" />
      <path d="M9.6 7.8v8.6l7-4.3z" fill="currentColor" />
    </svg>
  )
}

export function CopyIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} {...STROKE} strokeWidth={1.9}>
      <rect x="9.2" y="9.2" width="10.8" height="10.8" rx="3" />
      <path d="M15.1 5.6A2.4 2.4 0 0 0 12.7 4H6.5A2.4 2.4 0 0 0 4.1 6.4v6.2A2.4 2.4 0 0 0 5.6 15" />
    </svg>
  )
}

/** 제목 아래 손으로 그은 밑줄 */
export function Squiggle({ className = 'w-24 h-2' }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 8" className={className} preserveAspectRatio="none" aria-hidden>
      <path
        d="M1 5.2c14-3.4 28 1.4 42-.6s28-3.6 42-.4 24 2.2 34 .2"
        fill="none"
        stroke="var(--color-honey)"
        strokeWidth="2.6"
        strokeLinecap="round"
        opacity="0.8"
      />
    </svg>
  )
}
