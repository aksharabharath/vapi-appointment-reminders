export type ChipTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

export type OutreachStatusKey =
  | 'pending'
  | 'in_progress'
  | 'CONFIRMED'
  | 'RESCHEDULE'
  | 'VOICEMAIL'
  | 'WRONG_NUMBER'
  | 'NO_INPUT'
  | 'INVALID'
  | 'INVALID_DATA'
  | 'ERROR';

export interface StatusDisplay {
  key: OutreachStatusKey;
  label: string;
  tone: ChipTone;
  isTerminalSuccess: boolean;
  allowsRetryCall: boolean;
}

const BY_DECISION: Record<string, StatusDisplay> = {
  CONFIRMED: {
    key: 'CONFIRMED',
    label: 'Confirmed',
    tone: 'success',
    isTerminalSuccess: true,
    allowsRetryCall: false,
  },
  RESCHEDULE: {
    key: 'RESCHEDULE',
    label: 'Needs reschedule',
    tone: 'warning',
    isTerminalSuccess: true,
    allowsRetryCall: false,
  },
  VOICEMAIL: {
    key: 'VOICEMAIL',
    label: 'Voicemail — retry',
    tone: 'warning',
    isTerminalSuccess: false,
    allowsRetryCall: true,
  },
  WRONG_NUMBER: {
    key: 'WRONG_NUMBER',
    label: 'Wrong number',
    tone: 'danger',
    isTerminalSuccess: false,
    allowsRetryCall: true,
  },
  NO_INPUT: {
    key: 'NO_INPUT',
    label: 'No answer',
    tone: 'neutral',
    isTerminalSuccess: false,
    allowsRetryCall: true,
  },
  TIMEOUT: {
    key: 'NO_INPUT',
    label: 'No answer',
    tone: 'neutral',
    isTerminalSuccess: false,
    allowsRetryCall: true,
  },
  INVALID: {
    key: 'INVALID',
    label: 'Unclear',
    tone: 'neutral',
    isTerminalSuccess: false,
    allowsRetryCall: true,
  },
  INVALID_DATA: {
    key: 'INVALID_DATA',
    label: 'Invalid data',
    tone: 'danger',
    isTerminalSuccess: false,
    allowsRetryCall: true,
  },
  ERROR: {
    key: 'ERROR',
    label: 'Failed',
    tone: 'danger',
    isTerminalSuccess: false,
    allowsRetryCall: true,
  },
};

export const PENDING: StatusDisplay = {
  key: 'pending',
  label: 'Pending',
  tone: 'neutral',
  isTerminalSuccess: false,
  allowsRetryCall: true,
};

export const IN_PROGRESS: StatusDisplay = {
  key: 'in_progress',
  label: 'In progress',
  tone: 'info',
  isTerminalSuccess: false,
  allowsRetryCall: false,
};

export function displayForDecision(decision?: string | null, status?: string | null): StatusDisplay {
  const d = (decision || '').trim().toUpperCase();
  if (d && BY_DECISION[d]) return BY_DECISION[d];

  const s = (status || '').trim().toUpperCase();
  if (s === 'INITIATED' || s === 'IN_PROGRESS' || s === 'QUEUED') return IN_PROGRESS;
  if (s === 'TIMEOUT') return BY_DECISION.TIMEOUT;
  if (s === 'SKIPPED') return BY_DECISION.INVALID_DATA;
  if (s === 'FAILED') return BY_DECISION.ERROR;

  return PENDING;
}

export function latestAttemptForPatient<T extends { patient_id: string | number }>(
  attempts: T[],
  patientId: string | number
): T | undefined {
  const id = String(patientId).trim();
  return attempts.find((a) => String(a.patient_id).trim() === id);
}

export function resolveRosterStatus(args: {
  calledYet: number | string | boolean | null | undefined;
  latestDecision?: string | null;
  latestStatus?: string | null;
  inFlight: boolean;
}): StatusDisplay {
  if (args.inFlight) return IN_PROGRESS;

  const fromAttempt = displayForDecision(args.latestDecision, args.latestStatus);
  if (fromAttempt.key !== 'pending') return fromAttempt;

  const called = args.calledYet === 1 || args.calledYet === '1' || args.calledYet === true;
  if (called) {
    return {
      key: 'CONFIRMED',
      label: 'Outreach complete',
      tone: 'success',
      isTerminalSuccess: true,
      allowsRetryCall: false,
    };
  }

  return PENDING;
}
