import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { requireEnv } from '@/lib/env'

export async function updateSession(request: NextRequest) {
  const { pathname: requestPath } = request.nextUrl

  // Public paths — chatbot widget must be accessible without auth.
  // These prefixes bypass all auth checks and session refresh.
  if (requestPath.startsWith('/widget') || requestPath.startsWith('/api/widget')) {
    return NextResponse.next({ request })
  }

  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
    requireEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          )
        },
      },
    },
  )

  // Refresh session — must be called before any auth checks
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl

  // Patient auth guard: /chat and /onboarding require auth
  if ((pathname.startsWith('/chat') || pathname.startsWith('/onboarding')) && !user) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  // API auth guard: /api/chat requires auth
  if (pathname.startsWith('/api/chat') && !user) {
    return new NextResponse('Unauthorized', { status: 401 })
  }

  // Admin auth guard: /dashboard requires admin
  if (pathname.startsWith('/dashboard') && !pathname.startsWith('/dashboard/login')) {
    if (!user) {
      const url = request.nextUrl.clone()
      url.pathname = '/dashboard/login'
      return NextResponse.redirect(url)
    }
    if (user.email !== process.env.ADMIN_EMAIL) {
      const url = request.nextUrl.clone()
      url.pathname = '/dashboard/login'
      url.searchParams.set('error', 'unauthorized')
      return NextResponse.redirect(url)
    }
  }

  return supabaseResponse
}
