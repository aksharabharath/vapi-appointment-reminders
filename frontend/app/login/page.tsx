'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';

export default function LoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.success) {
        setError(typeof json.error === 'string' ? json.error : 'Could not sign in.');
        return;
      }
      router.push('/');
      router.refresh();
    } catch {
      setError('Could not sign in.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-6"
      >
        <h1 className="text-base font-semibold text-slate-900">Staff sign in</h1>
        <p className="mt-1 text-sm text-slate-500">
          Enter the shared staff password to open the appointment reminder console.
        </p>
        <label className="mt-5 block text-sm font-medium text-slate-700" htmlFor="staff-password">
          Password
        </label>
        <input
          id="staff-password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm"
        />
        {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
        <Button type="submit" className="mt-4 w-full" disabled={submitting || !password}>
          {submitting ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>
    </div>
  );
}
