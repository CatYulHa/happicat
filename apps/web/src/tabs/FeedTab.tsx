import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useApp } from '../store/AppState'
import { BottomSheet } from '../components/BottomSheet'
import { HeartIcon, MeowCoin, PawIcon, PlayIcon, ShareIcon, SoundIcon } from '../components/MeowIcon'
import type { Video } from '../types'

const TIP_PRESETS = [10, 50, 100, 500]

/** 시청 보상 지급 기준 (초) — 이 시간 이상 보면 watch_reward 1회 지급 */
const WATCH_GOAL_SEC = 5

export function FeedTab() {
  const { videos, likedIds, toggleLike, tipVideo, claimWatchReward, balance } = useApp()
  const [activeIdx, setActiveIdx] = useState(0)
  const [muted, setMuted] = useState(true)
  const [tipTarget, setTipTarget] = useState<Video | null>(null)

  /** 화면에 들어온 슬라이드만 재생 (IntersectionObserver) */
  const onVisible = useCallback((idx: number) => setActiveIdx(idx), [])

  if (!videos.length) {
    return (
      <div className="text-ink-3 font-hand flex h-full items-center justify-center text-2xl">
        <PawIcon className="mr-2 h-6 w-6 animate-wobble" /> 피드를 불러오는 중…
      </div>
    )
  }

  return (
    <div className="paper relative h-full">
      <div className="snap-feed no-scrollbar h-full overflow-y-scroll overscroll-y-contain">
        {videos.map((video, idx) => (
          <FeedSlide
            key={video.videoId}
            idx={idx}
            video={video}
            active={idx === activeIdx}
            muted={muted}
            liked={likedIds.has(video.videoId)}
            onVisible={onVisible}
            onToggleMute={() => setMuted((m) => !m)}
            onToggleLike={() => void toggleLike(video.videoId)}
            onTip={() => setTipTarget(video)}
            onWatchGoal={() => void claimWatchReward(video)}
          />
        ))}
      </div>

      {/* 상단 헤더 */}
      <header className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-center justify-between px-4 pt-[max(12px,env(safe-area-inset-top))]">
        <span className="font-hand text-3xl leading-none">
          happi <span className="text-honey-2">cat</span>
        </span>
        <span className="sketch-pill bg-paper-2 pointer-events-auto flex items-center gap-1.5 px-3 py-1">
          <MeowCoin className="h-5 w-5" />
          <span className="font-hand text-xl leading-none font-bold">{balance.toLocaleString()}</span>
        </span>
      </header>

      {/* 스와이프 힌트 (첫 슬라이드에서만) */}
      {activeIdx === 0 && (
        <div className="text-ink-3 font-hand pointer-events-none absolute inset-x-0 bottom-[86px] z-20 text-center text-lg">
          <span className="animate-wobble inline-block">↑ 위로 넘겨서 다음 고양이</span>
        </div>
      )}

      <TipSheet
        video={tipTarget}
        balance={balance}
        onClose={() => setTipTarget(null)}
        onSend={async (amount) => {
          if (!tipTarget) return
          const res = await tipVideo(tipTarget, amount)
          if (res.ok) setTipTarget(null)
        }}
      />
    </div>
  )
}

/* ───────────────────────── 슬라이드 ───────────────────────── */

