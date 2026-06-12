'use client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { useEffect, useState } from 'react'
import { useAuthStore } from '@/stores/auth.store'

export function QueryProvider({ children }: { children: React.ReactNode }) {
  // auth 스토어는 skipHydration: true — 마운트 시 localStorage에서 복원해야
  // 새로고침/직접 진입 후에도 user(employeeId 등)가 유지된다.
  useEffect(() => {
    void useAuthStore.persist.rehydrate()
  }, [])

  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000,
            retry: 1,
          },
        },
      }),
  )

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  )
}
