import { NextResponse } from 'next/server';
import { isCronAuthorized } from '@/lib/cron-auth';
import { runDailyDispatch } from '@/lib/daily-dispatch';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

async function handle(request: Request) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const url = new URL(request.url);
    const force = url.searchParams.get('force') === '1';
    const result = await runDailyDispatch({ force });
    return NextResponse.json(result);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Daily dispatch failed';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function GET(request: Request) {
  return handle(request);
}

export async function POST(request: Request) {
  return handle(request);
}
