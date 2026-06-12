'use client'
import { useState, useCallback } from 'react'

interface ConfirmOptions {
  title: string
  message: string
  confirmLabel?: string
  confirmColor?: 'error' | 'primary' | 'warning'
}

export function useConfirm() {
  const [state, setState] = useState<{ open: boolean; options: ConfirmOptions; resolve?: (v: boolean) => void }>({
    open: false,
    options: { title: '', message: '' },
  })

  const confirm = useCallback((options: ConfirmOptions): Promise<boolean> => {
    return new Promise(resolve => {
      setState({ open: true, options, resolve })
    })
  }, [])

  const handleClose = useCallback((value: boolean) => {
    state.resolve?.(value)
    setState(s => ({ ...s, open: false }))
  }, [state])

  return {
    confirmState: { ...state.options, open: state.open },
    confirm,
    handleConfirm: () => handleClose(true),
    handleCancel: () => handleClose(false),
  }
}
