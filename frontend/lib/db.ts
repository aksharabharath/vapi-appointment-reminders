import Database from 'better-sqlite3';

const DB_PATH = '/Users/radha/customer_call/patients.db';

export function getDb() {
  return new Database(DB_PATH, { fileMustExist: false });
}

export interface PatientRecord {
  patient_id: string;
  first_name: string;
  last_name: string;
  date_of_birth?: string;
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
  patient_id: string;
  patient_name?: string;
  vapi_call_id?: string;
  status: string;
  decision?: string;
  user_speech?: string;
  call_time: string;
}

export interface ScheduleSettings {
  enabled: boolean;
  time: string;
  period: string;
}

export function getPatients(): PatientRecord[] {
  try {
    const db = getDb();
    const rows = db.prepare('SELECT * FROM patients ORDER BY patient_id ASC').all() as PatientRecord[];
    db.close();
    return rows;
  } catch (err) {
    console.error('Database query error (patients):', err);
    return [];
  }
}

export function getAppointmentReminders(): PatientRecord[] {
  return getPatients();
}

export function getCallAttempts(): CallAttemptRecord[] {
  try {
    const db = getDb();
    const attempts = db.prepare('SELECT * FROM call_attempts ORDER BY call_attempt_id DESC').all() as any[];
    const patients = db.prepare('SELECT patient_id, first_name, last_name FROM patients').all() as any[];
    db.close();

    const patientMap = new Map<string, string>();
    patients.forEach((p) => {
      patientMap.set(String(p.patient_id).trim(), `${p.first_name} ${p.last_name}`);
    });

    return attempts.map((ca) => {
      const pid = String(ca.patient_id).trim();
      return {
        id: ca.call_attempt_id,
        patient_id: pid,
        patient_name: patientMap.get(pid) || `Patient #${pid}`,
        vapi_call_id: ca.vapi_call_id || '-',
        status: ca.status || 'initiated',
        decision: ca.decision || '',
        user_speech: ca.user_speech || '',
        call_time: ca.created_at || ca.call_time || new Date().toISOString(),
      };
    });
  } catch (err) {
    console.error('Database query error (call_attempts):', err);
    return [];
  }
}

export function getScheduleSettings(): ScheduleSettings {
  try {
    const db = getDb();
    const row = db.prepare("SELECT value FROM settings WHERE key = 'schedule_config'").get() as { value: string } | undefined;
    db.close();

    if (row && row.value) {
      return JSON.parse(row.value);
    }
  } catch (err) {
    console.error('Error reading settings:', err);
  }
  // Default fallback
  return { enabled: false, time: '09:00', period: 'AM' };
}

export function saveScheduleSettings(settings: ScheduleSettings): boolean {
  try {
    const db = getDb();
    db.prepare(`
      INSERT INTO settings (key, value) VALUES ('schedule_config', ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `).run(JSON.stringify(settings));
    db.close();
    return true;
  } catch (err) {
    console.error('Error saving settings:', err);
    return false;
  }
}
