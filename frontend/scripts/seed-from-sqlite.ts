import { existsSync } from 'fs';
import { resolve } from 'path';
import Database from 'better-sqlite3';
import { neon } from '@neondatabase/serverless';
import { loadFrontendEnv } from './load-env';

loadFrontendEnv();

const url = process.env.DATABASE_URL?.trim();
if (!url) {
  console.error('DATABASE_URL is missing.');
  process.exit(1);
}

function findSqlitePath(): string {
  const candidates = [
    resolve(process.cwd(), '../patients.db'),
    resolve(process.cwd(), 'patients.db'),
  ];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  throw new Error('Could not find patients.db next to the repo or in frontend/.');
}

async function main() {
  const sqlitePath = findSqlitePath();
  const sqlite = new Database(sqlitePath, { readonly: true, fileMustExist: true });
  const sql = neon(url!);

  const patients = sqlite.prepare('SELECT * FROM patients').all() as Record<string, unknown>[];
  let attempts: Record<string, unknown>[] = [];
  try {
    attempts = sqlite.prepare('SELECT * FROM call_attempts').all() as Record<string, unknown>[];
  } catch {
    attempts = [];
  }

  await sql`DELETE FROM call_attempts`;
  await sql`DELETE FROM patients`;

  for (const p of patients) {
    const id = String(p.patient_id ?? '');
    const dob = String(p.date_of_birth ?? p.dob ?? '');
    await sql`
      INSERT INTO patients (
        patient_id, first_name, last_name, date_of_birth, phone_number,
        home_address, insurance_number, medical_record_number,
        appointment_date, appointment_time, timezone, called_yet
      ) VALUES (
        ${id},
        ${String(p.first_name ?? '')},
        ${String(p.last_name ?? '')},
        ${dob},
        ${String(p.phone_number ?? '')},
        ${String(p.home_address ?? '')},
        ${String(p.insurance_number ?? '')},
        ${String(p.medical_record_number ?? '')},
        ${String(p.appointment_date ?? '')},
        ${String(p.appointment_time ?? '')},
        ${String(p.timezone ?? '')},
        ${Number(p.called_yet) ? 1 : 0}
      )
    `;
  }

  for (const a of attempts) {
    const created = a.created_at ?? a.call_time ?? null;
    await sql`
      INSERT INTO call_attempts (patient_id, vapi_call_id, status, decision, user_speech, created_at)
      VALUES (
        ${String(a.patient_id ?? '')},
        ${a.vapi_call_id != null ? String(a.vapi_call_id) : null},
        ${a.status != null ? String(a.status) : null},
        ${a.decision != null ? String(a.decision) : null},
        ${a.user_speech != null ? String(a.user_speech) : a.notes != null ? String(a.notes) : null},
        ${created ? String(created) : new Date().toISOString()}
      )
    `;
  }

  sqlite.close();
  console.log(`Seeded ${patients.length} patients and ${attempts.length} call attempts from ${sqlitePath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
