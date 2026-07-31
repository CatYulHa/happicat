import { useState } from 'react'
import type { CardRarity, CatCardData } from '../types'
import { MeowCoin } from './MeowIcon'

/**
 * 획득한 $MEOW 를 고양이 카드로 보여준다.
 *
 * 카드 외형은 트랜잭션 id 를 시드로 "절차적으로" 그린다 —
 * 이미지 파일도, 외부 CDN도 필요 없고, 같은 보상은 언제나 같은 고양이가 나온다.
 * (오프라인에서도 깨지지 않는다는 뜻이기도 하다)
 */

/* ───────────────────────── 시드 → 외형 ───────────────────────── */

/** FNV-1a — 문자열을 32bit 정수로 */
function hashOf(seed: string): number {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/** 채도를 낮춘 고양이 털색 6종 (형광 없음) */
const FURS = [
  { key: '치즈', body: '#e2ab63', shade: '#c98f45' },
  { key: '고등어', body: '#9aa3ae', shade: '#7c8792' },
  { key: '삼색', body: '#d8c3a5', shade: '#b98f6b' },
  { key: '까망', body: '#5b544c', shade: '#433d37' },
  { key: '하양', body: '#f0e7d8', shade: '#d3c8b5' },
  { key: '턱시도', body: '#6f675c', shade: '#514a42' },
] as const

const PATTERNS = ['민무늬', '줄무늬', '점박이'] as const
const MOODS = ['동그란눈', '실눈', '윙크', '하트눈'] as const

export interface CatTraits {
  fur: (typeof FURS)[number]
  pattern: (typeof PATTERNS)[number]
  mood: (typeof MOODS)[number]
  hasCollar: boolean
}

export function catTraits(seed: string): CatTraits {
  const h = hashOf(seed)
  return {
    fur: FURS[h % FURS.length],
    pattern: PATTERNS[(h >>> 4) % PATTERNS.length],
    mood: MOODS[(h >>> 8) % MOODS.length],
    hasCollar: (h >>> 12) % 4 === 0,
  }
}

/* ───────────────────────── 희귀도 ───────────────────────── */

export const RARITY = {
  legend: { label: '전설', ring: 'border-honey', bg: 'bg-honey/18', text: 'text-honey-2' },
  epic: { label: '에픽', ring: 'border-lilac', bg: 'bg-lilac/15', text: 'text-lilac' },
  rare: { label: '희귀', ring: 'border-sky', bg: 'bg-sky/15', text: 'text-sky' },
  normal: { label: '일반', ring: 'border-line', bg: 'bg-paper-2', text: 'text-ink-3' },
} as const satisfies Record<CardRarity, { label: string; ring: string; bg: string; text: string }>

/** 한 번에 받은 양이 많을수록 귀한 카드 */
export function rarityOf(amount: number): CardRarity {
  if (amount >= 200) return 'legend'
  if (amount >= 50) return 'epic'
  if (amount >= 20) return 'rare'
  return 'normal'
}

/* ───────────────────────── 고양이 얼굴 SVG ───────────────────────── */

const INK = 'var(--color-ink)'

export function CatFace({ seed, className = 'w-full h-full' }: { seed: string; className?: string }) {
  const { fur, pattern, mood, hasCollar } = catTraits(seed)

  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden>
      {/* 귀 */}
      <path
        d="M22 42 L20 17 L42 30 Z M78 42 L80 17 L58 30 Z"
        fill={fur.body}
        stroke={INK}
        strokeWidth="2.6"
        strokeLinejoin="round"
      />
      <path d="M26 37 L25 24 L37 31 Z M74 37 L75 24 L63 31 Z" fill="#e8b7b0" opacity="0.85" />

      {/* 얼굴 */}
      <path
        d="M50 26c17 0 29 12 29 27 0 17-13 28-29 28S21 70 21 53c0-15 12-27 29-27z"
        fill={fur.body}
        stroke={INK}
        strokeWidth="2.8"
        strokeLinejoin="round"
      />

      {/* 무늬 */}
      {pattern === '줄무늬' && (
        <g stroke={fur.shade} strokeWidth="3.2" strokeLinecap="round" opacity="0.9">
          <path d="M44 31 L42 39" />
          <path d="M50 29 L50 38" />
          <path d="M56 31 L58 39" />
          <path d="M26 50 L33 52" />
          <path d="M74 50 L67 52" />
        </g>
      )}
      {pattern === '점박이' && (
        <g fill={fur.shade} opacity="0.85">
          <ellipse cx="34" cy="40" rx="6" ry="5" />
          <ellipse cx="68" cy="62" rx="7" ry="5.5" />
          <ellipse cx="63" cy="36" rx="4" ry="3.2" />
        </g>
      )}

      {/* 눈 */}
      {mood === '동그란눈' && (
        <g>
          <ellipse cx="39" cy="52" rx="5.4" ry="6.2" fill={INK} />
          <ellipse cx="61" cy="52" rx="5.4" ry="6.2" fill={INK} />
          <circle cx="41" cy="50" r="1.8" fill="#fff" />
          <circle cx="63" cy="50" r="1.8" fill="#fff" />
        </g>
      )}
      {mood === '실눈' && (
        <g stroke={INK} strokeWidth="3" strokeLinecap="round" fill="none">
          <path d="M33 53 q6 -5 12 0" />
          <path d="M55 53 q6 -5 12 0" />
        </g>
      )}
      {mood === '윙크' && (
        <g>
          <ellipse cx="39" cy="52" rx="5.4" ry="6.2" fill={INK} />
          <circle cx="41" cy="50" r="1.8" fill="#fff" />
          <path d="M55 53 q6 -5 12 0" stroke={INK} strokeWidth="3" strokeLinecap="round" fill="none" />
        </g>
      )}
      {mood === '하트눈' && (
        <g fill="#c4705a">
          <path d="M39 48c2-3 6-1 6 2 0 3-4 6-6 8-2-2-6-5-6-8 0-3 4-5 6-2z" />
          <path d="M61 48c2-3 6-1 6 2 0 3-4 6-6 8-2-2-6-5-6-8 0-3 4-5 6-2z" />
        </g>
      )}

      {/* 코·입 */}
      <path d="M47 62 L53 62 L50 66 Z" fill="#c4705a" stroke={INK} strokeWidth="1.4" strokeLinejoin="round" />
      <path
        d="M50 66 q-4 5 -8 2 M50 66 q4 5 8 2"
        stroke={INK}
        strokeWidth="2.2"
        strokeLinecap="round"
        fill="none"
      />

      {/* 수염 */}
      <g stroke={INK} strokeWidth="1.6" strokeLinecap="round" opacity="0.75">
        <path d="M30 60 L14 56 M30 64 L14 66" />
        <path d="M70 60 L86 56 M70 64 L86 66" />
      </g>

      {/* 목걸이 (희소 특성) */}
      {hasCollar && (
        <g>
          <path d="M32 78 q18 9 36 0" stroke="#c4705a" strokeWidth="4.5" fill="none" strokeLinecap="round" />
          <circle cx="50" cy="83" r="3.4" fill="var(--color-honey)" stroke={INK} strokeWidth="1.6" />
        </g>
      )}
    </svg>
  )
}

