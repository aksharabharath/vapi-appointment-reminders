import { NextResponse } from 'next/server';
import { getPatients, getCallAttempts } from '@/lib/db';

export async function GET() {
  try {
    const patients = getPatients();
    const attempts = getCallAttempts();
    return NextResponse.json({
      success: true,
      data: patients,
      call_attempts: attempts,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch patients from database' },
      { status: 500 }
    );
  }
}