function FeedSlide({
  idx,
  video,
  active,
  muted,
  liked,
  onVisible,
  onToggleMute,
  onToggleLike,
  onTip,
  onWatchGoal,
}: {
  idx: number
  video: Video
  active: boolean
  muted: boolean
  liked: boolean
  onVisible: (idx: number) => void
  onToggleMute: () => void
  onToggleLike: () => void
  onTip: () => void
  onWatchGoal: () => void
}) {
  const slideRef = useRef<HTMLElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const [mediaFailed, setMediaFailed] = useState(false)
  const [paused, setPaused] = useState(false)
  const [watchedSec, setWatchedSec] = useState(0)
  const [rewarded, setRewarded] = useState(false)
  const [burst, setBurst] = useState<{ id: number; label: string } | null>(null)

  /* 뷰포트 진입 감지 → 활성 슬라이드 결정 */
  useEffect(() => {
    const el = slideRef.current
    if (!el) return
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting && e.intersectionRatio > 0.6) onVisible(idx)
      },
      { threshold: [0, 0.6, 1] },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [idx, onVisible])

  /* 활성 슬라이드만 재생 */
  useEffect(() => {
    const el = videoRef.current
    if (!el) return
    if (active && !paused) {
      el.play().catch(() => setPaused(true)) // 자동재생 차단 시 정지 상태로 표시
    } else {
      el.pause()
    }
  }, [active, paused])

  /* 시청 시간 누적 → 목표 도달 시 1회 보상 (영상당 멱등) */
  useEffect(() => {
    if (!active || paused || rewarded) return
    const id = window.setInterval(() => {
      setWatchedSec((s) => {
        const next = s + 0.5
        if (next >= WATCH_GOAL_SEC && !rewarded) {
          setRewarded(true)
          onWatchGoal()
          setBurst({ id: Date.now(), label: `+${video.watchRewardMeow}` })
        }
        return next
      })
    }, 500)
    return () => clearInterval(id)
  }, [active, paused, rewarded, onWatchGoal, video.watchRewardMeow])

  const progress = Math.min(1, watchedSec / WATCH_GOAL_SEC)

  return (
    <section
      ref={slideRef}
      className="flex h-full w-full snap-start flex-col px-3.5 pt-[calc(max(12px,env(safe-area-inset-top))+46px)] pb-[86px]"
    >
      {/* 사진처럼 테두리를 두른 영상 */}
      <div className="border-ink bg-paper-3 relative flex-1 overflow-hidden rounded-[34px] border-[3px] shadow-[4px_4px_0_rgba(52,48,42,0.16)]">
        {!mediaFailed ? (
          <video
            ref={videoRef}
            className="absolute inset-0 h-full w-full object-cover"
            src={video.videoURL}
            poster={video.posterURL}
            loop
            muted={muted}
            playsInline
            preload={idx < 2 ? 'auto' : 'metadata'}
            onError={() => setMediaFailed(true)}
            onClick={() => setPaused((p) => !p)}
          />
        ) : (
          /* 비디오 로드 실패 → 포스터/이모지 폴백 (오프라인에서도 화면이 깨지지 않게) */
          <div className="absolute inset-0">
            {video.posterURL && (
              <img
                src={video.posterURL}
                alt=""
                className="h-full w-full object-cover"
                onError={(e) => (e.currentTarget.style.display = 'none')}
              />
            )}
            <div className="text-ink-3 absolute inset-0 flex items-center justify-center text-7xl opacity-40">🐈</div>
          </div>
        )}

        {/* 일시정지 표시 */}
        {active && paused && (
          <button
            type="button"
            onClick={() => setPaused(false)}
            className="text-ink absolute inset-0 z-10 flex items-center justify-center"
            aria-label="재생"
          >
            <PlayIcon className="h-20 w-20 drop-shadow-[3px_3px_0_rgba(52,48,42,0.25)]" />
          </button>
        )}

        {/* 우측 액션 레일 */}
        <div className="absolute right-2.5 bottom-3 z-20 flex flex-col items-center gap-2.5">
          <RailButton label={formatCount(video.likeCount + (liked ? 1 : 0))} onClick={onToggleLike} on={liked}>
            <HeartIcon className={`h-6 w-6 ${liked ? 'animate-pop text-clay' : ''}`} filled={liked} />
          </RailButton>

          {/* 토큰 후원 */}
          <RailButton label="후원" onClick={onTip}>
            <MeowCoin className="h-6 w-6" />
          </RailButton>

          <RailButton label={formatCount(video.tipTotal)} onClick={onTip}>
            <ShareIcon className="h-6 w-6" />
          </RailButton>

          <RailButton label={muted ? '음소거' : '소리' } onClick={onToggleMute}>
            <SoundIcon className="h-5 w-5" muted={muted} />
          </RailButton>

          {/* 시청 보상 링 게이지 */}
          <div className="bg-paper-2 border-ink relative flex h-12 w-12 items-center justify-center rounded-full border-[2.5px]">
            <svg viewBox="0 0 44 44" className="absolute inset-0 -rotate-90">
              <circle cx="22" cy="22" r="17" fill="none" stroke="var(--color-line)" strokeWidth="3.5" />
              <circle
                cx="22"
                cy="22"
                r="17"
                fill="none"
                stroke={rewarded ? 'var(--color-sage)' : 'var(--color-honey)'}
                strokeWidth="3.5"
                strokeLinecap="round"
                strokeDasharray={2 * Math.PI * 17}
                strokeDashoffset={2 * Math.PI * 17 * (1 - progress)}
                style={{ transition: 'stroke-dashoffset .5s linear' }}
              />
            </svg>
            <span className={`font-hand text-base leading-none font-bold ${rewarded ? 'text-sage' : 'text-honey-2'}`}>
              {rewarded ? '✓' : `+${video.watchRewardMeow}`}
            </span>
            {burst && (
              <span
                key={burst.id}
                className="text-sage font-hand animate-float-up pointer-events-none absolute -top-1 text-xl font-bold whitespace-nowrap"
              >
                {burst.label} MEOW
              </span>
            )}
          </div>
        </div>
      </div>

      {/* 사진 아래 메모 영역 */}
      <div className="mt-3 shrink-0">
        <div className="flex items-center gap-2">
          <span className="border-ink bg-honey/35 font-hand flex h-9 w-9 items-center justify-center rounded-full border-[2.5px] text-xl leading-none">
            {video.uploaderNickname.slice(0, 1)}
          </span>
          <span className="font-hand text-2xl leading-none">@{video.uploaderNickname}</span>
          <button
            type="button"
            className="sketch-pill sketch-press bg-paper-2 font-hand ml-auto px-2.5 py-0.5 text-lg leading-none"
          >
            팔로우
          </button>
        </div>
        <p className="text-ink mt-1.5 text-[13px] leading-snug">{video.caption}</p>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {video.tags.map((tag) => (
            <span
              key={tag}
              className="border-line text-ink-2 font-hand rounded-full border-2 bg-paper-2 px-2 py-0.5 text-base leading-none"
              title="AI가 자동 분류한 태그"
            >
              #{tag}
            </span>
          ))}
        </div>
      </div>
    </section>
  )
}

