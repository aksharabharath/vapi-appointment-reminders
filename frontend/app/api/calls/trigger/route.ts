import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

function formatToE164(phone: string): string {
  if (!phone) return '';
  const cleaned = phone.replace(/\D/g, '');
  if (cleaned.length === 10) {
    return `+1${cleaned}`;
  } else if (cleaned.length === 11 && cleaned.startsWith('1')) {
    return `+${cleaned}`;
  } else if (phone.startsWith('+')) {
    return phone;
  }
  return `+${cleaned}`;
}

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
        'Authorization': `Bearer ${vapiApiKey}`,
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

    // Log call attempt and update called_yet = 1
    try {
      const db = getDb();
      if (patientId) {
        db.prepare('UPDATE patients SET called_yet = 1 WHERE patient_id = ?').run(patientId);
        db.prepare(
          'INSERT INTO call_attempts (patient_id, call_time, status, vapi_call_id) VALUES (?, datetime("now"), ?, ?)'
        ).run(patientId, 'initiated', callData.id || '');
      }
      db.close();
    } catch (dbErr) {
      console.error('Failed to update DB call attempt record:', dbErr);
    }

    return NextResponse.json({
      success: true,
      message: 'Call initiated successfully',
      callId: callData.id,
      status: callData.status,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
