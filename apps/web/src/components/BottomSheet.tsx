import { useEffect } from 'react'
import type { ReactNode } from 'react'

/**
 * 폰 프레임 내부에 뜨는 바텀시트. 종이를 아래에서 끌어올린 느낌.
 * 부모가 `relative` 컨테이너(PhoneFrame)라는 전제로 absolute 로 덮는다.
 */
export function BottomSheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean
  onClose: () => void
  title?: string
  children: ReactNode
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="absolute inset-0 z-50 flex flex-col justify-end">
      <button
        type="button"
        aria-label="닫기"
        onClick={onClose}
        className="animate-fade-in absolute inset-0 bg-[#34302a]/35"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="animate-sheet-in paper border-ink relative max-h-[85%] overflow-y-auto rounded-t-[34px] border-t-[3px] border-x-[3px] pb-[env(safe-area-inset-bottom)] shadow-[0_-6px_0_rgba(52,48,42,0.10)]"
      >
        <div className="flex justify-center pt-3">
          <span className="bg-ink/25 h-1.5 w-12 rounded-full" />
        </div>
        {title && <h2 className="font-hand px-5 pt-2 text-3xl leading-tight">{title}</h2>}
        <div className="px-5 pt-3 pb-6">{children}</div>
      </div>
    </div>
  )
}
