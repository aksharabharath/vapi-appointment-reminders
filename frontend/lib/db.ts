import { neon, type NeonQueryFunction } from '@neondatabase/serverless';
import { mapCallAttempt, mapPatient, type CallAttemptRecord, type PatientRecord } from '@/lib/records';

export type { CallAttemptRecord, PatientRecord } from '@/lib/records';

export function getDatabaseUrl(): string {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    throw new Error('DATABASE_URL is not set. Add it to frontend/.env.local for local use, or Vercel env for deploy.');
  }
  return url;
}

export function getSql(): NeonQueryFunction<false, false> {
  return neon(getDatabaseUrl());
}

export async function getPatients(): Promise<PatientRecord[]> {
  const sql = getSql();
  const rows = await sql`
    SELECT
      patient_id,
      first_name,
      last_name,
      date_of_birth,
      phone_number,
      home_address,
      insurance_number,
      medical_record_number,
      appointment_date,
      appointment_time,
      timezone,
      called_yet
    FROM patients
    ORDER BY patient_id ASC
  `;
  return (rows as Parameters<typeof mapPatient>[0][]).map(mapPatient);
}

export function getAppointmentReminders(): Promise<PatientRecord[]> {
  return getPatients();
}

export async function getCallAttempts(): Promise<CallAttemptRecord[]> {
  const sql = getSql();
  const rows = await sql`
    SELECT
      ca.call_attempt_id,
      ca.patient_id,
      ca.vapi_call_id,
      ca.status,
      ca.decision,
      ca.user_speech,
      ca.created_at,
      p.first_name,
      p.last_name
    FROM call_attempts ca
    LEFT JOIN patients p ON p.patient_id = ca.patient_id
    ORDER BY ca.call_attempt_id DESC
  `;
  return (rows as Parameters<typeof mapCallAttempt>[0][]).map(mapCallAttempt);
}

/** Record that a dial started. Do not set called_yet (that means confirm/reschedule). */
export async function logCallStarted(patientId: string, vapiCallId: string, status: string): Promise<void> {
  const sql = getSql();
  await sql`
    INSERT INTO call_attempts (patient_id, vapi_call_id, status, decision, user_speech)
    VALUES (${patientId}, ${vapiCallId}, ${status}, '', 'Call started')
  `;
}

export async function resetAllPatientsPending(): Promise<void> {
  const sql = getSql();
  await sql`UPDATE patients SET called_yet = 0`;
}
