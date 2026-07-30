import { useState } from 'react'
import { PhoneFrame } from './components/PhoneFrame'
import { TabBar } from './components/TabBar'
import type { TabKey } from './components/TabBar'
import { FeedTab } from './tabs/FeedTab'
import { MapTab } from './tabs/MapTab'
import { WalletTab } from './tabs/WalletTab'
import { PawIcon } from './components/MeowIcon'
import { useApp } from './store/AppState'

export default function App() {
  const [tab, setTab] = useState<TabKey>('feed')
  const { ready, toasts } = useApp()

  return (
    <PhoneFrame>
      {ready ? (
        <>
          <main className="h-full">
            {tab === 'feed' && <FeedTab />}
            {tab === 'map' && <MapTab />}
            {tab === 'wallet' && <WalletTab />}
          </main>
          <TabBar active={tab} onChange={setTab} />
        </>
      ) : (
        <div className="paper flex h-full flex-col items-center justify-center gap-2">
          <PawIcon className="text-honey-2 animate-wobble h-12 w-12" />
          <p className="text-ink-2 font-hand text-2xl leading-none">happi cat 준비 중…</p>
        </div>
      )}

      {/* 토스트 — 메모지를 붙인 느낌 */}
      <div className="pointer-events-none absolute inset-x-0 top-[max(52px,env(safe-area-inset-top))] z-60 flex flex-col items-center gap-1.5 px-6">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`animate-toast-in sketch-pill font-hand px-3.5 py-1 text-xl leading-tight ${
              toast.kind === 'earn'
                ? 'bg-sage/30'
                : toast.kind === 'spend'
                  ? 'bg-honey/40'
                  : toast.kind === 'error'
                    ? 'bg-clay/25'
                    : 'bg-paper-2'
            }`}
          >
            {toast.message}
          </div>
        ))}
      </div>
    </PhoneFrame>
  )
}
