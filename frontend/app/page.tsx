'use client';

import { useState, useEffect } from 'react';

interface AppointmentReminder {
  id: number;
  patient_name: string;
  phone_number: string;
  appointment_time: string;
  status: string;
  retry_count: number;
  last_call_timestamp?: string;
}

export default function StreamlitStyleDashboard() {
  const [reminders, setReminders] = useState<AppointmentReminder[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [callingId, setCallingId] = useState<number | null>(null);
  const [isBatchRunning, setIsBatchRunning] = useState<boolean>(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  // Streamlit-style Sidebar Scheduled Batch Settings State
  const [scheduleEnabled, setScheduleEnabled] = useState<boolean>(true);
  const [cronInterval, setCronInterval] = useState<string>('30'); // minutes
  const [maxRetries, setMaxRetries] = useState<number>(3);
  const [voiceModel, setVoiceModel] = useState<string>('gpt-4o-mini');

  const fetchReminders = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/reminders');
      const json = await res.json();
      if (json.success) {
        setReminders(json.data);
      } else {
        setMessage({ type: 'error', text: json.error || 'Failed to fetch appointment logs.' });
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Error connecting to API.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReminders();
  }, []);

  // Trigger Individual Call
  const handleTriggerSingleCall = async (item: AppointmentReminder) => {
    setCallingId(item.id);
    setMessage({ type: 'info', text: `Initiating call to ${item.patient_name}...` });

    try {
      const res = await fetch('/api/calls/trigger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phoneNumber: item.phone_number,
          patientName: item.patient_name,
          appointmentTime: item.appointment_time,
        }),
      });

      const json = await res.json();

      if (json.success) {
        setMessage({
          type: 'success',
          text: `Call queued for ${item.patient_name}. (Call ID: ${json.callId})`,
        });
        fetchReminders();
      } else {
        setMessage({ type: 'error', text: json.error || `Failed to call ${item.patient_name}.` });
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Error triggering call.' });
    } finally {
      setCallingId(null);
    }
  };

  // Trigger Immediate Batch Dispatch
  const handleRunBatchNow = async () => {
    setIsBatchRunning(true);
    setMessage({ type: 'info', text: 'Starting automated daily batch calls...' });

    const pendingItems = reminders.filter((r) => r.status.toLowerCase() === 'pending' || r.status.toLowerCase() === 'failed');

    if (pendingItems.length === 0) {
      setMessage({ type: 'info', text: 'No pending appointments to call in batch.' });
      setIsBatchRunning(false);
      return;
    }

    let successCount = 0;
    for (const item of pendingItems) {
      try {
        const res = await fetch('/api/calls/trigger', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            phoneNumber: item.phone_number,
            patientName: item.patient_name,
            appointmentTime: item.appointment_time,
          }),
        });
        const json = await res.json();
        if (json.success) successCount++;
      } catch (err) {
        console.error(`Batch call failed for ${item.patient_name}`, err);
      }
    }

    setMessage({
      type: 'success',
      text: `Batch processing complete! Initiated ${successCount} out of ${pendingItems.length} call(s).`,
    });
    setIsBatchRunning(false);
    fetchReminders();
  };

  // Metrics Calculations
  const totalRecords = reminders.length;
  const confirmedCount = reminders.filter((r) => r.status.toLowerCase() === 'confirmed').length;
  const pendingCount = reminders.filter((r) => r.status.toLowerCase() === 'pending').length;
  const failedCount = reminders.filter((r) => r.status.toLowerCase() === 'failed').length;

  return (
    <div className="flex flex-col md:flex-row min-h-screen bg-[#F0F2F6] font-sans text-gray-800">
      {/* Streamlit-Style Sidebar */}
      <aside className="w-full md:w-80 bg-[#F8F9FB] border-r border-gray-300 p-6 flex flex-col justify-between shrink-0">
        <div className="space-y-6">
          <div className="border-b border-gray-200 pb-4">
            <h2 className="text-xl font-bold text-gray-900">⚙️ Call Settings</h2>
            <p className="text-xs text-gray-500 mt-1">Configure automated schedule & parameters</p>
          </div>

          {/* Automated Schedule Toggle */}
          <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-gray-800">Automated Dispatch</span>
              <input
                type="checkbox"
                checked={scheduleEnabled}
                onChange={(e) => setScheduleEnabled(e.target.checked)}
                className="h-4 w-4 text-red-500 rounded border-gray-300 focus:ring-red-400"
              />
            </div>
            <p className="text-xs text-gray-500">
              Status: <span className={scheduleEnabled ? 'text-green-600 font-medium' : 'text-gray-400'}>{scheduleEnabled ? 'Active (GitHub Actions Cron)' : 'Disabled'}</span>
            </p>
          </div>

          {/* Schedule Frequency */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-gray-700 uppercase tracking-wider">Run Frequency (Minutes)</label>
            <select
              value={cronInterval}
              onChange={(e) => setCronInterval(e.target.value)}
              className="w-full bg-white border border-gray-300 rounded-md p-2 text-sm focus:outline-none focus:border-red-500"
            >
              <option value="15">Every 15 Minutes</option>
              <option value="30">Every 30 Minutes</option>
              <option value="60">Every 1 Hour</option>
            </select>
          </div>

          {/* Max Retries Limit */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-gray-700 uppercase tracking-wider">Max Retries Per Patient</label>
            <input
              type="number"
              min="1"
              max="5"
              value={maxRetries}
              onChange={(e) => setMaxRetries(Number(e.target.value))}
              className="w-full bg-white border border-gray-300 rounded-md p-2 text-sm focus:outline-none focus:border-red-500"
            />
          </div>

          {/* Vapi LLM Model Selection */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-gray-700 uppercase tracking-wider">Vapi Assistant Model</label>
            <select
              value={voiceModel}
              onChange={(e) => setVoiceModel(e.target.value)}
              className="w-full bg-white border border-gray-300 rounded-md p-2 text-sm focus:outline-none focus:border-red-500"
            >
              <option value="gpt-4o-mini">OpenAI GPT-4o Mini</option>
              <option value="gpt-4o">OpenAI GPT-4o</option>
              <option value="claude-3-5-sonnet">Claude 3.5 Sonnet</option>
            </select>
          </div>
        </div>

        <div className="pt-6 border-t border-gray-200 text-xs text-gray-400 text-center">
          Vapi Automated Batch Calls v1.0
        </div>
      </aside>

      {/* Main Streamlit Canvas */}
      <main className="flex-1 p-6 md:p-10 max-w-7xl mx-auto w-full space-y-6">
        {/* Title Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
          <div>
            <h1 className="text-2xl md:text-3xl font-extrabold text-gray-900 flex items-center gap-2">
              <span>📞</span> Dynamic Daily Automated Batch Calls
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              Automated appointment reminder caller powered by Vapi AI & GitHub Actions.
            </p>
          </div>

          <div className="flex gap-3">
            <button
              onClick={fetchReminders}
              className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-semibold rounded-lg border border-gray-300 transition"
            >
              🔄 Refresh
            </button>
            <button
              onClick={handleRunBatchNow}
              disabled={isBatchRunning}
              className="px-5 py-2 bg-[#FF4B4B] hover:bg-[#E63939] text-white text-sm font-bold rounded-lg shadow-sm transition disabled:opacity-50"
            >
              {isBatchRunning ? '⏳ Executing Batch...' : '▶ Run Daily Batch Now'}
            </button>
          </div>
        </div>

        {/* Streamlit-Style Metric Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Total Reminders</p>
            <p className="text-3xl font-black text-gray-900 mt-1">{totalRecords}</p>
          </div>

          <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Confirmed</p>
            <p className="text-3xl font-black text-green-600 mt-1">{confirmedCount}</p>
          </div>

          <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Pending</p>
            <p className="text-3xl font-black text-yellow-500 mt-1">{pendingCount}</p>
          </div>

          <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Failed / Retried</p>
            <p className="text-3xl font-black text-red-500 mt-1">{failedCount}</p>
          </div>
        </div>

        {/* Status Notification Banner */}
        {message && (
          <div
            className={`p-4 rounded-lg text-sm border font-medium ${
              message.type === 'success'
                ? 'bg-green-50 text-green-800 border-green-300'
                : message.type === 'error'
                ? 'bg-red-50 text-red-800 border-red-300'
                : 'bg-blue-50 text-blue-800 border-blue-300'
            }`}
          >
            {message.text}
          </div>
        )}

        {/* Data Frame Table View */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
            <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wider">Appointment Database Table</h3>
            <span className="text-xs text-gray-400">showing {reminders.length} rows</span>
          </div>

          {loading ? (
            <div className="p-12 text-center text-gray-500">Loading database records...</div>
          ) : reminders.length === 0 ? (
            <div className="p-12 text-center text-gray-500">No appointments found in SQLite database.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-gray-700">
                <thead className="bg-[#F8F9FB] border-b border-gray-200 text-xs font-bold text-gray-500 uppercase">
                  <tr>
                    <th className="px-6 py-3">ID</th>
                    <th className="px-6 py-3">Patient Name</th>
                    <th className="px-6 py-3">Phone Number</th>
                    <th className="px-6 py-3">Appointment Time</th>
                    <th className="px-6 py-3">Status</th>
                    <th className="px-6 py-3">Retry Count</th>
                    <th className="px-6 py-3 text-right">Manual Trigger</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 font-mono text-xs">
                  {reminders.map((item) => {
                    const statusLower = item.status.toLowerCase();
                    return (
                      <tr key={item.id} className="hover:bg-gray-50 transition">
                        <td className="px-6 py-4 text-gray-400">#{item.id}</td>
                        <td className="px-6 py-4 font-sans font-semibold text-gray-900">{item.patient_name}</td>
                        <td className="px-6 py-4 text-gray-600">{item.phone_number}</td>
                        <td className="px-6 py-4 font-sans text-gray-600">{item.appointment_time}</td>
                        <td className="px-6 py-4 font-sans">
                          {statusLower === 'confirmed' && (
                            <span className="px-2 py-1 text-xs font-bold rounded bg-green-100 text-green-800">Confirmed</span>
                          )}
                          {statusLower === 'failed' && (
                            <span className="px-2 py-1 text-xs font-bold rounded bg-red-100 text-red-800">Failed</span>
                          )}
                          {statusLower === 'pending' && (
                            <span className="px-2 py-1 text-xs font-bold rounded bg-yellow-100 text-yellow-800">Pending</span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-gray-500">{item.retry_count} / {maxRetries}</td>
                        <td className="px-6 py-4 text-right font-sans">
                          <button
                            onClick={() => handleTriggerSingleCall(item)}
                            disabled={callingId === item.id}
                            className="px-3 py-1.5 bg-[#FF4B4B] hover:bg-[#E63939] text-white rounded text-xs font-bold transition disabled:opacity-50"
                          >
                            {callingId === item.id ? 'Calling...' : '📞 Call Now'}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
