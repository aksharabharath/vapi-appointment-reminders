import { NextResponse } from 'next/server';
import { getScheduleSettings, saveScheduleSettings, ScheduleSettings } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const settings = getScheduleSettings();
    return NextResponse.json({ success: true, settings });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body: ScheduleSettings = await request.json();
    const success = saveScheduleSettings(body);
    
    if (success) {
      return NextResponse.json({ success: true, settings: body });
    } else {
      return NextResponse.json({ success: false, error: 'Failed to write settings to database' }, { status: 500 });
    }
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
