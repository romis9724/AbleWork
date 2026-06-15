/**
 * AB Workforce 모달 — 오버레이 클릭/✕로 닫힘, rise 애니메이션, head/body/foot 슬롯.
 * 핸드오프 .modal-overlay / .modal / .confirm 스타일 사용.
 */
'use client'
import { useEffect, type ReactNode } from 'react'
import { I } from './icons'

interface ModalProps {
  open: boolean
  onClose: () => void
  eyebrow?: string
  title: string
  children: ReactNode
  footer?: ReactNode
  maxWidth?: number
}

export function Modal({ open, onClose, eyebrow, title, children, footer, maxWidth = 1000 }: ModalProps) {
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
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div className="modal-title-wrap">
            {eyebrow && <span className="modal-eyebrow">{eyebrow}</span>}
            <span className="modal-title">{title}</span>
          </div>
          <button type="button" className="modal-x" onClick={onClose} aria-label="닫기">
            {I.x()}
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  )
}

interface ConfirmDialogProps {
  open: boolean
  title: string
  message: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = '확인',
  cancelLabel = '취소',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  if (!open) return null
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="confirm" onClick={(e) => e.stopPropagation()}>
        <div className="confirm-body">
          <h3 className="confirm-title">{title}</h3>
          <p className="confirm-msg">{message}</p>
        </div>
        <div className="confirm-foot">
          <button type="button" className="no" onClick={onCancel}>{cancelLabel}</button>
          <button type="button" className="yes" onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  )
}
