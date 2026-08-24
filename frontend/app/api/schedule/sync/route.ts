import { NextResponse } from 'next/server';
import { getScheduleSettings, saveScheduleSettings } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const settings = await getScheduleSettings();
    return NextResponse.json({
      success: true,
      settings: {
        enabled: settings.enabled,
        scheduledTime: `${settings.time} ${settings.period} PST`,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load schedule';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const scheduledTime = body.scheduledTime as string | undefined;
    const enabled = body.enabled !== false;

    if (!scheduledTime) {
      return NextResponse.json({ success: false, error: 'Missing scheduled time' }, { status: 400 });
    }

    const raw = String(scheduledTime).replace(/\s*PST\s*$/i, '').trim();
    const parts = raw.split(/\s+/);
    await saveScheduleSettings({
      enabled,
      time: parts[0] || '09:00',
      period: parts[1] === 'PM' ? 'PM' : 'AM',
    });
    return NextResponse.json({ success: true, message: 'Schedule saved to the database' });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to save schedule';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
