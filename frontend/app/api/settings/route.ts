import { NextResponse } from 'next/server';
import { getScheduleSettings, saveScheduleSettings, type ScheduleSettings } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const settings = await getScheduleSettings();
    return NextResponse.json({ success: true, settings });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load settings';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as ScheduleSettings;
    await saveScheduleSettings({
      enabled: Boolean(body.enabled),
      time: body.time || '09:00',
      period: body.period === 'PM' ? 'PM' : 'AM',
    });
    return NextResponse.json({ success: true, settings: body });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to save settings';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
