import { CheckCircle2, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

export function Banner({
  type,
  text,
}: {
  type: 'success' | 'error';
  text: string;
}) {
  return (
    <div
      role="status"
      className={cn(
        'flex items-start gap-2.5 rounded-xl border px-3.5 py-2.5 text-sm',
        type === 'success'
          ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
          : 'border-rose-200 bg-rose-50 text-rose-900'
      )}
    >
      {type === 'success' ? (
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
      ) : (
        <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
      )}
      <span className="font-medium">{text}</span>
    </div>
  );
}
