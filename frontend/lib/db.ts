import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

export function getDbPath(): string {
  const parentDbPath = path.resolve(process.cwd(), '../patients.db');
  if (fs.existsSync(parentDbPath)) {
    return parentDbPath;
  }
  return path.resolve(process.cwd(), 'patients.db');
}

export function getDb() {
  const dbPath = getDbPath();
  return new Database(dbPath, { fileMustExist: false });
}

export interface PatientRecord {
  patient_id: number;
  first_name: string;
  last_name: string;
  dob: string;
  phone_number: string;
  home_address: string;
  insurance_number: string;
  medical_record_number: string;
  appointment_date: string;
  appointment_time: string;
  timezone: string;
  called_yet: number;
}

export interface CallAttemptRecord {
  id?: number;
  patient_id: number;
  call_time: string;
  status: string;
  vapi_call_id?: string;
  notes?: string;
}

export function getPatients(): PatientRecord[] {
  try {
    const db = getDb();
    const stmt = db.prepare('SELECT * FROM patients ORDER BY patient_id ASC');
    const rows = stmt.all() as PatientRecord[];
    db.close();
    return rows;
  } catch (err) {
    console.error('Database query error (patients):', err);
    return [];
  }
}

export function getCallAttempts(): CallAttemptRecord[] {
  try {
    const db = getDb();
    const stmt = db.prepare('SELECT * FROM call_attempts ORDER BY id DESC');
    const rows = stmt.all() as CallAttemptRecord[];
    db.close();
    return rows;
  } catch (err) {
    console.error('Database query error (call_attempts):', err);
    return [];
  }
}