/* ───────────────────────── 카드 ───────────────────────── */

export function CatCard({ card, index = 0 }: { card: CatCardData; index?: number }) {
  const [flipped, setFlipped] = useState(false)
  const style = RARITY[card.rarity]
  const traits = catTraits(card.seed)
  const tilt = index % 2 === 0 ? 'tilt-l' : 'tilt-r'

  return (
    <button
      type="button"
      onClick={() => setFlipped((f) => !f)}
      className={`sketch-press aspect-[3/4] w-full ${tilt}`}
      style={{ perspective: '900px' }}
      aria-label={`${card.title} 카드 — 눌러서 뒤집기`}
    >
      <div
        className="relative h-full w-full"
        style={{
          transformStyle: 'preserve-3d',
          transform: flipped ? 'rotateY(180deg)' : 'none',
          transition: 'transform .5s var(--ease-out-soft)',
        }}
      >
        {/* 앞면 */}
        <div
          className={`absolute inset-0 flex flex-col rounded-3xl border-[2.5px] p-2 shadow-[3px_3px_0_rgba(52,48,42,0.14)] ${style.ring} ${style.bg}`}
          style={{ backfaceVisibility: 'hidden' }}
        >
          <div className="flex items-center justify-between px-0.5">
            <span className={`font-hand text-base leading-none ${style.text}`}>{style.label}</span>
            {card.rarity === 'legend' && <span className="text-[11px]">✨</span>}
          </div>

          <div className="relative flex-1">
            <CatFace seed={card.seed} className="h-full w-full" />
          </div>

          <div className="bg-paper-2/85 border-line rounded-2xl border px-1.5 py-1 text-center">
            <span className="font-hand flex items-center justify-center gap-1 text-xl leading-none">
              <MeowCoin className="h-4 w-4" />+{card.amount.toLocaleString()}
            </span>
            <span className="text-ink-3 mt-0.5 block truncate text-[10px] leading-tight">{card.title}</span>
          </div>
        </div>

        {/* 뒷면 — 이 카드가 어떤 보상에서 나왔는지 */}
        <div
          className={`bg-paper-2 absolute inset-0 flex flex-col justify-between rounded-3xl border-[2.5px] p-3 text-left shadow-[3px_3px_0_rgba(52,48,42,0.14)] ${style.ring}`}
          style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
        >
          <div>
            <p className={`font-hand text-lg leading-none ${style.text}`}>{style.label} 카드</p>
            <p className="font-hand mt-1 text-base leading-tight">{card.title}</p>
            <p className="text-ink-3 mt-1 text-[10px] leading-snug">{card.source}</p>
          </div>

          <dl className="text-[10px] leading-tight">
            <div className="flex justify-between">
              <dt className="text-ink-3">획득</dt>
              <dd>{card.earnedAt.slice(0, 10)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ink-3">털/무늬</dt>
              <dd>
                {traits.fur.key}·{traits.pattern}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ink-3">표정</dt>
              <dd>
                {traits.mood}
                {traits.hasCollar ? '·목걸이' : ''}
              </dd>
            </div>
          </dl>

          <p className="text-ink-3 border-line truncate border-t pt-1 font-mono text-[9px]" title={card.idempotencyKey}>
            {card.idempotencyKey}
          </p>
        </div>
      </div>
    </button>
  )
}
