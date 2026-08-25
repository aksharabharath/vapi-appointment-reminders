import { logCallStarted } from '@/lib/db';
import { formatToE164 } from '@/lib/records';

export type PlaceCallResult =
  | { ok: true; callId: string; status: string }
  | { ok: false; error: string; httpStatus: number };

export async function placeOutboundCall(args: {
  patientId?: string;
  phoneNumber: string;
  patientName: string;
  appointmentTime: string;
}): Promise<PlaceCallResult> {
  if (!args.phoneNumber) {
    return { ok: false, error: 'Phone number is required', httpStatus: 400 };
  }

  const formattedPhone = formatToE164(args.phoneNumber);
  const vapiApiKey = process.env.VAPI_API_KEY;
  const vapiPhoneNumberId = process.env.VAPI_PHONE_NUMBER_ID;

  if (!vapiApiKey || !vapiPhoneNumberId) {
    return {
      ok: false,
      error: 'VAPI_API_KEY or VAPI_PHONE_NUMBER_ID missing in env',
      httpStatus: 500,
    };
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
        name: args.patientName || 'Patient',
      },
      assistant: {
        firstMessage: `Hello ${args.patientName || 'there'}, this is an automated reminder regarding your appointment scheduled for ${args.appointmentTime || 'upcoming time'}. Please confirm if you can make it.`,
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

  const callData = (await response.json().catch(() => ({}))) as {
    id?: string;
    status?: string;
    message?: string;
  };

  if (!response.ok) {
    return {
      ok: false,
      error: callData.message || JSON.stringify(callData),
      httpStatus: response.status,
    };
  }

  if (args.patientId) {
    try {
      await logCallStarted(String(args.patientId), callData.id || '', callData.status || 'initiated');
    } catch (dbErr) {
      console.error('Failed to log Neon call attempt:', dbErr);
    }
  }

  return { ok: true, callId: callData.id || '', status: callData.status || 'initiated' };
}
