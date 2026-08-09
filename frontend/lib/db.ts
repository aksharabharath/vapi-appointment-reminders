import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

export function getDbPath(): string {
  // Check root customer_call directory relative to frontend cwd
  const parentDbPath = path.resolve(process.cwd(), '../appointment_reminders.db');
  if (fs.existsSync(parentDbPath)) {
    return parentDbPath;
  }

  // Check current working directory
  const localDbPath = path.resolve(process.cwd(), 'appointment_reminders.db');
  if (fs.existsSync(localDbPath)) {
    return localDbPath;
  }

  // Fallback default
  return parentDbPath;
}

export function getDb() {
  const dbPath = getDbPath();
  return new Database(dbPath, { readonly: true, fileMustExist: false });
}

export interface AppointmentReminder {
  id: number;
  patient_name: string;
  phone_number: string;
  appointment_time: string;
  status: string;
  retry_count: number;
  last_call_timestamp?: string;
}

export function getAppointmentReminders(): AppointmentReminder[] {
  try {
    const db = getDb();
    const stmt = db.prepare('SELECT * FROM appointment_reminders ORDER BY id DESC');
    const rows = stmt.all() as AppointmentReminder[];
    db.close();
    return rows;
  } catch (err) {
    console.error('Database query error:', err);
    return [];
  }
}
