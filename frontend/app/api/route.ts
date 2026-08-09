import { NextResponse } from 'next/server';
import { getAppointmentReminders } from '@/lib/db';

export async function GET() {
  try {
    const reminders = getAppointmentReminders();
    return NextResponse.json({ success: true, data: reminders });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch appointment reminders' },
      { status: 500 }
    );
  }
}