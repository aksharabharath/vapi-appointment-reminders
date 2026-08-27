'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Phone, PhoneCall, PlayCircle, RefreshCw } from 'lucide-react';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { MetricCard } from '@/components/ui/metric-card';
import { StatusChip } from '@/components/ui/status-chip';
import type { CallAttemptRecord, PatientRecord } from '@/lib/db';
import {
  latestAttemptForPatient,
  resolveRosterStatus,
  type StatusDisplay,
} from '@/lib/outreach-status';

function appointmentLabel(patient: PatientRecord) {
  const date = patient.appointment_date?.trim();
  const time = patient.appointment_time?.trim();
  if (!date && !time) return '—';
  return [date, time].filter(Boolean).join(' · ');
}

function staffErrorMessage(raw: unknown): string {
  if (typeof raw === 'string' && raw.trim()) {
    if (/vapi/i.test(raw) && /missing/i.test(raw)) {
      return 'Calling is not configured. Add Vapi keys on the server and try again.';
    }
    if (/phone/i.test(raw)) return 'This patient is missing a valid phone number.';
    return raw;
  }
  return 'Something went wrong. Try again, or check the audit log.';
}

async function startCall(patient: PatientRecord) {
  const res = await fetch('/api/calls/trigger', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      patientId: patient.patient_id,
      phoneNumber: patient.phone_number,
      patientName: `${patient.first_name} ${patient.last_name}`.trim(),
      appointmentTime: appointmentLabel(patient),
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.success) {
    throw new Error(staffErrorMessage(json.error));
  }
}

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState<'roster' | 'audit'>('roster');
  const [patients, setPatients] = useState<PatientRecord[]>([]);
  const [callHistory, setCallHistory] = useState<CallAttemptRecord[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [dispatching, setDispatching] = useState(false);
  const [confirmDispatch, setConfirmDispatch] = useState(false);
  const [inFlight, setInFlight] = useState<Record<string, true>>({});
  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null
  );

  const showMessage = (type: 'success' | 'error', text: string) => {
    setActionMessage({ type, text });
    window.setTimeout(() => setActionMessage(null), 4000);
  };

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/reminders');
      const json = await res.json();
      if (json.success) {
        setPatients(json.data || []);
        setCallHistory(json.call_attempts || []);
      }
    } catch {
      /* keep last good snapshot */
    } finally {
      setInitialLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 3000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const statuses = useMemo(() => {
    const map = new Map<string, StatusDisplay>();
    for (const p of patients) {
      const id = String(p.patient_id);
      const attempt = latestAttemptForPatient(callHistory, id);
      let optimistic = Boolean(inFlight[id]);
      if (optimistic && attempt) {
        const fromServer = resolveRosterStatus({
          calledYet: p.called_yet,
          latestDecision: attempt.decision,
          latestStatus: attempt.status,
          inFlight: false,
        });
        optimistic = fromServer.key === 'in_progress' || fromServer.key === 'pending';
      }
      map.set(
        id,
        resolveRosterStatus({
          calledYet: p.called_yet,
          latestDecision: attempt?.decision,
          latestStatus: attempt?.status,
          inFlight: optimistic,
        })
      );
    }
    return map;
  }, [patients, callHistory, inFlight]);

  const pendingPatients = patients.filter((p) => statuses.get(String(p.patient_id))?.allowsRetryCall);
  const inProgressCount = [...statuses.values()].filter((s) => s.key === 'in_progress').length;
  const completedCount = [...statuses.values()].filter((s) => s.isTerminalSuccess).length;

  const triggerCall = async (patient: PatientRecord) => {
    const id = String(patient.patient_id);
    setInFlight((prev) => ({ ...prev, [id]: true }));
    try {
      await startCall(patient);
      showMessage('success', `Call started for ${patient.first_name} ${patient.last_name}.`);
      fetchData();
    } catch (err: unknown) {
      setInFlight((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      showMessage('error', err instanceof Error ? err.message : staffErrorMessage(null));
    }
  };

  const triggerAllPending = async () => {
    if (pendingPatients.length === 0) return;
    setDispatching(true);
    showMessage('success', `Starting ${pendingPatients.length} pending calls…`);
    let started = 0;
    let failed = 0;
    for (const p of pendingPatients) {
      const id = String(p.patient_id);
      setInFlight((prev) => ({ ...prev, [id]: true }));
      try {
        await startCall(p);
        started += 1;
      } catch {
        failed += 1;
        setInFlight((prev) => {
          const next = { ...prev };
          delete next[id];
          return next;
        });
      }
    }
    setConfirmDispatch(false);
    setDispatching(false);
    fetchData();
    if (failed && started) {
      showMessage('error', `Started ${started} calls; ${failed} could not start.`);
    } else if (failed) {
      showMessage('error', 'None of the pending calls could start. Check configuration and phone numbers.');
    } else {
      showMessage('success', `Started ${started} calls.`);
    }
  };

  const tabClass = (tab: 'roster' | 'audit') =>
    `border-b-2 px-3 py-2.5 text-sm font-medium ${
      activeTab === tab
        ? 'border-blue-600 text-blue-700'
        : 'border-transparent text-slate-500 hover:text-slate-800'
    }`;

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-6 py-3.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600 text-white">
            <PhoneCall className="h-4 w-4" />
          </div>
          <div>
            <h1 className="text-[15px] font-semibold tracking-tight">Appointment Assistant</h1>
            <p className="text-xs text-slate-500">Outbound reminder console</p>
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-5 px-6 py-6">
        {actionMessage ? <Banner type={actionMessage.type} text={actionMessage.text} /> : null}

        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <MetricCard label="Pending" value={pendingPatients.length} hint="Eligible to call" />
          <MetricCard label="In progress" value={inProgressCount} />
          <MetricCard label="Completed" value={completedCount} hint="Confirmed or reschedule" />
          <MetricCard label="Roster" value={patients.length} />
        </section>

        <div className="flex items-center justify-between border-b border-slate-200">
          <div className="flex gap-1">
            <button type="button" className={tabClass('roster')} onClick={() => setActiveTab('roster')}>
              Roster
            </button>
            <button type="button" className={tabClass('audit')} onClick={() => setActiveTab('audit')}>
              Audit
            </button>
          </div>
        </div>

        {activeTab === 'roster' && (
          <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
              <div>
                <h2 className="text-sm font-semibold">Patient queue</h2>
                <p className="text-xs text-slate-500">Status reflects the latest attempt, not just that a dial started.</p>
              </div>
              <Button
                variant="success"
                size="sm"
                disabled={dispatching || pendingPatients.length === 0}
                onClick={() => setConfirmDispatch(true)}
              >
                <PlayCircle className="h-3.5 w-3.5" />
                Dispatch pending
              </Button>
            </div>
            {initialLoading ? (
              <EmptyState title="Loading roster…" description="Fetching patients and call history." />
            ) : patients.length === 0 ? (
              <EmptyState
                title="No patients on the roster"
                description="Add patients to the database to start reminder calls."
              />
            ) : (
              <table className="w-full text-left text-sm">
                <thead className="border-b border-slate-100 bg-slate-50/80 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-2.5">Patient</th>
                    <th className="px-4 py-2.5">Appointment</th>
                    <th className="px-4 py-2.5">Phone</th>
                    <th className="px-4 py-2.5">Status</th>
                    <th className="px-4 py-2.5 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {patients.map((p) => {
                    const id = String(p.patient_id);
                    const status = statuses.get(id)!;
                    const busy = Boolean(inFlight[id]) || status.key === 'in_progress';
                    return (
                      <tr key={id} className="hover:bg-slate-50/70">
                        <td className="px-4 py-3">
                          <div className="font-medium text-slate-900">
                            {p.first_name} {p.last_name}
                          </div>
                          <div className="text-xs text-slate-400">{id}</div>
                        </td>
                        <td className="px-4 py-3 tabular-nums text-slate-600">{appointmentLabel(p)}</td>
                        <td className="px-4 py-3 text-xs tabular-nums text-slate-500">{p.phone_number || '—'}</td>
                        <td className="px-4 py-3">
                          <StatusChip label={status.label} tone={status.tone} />
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Button
                            size="sm"
                            disabled={busy || !status.allowsRetryCall}
                            onClick={() => triggerCall(p)}
                          >
                            <Phone className="h-3.5 w-3.5" />
                            {busy ? 'Calling' : 'Call'}
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </section>
        )}

        {activeTab === 'audit' && (
          <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              <div>
                <h2 className="text-sm font-semibold">Call audit</h2>
                <p className="text-xs text-slate-500">Newest attempts first.</p>
              </div>
              <Button variant="secondary" size="sm" onClick={() => fetchData()}>
                <RefreshCw className="h-3.5 w-3.5" />
                Refresh
              </Button>
            </div>
            {callHistory.length === 0 ? (
              <EmptyState
                title="No calls yet"
                description="When you start a reminder, the attempt and outcome will show up here."
              />
            ) : (
              <table className="w-full text-left text-sm">
                <thead className="border-b border-slate-100 bg-slate-50/80 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-2.5">Patient</th>
                    <th className="px-4 py-2.5">Call id</th>
                    <th className="px-4 py-2.5">Outcome</th>
                    <th className="px-4 py-2.5">Details</th>
                    <th className="px-4 py-2.5">When</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {callHistory.map((log) => {
                    const outcome = resolveRosterStatus({
                      calledYet: 0,
                      latestDecision: log.decision,
                      latestStatus: log.status,
                      inFlight: false,
                    });
                    return (
                      <tr key={log.id ?? `${log.patient_id}-${log.call_time}-${log.vapi_call_id}`}>
                        <td className="px-4 py-3">
                          <div className="font-medium text-slate-900">{log.patient_name || log.patient_id}</div>
                          <div className="text-xs text-slate-400">{log.patient_id}</div>
                        </td>
                        <td className="px-4 py-3 font-mono text-[11px] text-slate-500">{log.vapi_call_id}</td>
                        <td className="px-4 py-3">
                          <StatusChip label={outcome.label} tone={outcome.tone} />
                        </td>
                        <td className="max-w-xs px-4 py-3 text-xs text-slate-600">{log.user_speech || '—'}</td>
                        <td className="px-4 py-3 text-xs tabular-nums text-slate-500">{log.call_time}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </section>
        )}
      </main>

      <ConfirmDialog
        open={confirmDispatch}
        title="Dispatch all pending calls?"
        description={`This will start reminder calls for ${pendingPatients.length} patient${
          pendingPatients.length === 1 ? '' : 's'
        }. Outcomes will appear on the roster and in audit as each call finishes.`}
        confirmLabel="Start calls"
        pending={dispatching}
        onCancel={() => !dispatching && setConfirmDispatch(false)}
        onConfirm={triggerAllPending}
      />
    </div>
  );
}
