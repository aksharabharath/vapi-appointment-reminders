import { NextResponse } from 'next/server';
import { placeOutboundCall } from '@/lib/place-call';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { patientId, phoneNumber, patientName, appointmentTime } = body;

    const result = await placeOutboundCall({
      patientId,
      phoneNumber,
      patientName: patientName || 'Patient',
      appointmentTime: appointmentTime || 'upcoming time',
    });

    if (!result.ok) {
      return NextResponse.json({ success: false, error: result.error }, { status: result.httpStatus });
    }

    return NextResponse.json({
      success: true,
      message: 'Call initiated successfully',
      callId: result.callId,
      status: result.status,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
