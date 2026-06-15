/**
 * AB Workforce 토스트 — 하단 중앙, 오렌지 좌측 보더 + ▸ 마커.
 * 핸드오프 .toast-wrap / .toast 스타일 사용.
 */
'use client'
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'

interface ToastItem {
  id: number
  msg: string
}

const ToastCtx = createContext<(msg: string) => void>(() => {})

export function useToast() {
  return useContext(ToastCtx)
}

const TOAST_DURATION_MS = 2600

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const tid = useRef(0)

  const toast = useCallback((msg: string) => {
    const id = ++tid.current
    setToasts((t) => [...t, { id, msg }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), TOAST_DURATION_MS)
  }, [])

  return (
    <ToastCtx.Provider value={toast}>
      {children}
      <div className="toast-wrap">
        {toasts.map((t) => (
          <div key={t.id} className="toast">
            <span className="tk">▸</span>
            {t.msg}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  )
}
