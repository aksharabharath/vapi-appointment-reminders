import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { phoneNumber, patientName, appointmentTime } = body;

    if (!phoneNumber) {
      return NextResponse.json(
        { success: false, error: 'Phone number is required' },
        { status: 400 }
      );
    }

    const vapiApiKey = process.env.VAPI_API_KEY;
    const vapiPhoneNumberId = process.env.VAPI_PHONE_NUMBER_ID;

    if (!vapiApiKey || !vapiPhoneNumberId) {
      return NextResponse.json(
        { success: false, error: 'Vapi environment variables not configured' },
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
          number: phoneNumber,
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
      throw new Error(callData.message || 'Failed to trigger Vapi call');
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
