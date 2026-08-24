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
  return (rows as any[]).map(mapPatient);
}

export async function getCallAttempts(): Promise<CallAttemptRecord[]> {
  const sql = getSql();
  const rows = await sql`
    SELECT
      call_attempt_id,
      patient_id,
      vapi_call_id,
      status,
      decision,
      user_speech,
      created_at
    FROM call_attempts
    ORDER BY call_attempt_id DESC
  `;
  return (rows as any[]).map(mapCallAttempt);
}

export async function markPatientCalled(patientId: string, vapiCallId: string, status: string): Promise<void> {
  const sql = getSql();
  await sql`UPDATE patients SET called_yet = 1 WHERE patient_id = ${patientId}`;
  await sql`
    INSERT INTO call_attempts (patient_id, vapi_call_id, status, decision, user_speech)
    VALUES (${patientId}, ${vapiCallId}, ${status}, '', '')
  `;
}

export async function resetAllPatientsPending(): Promise<void> {
  const sql = getSql();
  await sql`UPDATE patients SET called_yet = 0`;
}

export type ScheduleSettings = {
  enabled: boolean;
  scheduledTime: string;
};

export async function getScheduleSettings(): Promise<ScheduleSettings> {
  const sql = getSql();
  const rows = await sql`SELECT key, value FROM settings WHERE key IN ('schedule_enabled', 'scheduled_call_time')`;
  const map = new Map<string, string>((rows as { key: string; value: string }[]).map((r) => [r.key, r.value]));
  return {
    enabled: map.get('schedule_enabled') !== '0',
    scheduledTime: map.get('scheduled_call_time') || '01:00 PM PST',
  };
}

export async function saveScheduleSettings(settings: ScheduleSettings): Promise<void> {
  const sql = getSql();
  const enabled = settings.enabled ? '1' : '0';
  await sql`
    INSERT INTO settings (key, value) VALUES ('schedule_enabled', ${enabled})
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
  `;
  await sql`
    INSERT INTO settings (key, value) VALUES ('scheduled_call_time', ${settings.scheduledTime})
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
  `;
}
