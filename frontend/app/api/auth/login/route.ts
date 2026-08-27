import { NextResponse } from 'next/server';
import {
  COOKIE_NAME,
  createSessionToken,
  passwordMatches,
  sessionCookieOptions,
} from '@/lib/staff-session';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const expected = process.env.STAFF_PASSWORD?.trim() ?? '';
  if (!expected) {
    return NextResponse.json(
      { success: false, error: 'Staff password is not configured on the server.' },
      { status: 503 }
    );
  }

  let password = '';
  try {
    const body = (await request.json()) as { password?: unknown };
    password = typeof body.password === 'string' ? body.password : '';
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid request' }, { status: 400 });
  }

  if (!(await passwordMatches(password, expected))) {
    return NextResponse.json({ success: false, error: 'Incorrect password' }, { status: 401 });
  }

  const token = await createSessionToken(expected);
  const response = NextResponse.json({ success: true });
  response.cookies.set(COOKIE_NAME, token, sessionCookieOptions(process.env.NODE_ENV === 'production'));
  return response;
}
