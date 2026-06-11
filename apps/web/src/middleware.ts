import { NextRequest, NextResponse } from 'next/server'
import { jwtVerify } from 'jose'
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

    // ORG_ADMIN 이상만 /admin 접근 가능
    if (pathname.startsWith('/admin')) {
      const adminLevels = ['SUPER_ADMIN', 'GENERAL_ADMIN', 'ORG_ADMIN']
      if (!adminLevels.includes(payload.accessLevel)) {
        return NextResponse.redirect(new URL('/me/home', request.url))
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
