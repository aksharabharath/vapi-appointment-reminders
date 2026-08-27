import { NextRequest, NextResponse } from 'next/server';
import { COOKIE_NAME, verifySessionToken } from '@/lib/staff-session';

export async function proxy(request: NextRequest) {
  const secret = process.env.STAFF_PASSWORD?.trim() ?? '';
  const token = request.cookies.get(COOKIE_NAME)?.value;
  const signedIn = secret ? await verifySessionToken(token, secret) : false;
  const { pathname } = request.nextUrl;

  if (pathname === '/login') {
    if (signedIn) {
      return NextResponse.redirect(new URL('/', request.url));
    }
    return NextResponse.next();
  }

  if (pathname === '/api/auth/login' || pathname === '/api/auth/logout') {
    return NextResponse.next();
  }

  if (!signedIn) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.redirect(new URL('/login', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
