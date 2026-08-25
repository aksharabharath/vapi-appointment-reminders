const PACIFIC = 'America/Los_Angeles';

export function clockToMinutes(time: string, period: string): number | null {
  const match = String(time || '')
    .trim()
    .match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isFinite(hour) || !Number.isFinite(minute) || minute > 59 || hour < 1 || hour > 12) {
    return null;
  }
  const pm = String(period).toUpperCase() === 'PM';
  if (hour === 12) hour = pm ? 12 : 0;
  else if (pm) hour += 12;
  return hour * 60 + minute;
}

export function pacificClock(now: Date, timeZone = PACIFIC): { minutes: number; dateKey: string } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);

  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value);

  const hour = get('hour');
  const minute = get('minute');
  const year = parts.find((p) => p.type === 'year')?.value;
  const month = parts.find((p) => p.type === 'month')?.value;
  const day = parts.find((p) => p.type === 'day')?.value;

  return {
    minutes: hour * 60 + minute,
    dateKey: `${year}-${month}-${day}`,
  };
}

export function isWithinDispatchWindow(args: {
  now?: Date;
  time: string;
  period: string;
  windowMinutes?: number;
  timeZone?: string;
}): boolean {
  const target = clockToMinutes(args.time, args.period);
  if (target === null) return false;
  const { minutes } = pacificClock(args.now ?? new Date(), args.timeZone ?? PACIFIC);
  const windowMinutes = args.windowMinutes ?? 10;
  return Math.abs(minutes - target) <= windowMinutes;
}
