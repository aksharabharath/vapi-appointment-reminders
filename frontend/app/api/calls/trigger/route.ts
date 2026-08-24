import { NextResponse } from 'next/server';
import { markPatientCalled } from '@/lib/db';
import { formatToE164 } from '@/lib/records';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { patientId, phoneNumber, patientName, appointmentTime } = body;

    if (!phoneNumber) {
      return NextResponse.json({ success: false, error: 'Phone number is required' }, { status: 400 });
    }

    const formattedPhone = formatToE164(phoneNumber);
    const vapiApiKey = process.env.VAPI_API_KEY;
    const vapiPhoneNumberId = process.env.VAPI_PHONE_NUMBER_ID;

    if (!vapiApiKey || !vapiPhoneNumberId) {
      return NextResponse.json(
        { success: false, error: 'VAPI_API_KEY or VAPI_PHONE_NUMBER_ID missing in env' },
        { status: 500 }
      );
    }

    const response = await fetch('https://api.vapi.ai/call/phone', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${vapiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        phoneNumberId: vapiPhoneNumberId,
        customer: {
          number: formattedPhone,
          name: patientName || 'Patient',
        },
        assistant: {
          firstMessage: `Hello ${patientName || 'there'}, this is an automated reminder regarding your appointment scheduled for ${appointmentTime || 'upcoming time'}. Please confirm if you can make it.`,
          model: {
            provider: 'openai',
            model: 'gpt-4o-mini',
            messages: [
              {
                role: 'system',
                content: 'You are an automated appointment confirmation assistant. Friendly, concise, and helpful.',
              },
            ],
          },
        },
      }),
    });

    const callData = await response.json();

    if (!response.ok) {
      return NextResponse.json(
        { success: false, error: callData.message || JSON.stringify(callData) },
        { status: response.status }
      );
    }

    if (patientId) {
      try {
        await markPatientCalled(String(patientId), callData.id || '', callData.status || 'initiated');
      } catch (dbErr) {
        console.error('Failed to update Neon call attempt record:', dbErr);
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Call initiated successfully',
      callId: callData.id,
      status: callData.status,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
