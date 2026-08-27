import { NextResponse } from 'next/server';
import { COOKIE_NAME, sessionCookieOptions } from '@/lib/staff-session';

export const dynamic = 'force-dynamic';

export async function POST() {
  const response = NextResponse.json({ success: true });
  response.cookies.set(COOKIE_NAME, '', {
    ...sessionCookieOptions(process.env.NODE_ENV === 'production'),
    maxAge: 0,
  });
  return response;
}
