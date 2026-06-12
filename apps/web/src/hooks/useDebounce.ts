'use client'
import { useEffect, useState } from 'react'

/** 입력값이 delay(ms) 동안 변하지 않을 때만 반영되는 디바운스 훅 */
export function useDebounce<T>(value: T, delay = 300): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value)

  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay)
    return () => clearTimeout(handler)
  }, [value, delay])

  return debouncedValue
}
