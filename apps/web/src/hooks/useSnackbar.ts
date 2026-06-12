'use client'
import { useState, useCallback } from 'react'

type Severity = 'success' | 'error' | 'info' | 'warning'

interface SnackbarState {
  open: boolean
  message: string
  severity: Severity
}

export function useSnackbar() {
  const [snackbar, setSnackbar] = useState<SnackbarState>({ open: false, message: '', severity: 'success' })

  const showSnackbar = useCallback((message: string, severity: Severity = 'success') => {
    setSnackbar({ open: true, message, severity })
  }, [])

  const hideSnackbar = useCallback(() => {
    setSnackbar(s => ({ ...s, open: false }))
  }, [])

  return { snackbar, showSnackbar, hideSnackbar }
}
