import type { ReactNode } from 'react'

/**
 * 모바일 뷰 목업 셸.
 * 데스크톱에서는 노트에 붙여둔 스케치처럼 보이는 폰 프레임, 모바일에서는 전체화면.
 */
export function PhoneFrame({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full w-full items-center justify-center bg-[#e9e2d2] sm:p-6">
      {/* 데스크톱 배경: 옅은 모눈 노트 */}
      <div
        className="pointer-events-none fixed inset-0 hidden sm:block"
        style={{
          backgroundImage:
            'linear-gradient(rgba(52,48,42,.055) 1px,transparent 1px),linear-gradient(90deg,rgba(52,48,42,.055) 1px,transparent 1px)',
          backgroundSize: '32px 32px',
        }}
      />

      <div className="relative z-1 hidden shrink-0 pr-12 lg:block">
        <span className="text-ink-3 font-hand text-lg">MVP mockup</span>
        <h1 className="font-hand mt-1 text-6xl leading-none">
          happi <span className="text-honey-2">cat</span>
        </h1>
        <div className="mt-3 h-1.5 w-40 rounded-full bg-[repeating-linear-gradient(90deg,var(--color-ink)_0_14px,transparent_14px_22px)] opacity-45" />
        <p className="text-ink-2 mt-4 max-w-72 text-sm leading-relaxed">
          보면 벌고, 가면 벌린다.
          <br />
          고양이 숏폼과 오프라인 방문으로 $MEOW를 모아 기프티콘으로 바꾸는 리워드 앱.
        </p>
        <ul className="text-ink-2 font-hand mt-5 space-y-1 text-xl">
          <li>· 스와이프 피드 + 시청 보상</li>
          <li>· GPS 스팟 인증 (O2O)</li>
          <li>· 토큰 지갑 &amp; 리워드 샵</li>
        </ul>
      </div>

      <div className="relative z-1 h-full w-full sm:h-[880px] sm:max-h-[92vh] sm:w-[430px]">
        {/* 스케치 폰 외곽선 */}
        <div className="paper relative h-full w-full overflow-hidden sm:rounded-[46px] sm:border-[3px] sm:border-ink sm:shadow-[6px_6px_0_rgba(52,48,42,0.18)]">
          {children}
        </div>
      </div>
    </div>
  )
}
