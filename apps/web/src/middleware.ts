import { NextRequest, NextResponse } from 'next/server'
import { jwtVerify } from 'jose'
import { isAdminLevel, hasLevel, requiredLevelForPath } from '@ablework/shared-constants'
import type { JwtPayload } from './lib/types'

const secret = new TextEncoder().encode(process.env.JWT_SECRET ?? '')

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // 공개 경로는 인증 불필요
  if (pathname.startsWith('/login') || pathname.startsWith('/api')) {
    return NextResponse.next()
  }

  const token = request.cookies.get('accessToken')?.value
  if (!token) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  try {
    const { payload } = await jwtVerify<JwtPayload>(token, secret)

    // /admin 접근 — ORG_ADMIN 이상만, 그리고 경로별 최소 레벨 충족 필요
    if (pathname.startsWith('/admin')) {
      if (!isAdminLevel(payload.accessLevel)) {
        return NextResponse.redirect(new URL('/me/home', request.url))
      }
      // 회사 전역 설정/마스터 경로는 GENERAL_ADMIN 이상만 — 부족하면 관리자 홈으로
      const required = requiredLevelForPath(pathname)
      if (!hasLevel(payload.accessLevel, required)) {
        return NextResponse.redirect(new URL('/admin/dashboard', request.url))
      }
    }

    return NextResponse.next()
  } catch {
    const response = NextResponse.redirect(new URL('/login', request.url))
    response.cookies.delete('accessToken')
    return response
  }
}

export const config = {
  matcher: ['/admin/:path*', '/me/:path*'],
}
