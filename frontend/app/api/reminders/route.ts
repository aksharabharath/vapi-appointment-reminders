// frontend/app/api/reminders/route.ts
import { NextResponse } from 'next/server';
import { getPatients, getCallAttempts } from '@/lib/db';

export const dynamic = 'force-dynamic'; // Force Next.js to ignore cache

export async function GET() {
  try {
    const patients = getPatients();
    const attempts = getCallAttempts();
    
    // Check if the file exists from the perspective of this API route
    const fs = require('fs');
    const path = '/Users/radha/customer_call/patients.db';
    const exists = fs.existsSync(path);
    const stats = exists ? fs.statSync(path) : null;

    return NextResponse.json({
      debug: {
        path,
        exists,
        fileSize: stats ? stats.size : 0,
      },
      success: true,
      data: patients,
      call_attempts: attempts,
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}