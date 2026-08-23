import { cn } from '@/lib/utils';
import type { ChipTone } from '@/lib/outreach-status';

const tones: Record<ChipTone, string> = {
  neutral: 'bg-slate-100 text-slate-700 ring-slate-200/80',
  info: 'bg-blue-50 text-blue-800 ring-blue-100',
  success: 'bg-emerald-50 text-emerald-800 ring-emerald-100',
  warning: 'bg-amber-50 text-amber-900 ring-amber-100',
  danger: 'bg-rose-50 text-rose-800 ring-rose-100',
};

export function StatusChip({
  label,
  tone,
  className,
}: {
  label: string;
  tone: ChipTone;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset',
        tones[tone],
        className
      )}
    >
      {label}
    </span>
  );
}
