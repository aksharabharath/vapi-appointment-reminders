import { NextResponse } from 'next/server';
import { resetAllPatientsPending } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    await resetAllPatientsPending();
    return NextResponse.json({ success: true, message: 'All patient records reset to called_yet = 0' });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to reset patients';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
