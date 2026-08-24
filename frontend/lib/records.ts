export function formatToE164(phone: string): string {
  if (!phone) return '';
  const cleaned = phone.replace(/\D/g, '');
  if (cleaned.length === 10) {
    return `+1${cleaned}`;
  }
  if (cleaned.length === 11 && cleaned.startsWith('1')) {
    return `+${cleaned}`;
  }
  if (phone.startsWith('+')) {
    return phone;
  }
  return cleaned ? `+${cleaned}` : '';
}

export type PatientRow = {
  patient_id: string;
  first_name: string;
  last_name: string;
  date_of_birth: string | null;
  phone_number: string;
  home_address: string | null;
  insurance_number: string | null;
  medical_record_number: string | null;
  appointment_date: string;
  appointment_time: string;
  timezone: string | null;
  called_yet: number | string | boolean | null;
};

export type PatientRecord = {
  patient_id: string;
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
};

export type AttemptRow = {
  call_attempt_id: number;
  patient_id: string;
  vapi_call_id: string | null;
  status: string | null;
  decision: string | null;
  user_speech: string | null;
  created_at: string | Date;
};

export type CallAttemptRecord = {
  id: number;
  patient_id: string;
  call_time: string;
  status: string;
  vapi_call_id: string;
  decision?: string;
};

export function mapPatient(row: PatientRow): PatientRecord {
  return {
    patient_id: String(row.patient_id),
    first_name: row.first_name || '',
    last_name: row.last_name || '',
    dob: row.date_of_birth || '',
    phone_number: row.phone_number || '',
    home_address: row.home_address || '',
    insurance_number: row.insurance_number || '',
    medical_record_number: row.medical_record_number || '',
    appointment_date: row.appointment_date || '',
    appointment_time: row.appointment_time || '',
    timezone: row.timezone || '',
    called_yet: Number(row.called_yet) ? 1 : 0,
  };
}

export function mapCallAttempt(row: AttemptRow): CallAttemptRecord {
  const when = row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at || '');
  return {
    id: row.call_attempt_id,
    patient_id: String(row.patient_id),
    call_time: when,
    status: row.status || '',
    vapi_call_id: row.vapi_call_id || '',
    decision: row.decision || undefined,
  };
}
