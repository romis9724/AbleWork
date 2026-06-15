import { useCallback, useEffect, useState } from 'react'
import { getApiErrorMessage } from '@/lib/api-client'

interface AsyncDataState<T> {
  data: T | null
  isLoading: boolean
  isRefreshing: boolean
  error: string | null
  refresh: () => void
  reload: () => Promise<void>
}

/**
 * 화면용 단순 데이터 패칭 훅 (모바일에는 TanStack Query 미설치).
 * - 마운트 시 1회 로드, pull-to-refresh, 명시적 reload 지원.
 * - fetcher 는 useCallback 으로 안정화해서 전달한다.
 */
export function useAsyncData<T>(fetcher: () => Promise<T>): AsyncDataState<T> {
  const [data, setData] = useState<T | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const run = useCallback(
    async (mode: 'initial' | 'refresh') => {
      if (mode === 'refresh') setIsRefreshing(true)
      else setIsLoading(true)
      setError(null)
      try {
        const result = await fetcher()
        setData(result)
      } catch (err) {
        setError(getApiErrorMessage(err))
      } finally {
        setIsLoading(false)
        setIsRefreshing(false)
      }
    },
    [fetcher],
  )

  useEffect(() => {
    void run('initial')
  }, [run])

  const refresh = useCallback(() => {
    void run('refresh')
  }, [run])

  const reload = useCallback(() => run('initial'), [run])

  return { data, isLoading, isRefreshing, error, refresh, reload }
}