function RailButton({
  children,
  label,
  onClick,
  on = false,
}: {
  children: ReactNode
  label: string
  onClick: () => void
  on?: boolean
}) {
  return (
    <button type="button" onClick={onClick} className="sketch-press flex flex-col items-center gap-0.5">
      <span
        className={`border-ink flex h-11 w-11 items-center justify-center rounded-full border-[2.5px] shadow-[2px_2px_0_rgba(52,48,42,0.18)] ${
          on ? 'bg-clay/25' : 'bg-paper-2'
        }`}
      >
        {children}
      </span>
      <span className="font-hand text-ink bg-paper-2/85 rounded-full px-1 text-base leading-none">{label}</span>
    </button>
  )
}

/* ───────────────────────── 후원 바텀시트 ───────────────────────── */

function TipSheet({
  video,
  balance,
  onClose,
  onSend,
}: {
  video: Video | null
  balance: number
  onClose: () => void
  onSend: (amount: number) => Promise<void>
}) {
  const [amount, setAmount] = useState(TIP_PRESETS[1])
  const [sending, setSending] = useState(false)

  useEffect(() => {
    if (video) setAmount(TIP_PRESETS[1])
  }, [video])

  if (!video) return null
  const insufficient = amount > balance

  return (
    <BottomSheet open onClose={onClose} title={`@${video.uploaderNickname} 에게 후원`}>
      <p className="text-ink-2 text-[13px] leading-relaxed">
        마음에 든 영상에 $MEOW를 보내면 크리에이터에게 그대로 전달돼요.
        <span className="text-ink-3 block">(원장에는 tip_sent / tip_received 두 건으로 기록됩니다)</span>
      </p>

      <div className="mt-4 grid grid-cols-4 gap-2">
        {TIP_PRESETS.map((preset) => (
          <button
            key={preset}
            type="button"
            onClick={() => setAmount(preset)}
            className={`sketch-soft sketch-press font-hand py-2.5 text-2xl leading-none ${
              amount === preset ? 'bg-honey/40 font-bold' : 'bg-paper-2'
            }`}
          >
            {preset}
          </button>
        ))}
      </div>

      <div className="text-ink-2 mt-3 flex items-center justify-between text-xs">
        <span>보유 잔액</span>
        <span className="font-hand flex items-center gap-1 text-xl leading-none">
          <MeowCoin className="h-4 w-4" />
          {balance.toLocaleString()} MEOW
        </span>
      </div>

      <button
        type="button"
        disabled={insufficient || sending}
        onClick={async () => {
          setSending(true)
          await onSend(amount)
          setSending(false)
        }}
        className={`sketch-soft sketch-press font-hand mt-4 w-full py-3 text-2xl leading-none ${
          insufficient ? 'bg-paper-3 text-ink-3' : 'bg-honey'
        }`}
      >
        {insufficient ? '잔액이 부족해요' : sending ? '전송 중…' : `${amount} MEOW 후원하기`}
      </button>
    </BottomSheet>
  )
}

function formatCount(n: number): string {
  if (n >= 10000) return `${(n / 10000).toFixed(1)}만`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}천`
  return String(n)
}
