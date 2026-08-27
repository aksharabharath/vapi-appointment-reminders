CREATE TABLE IF NOT EXISTS patients (
  patient_id TEXT PRIMARY KEY,
  first_name TEXT NOT NULL DEFAULT '',
  last_name TEXT NOT NULL DEFAULT '',
  date_of_birth TEXT,
  phone_number TEXT NOT NULL DEFAULT '',
  home_address TEXT,
  insurance_number TEXT,
  medical_record_number TEXT,
  appointment_date TEXT,
  appointment_time TEXT,
  timezone TEXT,
  called_yet INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS call_attempts (
  call_attempt_id SERIAL PRIMARY KEY,
  patient_id TEXT NOT NULL,
  vapi_call_id TEXT,
  status TEXT,
  decision TEXT,
  user_speech TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
