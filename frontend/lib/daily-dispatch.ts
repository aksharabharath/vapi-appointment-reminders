import {
  getCallAttempts,
  getLastDailyDispatchDate,
  getPatients,
  getScheduleSettings,
  setLastDailyDispatchDate,
  type PatientRecord,
} from '@/lib/db';
import { latestAttemptForPatient, resolveRosterStatus } from '@/lib/outreach-status';
import { placeOutboundCall } from '@/lib/place-call';
import { isWithinDispatchWindow, pacificClock } from '@/lib/schedule-window';

export type DailyDispatchResult = {
  success: true;
  skipped?: string;
  dateKey: string;
  started: number;
  failed: number;
  pending: number;
};

function appointmentLabel(patient: PatientRecord) {
  const date = patient.appointment_date?.trim();
  const time = patient.appointment_time?.trim();
  if (!date && !time) return 'upcoming time';
  return [date, time].filter(Boolean).join(' · ');
}

export async function pendingPatientsForDispatch(): Promise<PatientRecord[]> {
  const patients = await getPatients();
  const attempts = await getCallAttempts();
  return patients.filter((patient) => {
    const attempt = latestAttemptForPatient(attempts, patient.patient_id);
    const status = resolveRosterStatus({
      calledYet: patient.called_yet,
      latestDecision: attempt?.decision,
      latestStatus: attempt?.status,
      inFlight: false,
    });
    return status.allowsRetryCall;
  });
}

export async function runDailyDispatch(opts: { force?: boolean; now?: Date } = {}): Promise<DailyDispatchResult> {
  const now = opts.now ?? new Date();
  const { dateKey } = pacificClock(now);
  const settings = await getScheduleSettings();

  if (!settings.enabled) {
    return { success: true, skipped: 'disabled', dateKey, started: 0, failed: 0, pending: 0 };
  }

  if (!opts.force && !isWithinDispatchWindow({ now, time: settings.time, period: settings.period })) {
    return { success: true, skipped: 'outside_window', dateKey, started: 0, failed: 0, pending: 0 };
  }

  if (!opts.force) {
    const last = await getLastDailyDispatchDate();
    if (last === dateKey) {
      return { success: true, skipped: 'already_ran_today', dateKey, started: 0, failed: 0, pending: 0 };
    }
  }

  const pending = await pendingPatientsForDispatch();
  let started = 0;
  let failed = 0;

  for (const patient of pending) {
    const result = await placeOutboundCall({
      patientId: patient.patient_id,
      phoneNumber: patient.phone_number,
      patientName: `${patient.first_name} ${patient.last_name}`.trim(),
      appointmentTime: appointmentLabel(patient),
    });
    if (result.ok) started += 1;
    else failed += 1;
  }

  if (!opts.force) {
    await setLastDailyDispatchDate(dateKey);
  }

  return { success: true, dateKey, started, failed, pending: pending.length };
}
