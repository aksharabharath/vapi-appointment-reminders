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

export default function Dashboard() {
  const [reminders, setReminders] = useState<AppointmentReminder[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [callingId, setCallingId] = useState<number | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Fetch appointment reminders from Next.js API route
  const fetchReminders = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/reminders');
      const json = await res.json();
      if (json.success) {
        setReminders(json.data);
      } else {
        setMessage({ type: 'error', text: json.error || 'Failed to load reminders.' });
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

  // Trigger manual Vapi phone call
  const handleTriggerCall = async (item: AppointmentReminder) => {
    setCallingId(item.id);
    setMessage(null);

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
          text: `Call initiated for ${item.patient_name}! Call ID: ${json.callId}`,
        });
        // Refresh appointment list after triggering
        fetchReminders();
      } else {
        setMessage({
          type: 'error',
          text: json.error || `Failed to place call to ${item.patient_name}.`,
        });
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Error triggering call.' });
    } finally {
      setCallingId(null);
    }
  };

  const getStatusBadge = (status: string) => {
    const s = status.toLowerCase();
    if (s === 'confirmed') {
      return <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">Confirmed</span>;
    }
    if (s === 'failed') {
      return <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-red-100 text-red-800">Failed</span>;
    }
    return <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-yellow-100 text-yellow-800">Pending</span>;
  };

  return (
    <main className="min-h-screen bg-gray-50 p-6 md:p-12">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b pb-6 border-gray-200">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Vapi Appointment Reminders</h1>
            <p className="text-sm text-gray-500 mt-1">
              Automated batch voice call status and manual dispatch dashboard.
            </p>
          </div>
          <button
            onClick={fetchReminders}
            className="px-4 py-2 bg-white border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 shadow-sm transition"
          >
            Refresh Data
          </button>
        </div>

        {/* System Alert Notification */}
        {message && (
          <div
            className={`p-4 rounded-lg text-sm border ${
              message.type === 'success'
                ? 'bg-green-50 text-green-800 border-green-200'
                : 'bg-red-50 text-red-800 border-red-200'
            }`}
          >
            {message.text}
          </div>
        )}

        {/* Data Table */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          {loading ? (
            <div className="p-12 text-center text-gray-500">Loading appointments...</div>
          ) : reminders.length === 0 ? (
            <div className="p-12 text-center text-gray-500">No appointment reminders found.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-gray-600">
                <thead className="bg-gray-50 border-b border-gray-200 text-xs text-gray-500 uppercase tracking-wider">
                  <tr>
                    <th className="px-6 py-3">Patient Name</th>
                    <th className="px-6 py-3">Phone Number</th>
                    <th className="px-6 py-3">Appointment Time</th>
                    <th className="px-6 py-3">Status</th>
                    <th className="px-6 py-3">Retries</th>
                    <th className="px-6 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {reminders.map((item) => (
                    <tr key={item.id} className="hover:bg-gray-50/50 transition">
                      <td className="px-6 py-4 font-medium text-gray-900">{item.patient_name}</td>
                      <td className="px-6 py-4 font-mono text-gray-600">{item.phone_number}</td>
                      <td className="px-6 py-4">{item.appointment_time}</td>
                      <td className="px-6 py-4">{getStatusBadge(item.status)}</td>
                      <td className="px-6 py-4 text-gray-500">{item.retry_count}</td>
                      <td className="px-6 py-4 text-right">
                        <button
                          onClick={() => handleTriggerCall(item)}
                          disabled={callingId === item.id}
                          className="px-3 py-1.5 bg-blue-600 text-white rounded-md text-xs font-semibold hover:bg-blue-700 disabled:bg-blue-300 transition"
                        >
                          {callingId === item.id ? 'Calling...' : 'Call Now'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
