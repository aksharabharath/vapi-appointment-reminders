import { NextResponse } from 'next/server';
import { getCallAttempts, getPatients } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const patients = await getPatients();
    const attempts = await getCallAttempts();
    return NextResponse.json({
      success: true,
      data: patients,
      call_attempts: attempts,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch patients from database';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
