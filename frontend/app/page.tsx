'use client';

import { useState, useEffect } from 'react';

interface Patient {
  patient_id: string | number;
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
}

interface CallAttempt {
  id?: number;
  patient_id: string | number;
  call_time: string;
  status: string;
  vapi_call_id?: string;
}

export default function StreamlitDashboard() {
  const [pstTime, setPstTime] = useState<string>('');
  const [allPatients, setAllPatients] = useState<Patient[]>([]);
  const [callHistory, setCallHistory] = useState<CallAttempt[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  const [isScheduleEnabled, setIsScheduleEnabled] = useState<boolean>(true);
  const [targetTime, setTargetTime] = useState<string>('01:00');
  const [period, setPeriod] = useState<string>('PM');
  const [isSyncing, setIsSyncing] = useState<boolean>(false);

  const [isBatchExecuting, setIsBatchExecuting] = useState<boolean>(false);
  const [batchProgress, setBatchProgress] = useState<number>(0);
  const [batchStatusText, setBatchStatusText] = useState<string>('');
  const [batchSummary, setBatchSummary] = useState<string | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<'pending' | 'roster' | 'history'>('pending');
  const [isAdminOpen, setIsAdminOpen] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  useEffect(() => {
    const updateClock = () => {
      const now = new Date();
      const formatted = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/Los_Angeles',
        month: 'short',
        day: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true,
      }).format(now);
      setPstTime(formatted + ' PST');
    };
    updateClock();
    const interval = setInterval(updateClock, 1000);
    return () => clearInterval(interval);
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/reminders');
      const json = await res.json();
      if (json.success) {
        setAllPatients(json.data || []);
        setCallHistory(json.call_attempts || []);
      }
    } catch (err) {
      console.error('Failed to load patients database:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    fetch('/api/schedule/sync')
      .then((r) => r.json())
      .then((json) => {
        if (!json.success || !json.settings?.scheduledTime) return;
        const raw = String(json.settings.scheduledTime).replace(/\s*PST\s*$/i, '').trim();
        const parts = raw.split(/\s+/);
        if (parts[0]) setTargetTime(parts[0]);
        if (parts[1] === 'AM' || parts[1] === 'PM') setPeriod(parts[1]);
        if (typeof json.settings.enabled === 'boolean') setIsScheduleEnabled(json.settings.enabled);
      })
      .catch(() => undefined);
  }, []);

  const pendingQueue = allPatients.filter((p) => Number(p.called_yet) === 0);
  const alreadyCalledQueue = allPatients.length - pendingQueue.length;

  const handleToggleSchedule = (enabled: boolean) => {
    setIsScheduleEnabled(enabled);
    setToastMessage({
      type: 'info',
      text: enabled ? 'Automated schedule enabled!' : 'Automated schedule disabled!',
    });
  };

  const handleSaveAndSyncGithub = async () => {
    setIsSyncing(true);
    setToastMessage({ type: 'info', text: 'Saving schedule to the database...' });
    const timeString = `${targetTime} ${period}`;
    try {
      const res = await fetch('/api/schedule/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scheduledTime: `${timeString} PST`, enabled: isScheduleEnabled }),
      });
      const json = await res.json();
      if (json.success) {
        setToastMessage({
          type: 'success',
          text: `Target call time set to '${timeString}' PST and saved.`,
        });
      } else {
        setToastMessage({ type: 'error', text: '❌ Sync failed.' });
      }
    } catch (err) {
      setToastMessage({ type: 'error', text: '❌ Sync failed.' });
    } finally {
      setIsSyncing(false);
    }
  };

  const handleCallAllPendingNow = async () => {
    if (pendingQueue.length === 0) return;

    setIsBatchExecuting(true);
    setBatchProgress(0);
    setBatchSummary(null);
    setLastError(null);

    let successCount = 0;
    let failedCount = 0;
    const total = pendingQueue.length;

    for (let i = 0; i < total; i++) {
      const patient = pendingQueue[i];
      const currentStep = i + 1;
      const fullName = `${patient.first_name} ${patient.last_name}`;
      setBatchProgress(Math.round((currentStep / total) * 100));
      setBatchStatusText(`[${currentStep}/${total}] Calling ${fullName}...`);

      try {
        const res = await fetch('/api/calls/trigger', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            patientId: patient.patient_id,
            phoneNumber: patient.phone_number,
            patientName: fullName,
            appointmentTime: `${patient.appointment_date} ${patient.appointment_time}`,
          }),
        });

        const json = await res.json();
        if (json.success) {
          successCount++;
        } else {
          failedCount++;
          setLastError(json.error || 'Vapi API error');
        }
      } catch (err: any) {
        failedCount++;
        setLastError(err.message || 'Network error');
      }
    }

    setBatchSummary(`Batch completed! Total: ${total} | Successful: ${successCount} | Failed: ${failedCount}`);
    setIsBatchExecuting(false);
    fetchData();
  };

  const handleResetAllPatients = async () => {
    try {
      const res = await fetch('/api/admin/reset', { method: 'POST' });
      const json = await res.json();
      if (json.success) {
        setToastMessage({ type: 'success', text: 'All patient statuses reset to pending (called_yet = 0).' });
        fetchData();
      } else {
        setToastMessage({ type: 'error', text: 'Failed to reset patient records.' });
      }
    } catch (err) {
      setToastMessage({ type: 'error', text: 'Error connecting to server.' });
    }
  };

  return (
    <div className="min-h-screen bg-[#F0F2F6] font-sans text-gray-800 p-4 md:p-8">
      <div className="max-w-[1200px] mx-auto space-y-6">
        <header className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
          <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
            <span>📞</span> AI Appointment Assistant
          </h1>
          <p className="text-xs md:text-sm font-medium text-gray-500 mt-2 flex flex-wrap items-center gap-2">
            <span>Automated Healthcare Voice Reminder System</span>
            <span>•</span>
            <span className="font-mono bg-gray-100 text-gray-700 px-2 py-0.5 rounded border border-gray-200">
              System Time: {pstTime || 'Loading PST...'}
            </span>
          </p>
        </header>

        {toastMessage && (
          <div
            className={`p-4 rounded-lg text-sm border font-medium transition flex items-center justify-between ${
              toastMessage.type === 'success'
                ? 'bg-green-50 text-green-800 border-green-300'
                : toastMessage.type === 'error'
                ? 'bg-red-50 text-red-800 border-red-300'
                : 'bg-blue-50 text-blue-800 border-blue-300'
            }`}
          >
            <span>{toastMessage.text}</span>
            <button onClick={() => setToastMessage(null)} className="text-xs font-bold text-gray-500 hover:text-gray-800">
              ✕
            </button>
          </div>
        )}

        <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1">
              <span>📋</span> Pending Queue
            </p>
            <p className="text-3xl font-extrabold text-gray-900 mt-1">{pendingQueue.length} Patients</p>
          </div>

          <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1">
              <span>✅</span> Already Called
            </p>
            <p className="text-3xl font-extrabold text-green-600 mt-1">{alreadyCalledQueue} Patients</p>
          </div>

          <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1">
              <span>👥</span> Total Roster
            </p>
            <p className="text-3xl font-extrabold text-blue-600 mt-1">{allPatients.length} Patients</p>
          </div>
        </section>

        <hr className="border-gray-300" />

        <section className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
          <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
            <span>⚙️</span> Control Center
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 divide-y md:divide-y-0 md:divide-x divide-gray-200">
            <div className="space-y-4 pr-0 md:pr-4">
              <h3 className="text-md font-bold text-gray-800 flex items-center gap-1">
                <span>⏰</span> Daily Automated Schedule
              </h3>

              <div className="flex items-center justify-between bg-gray-50 p-3 rounded-lg border border-gray-200">
                <div>
                  <p className="text-sm font-semibold text-gray-800">Enable Automated Daily Call Batch</p>
                  <p className="text-xs text-gray-500">When enabled, background calls execute automatically at scheduled time.</p>
                </div>
                <input
                  type="checkbox"
                  checked={isScheduleEnabled}
                  onChange={(e) => handleToggleSchedule(e.target.checked)}
                  className="h-5 w-5 text-red-500 rounded border-gray-300 focus:ring-red-400"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-gray-600">Target Call Time (PST)</label>
                  <input
                    type="text"
                    disabled={!isScheduleEnabled}
                    value={targetTime}
                    onChange={(e) => setTargetTime(e.target.value)}
                    placeholder="12:50"
                    className="w-full bg-white border border-gray-300 rounded p-2 text-sm disabled:bg-gray-100 disabled:text-gray-400"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-gray-600">Period</label>
                  <select
                    disabled={!isScheduleEnabled}
                    value={period}
                    onChange={(e) => setPeriod(e.target.value)}
                    className="w-full bg-white border border-gray-300 rounded p-2 text-sm disabled:bg-gray-100 disabled:text-gray-400"
                  >
                    <option value="AM">AM</option>
                    <option value="PM">PM</option>
                  </select>
                </div>
              </div>

              <div className="text-xs font-bold text-gray-600 bg-gray-50 p-2 rounded border border-gray-200">
                Target Schedule: {targetTime} {period} PST
              </div>

              <button
                disabled={!isScheduleEnabled || isSyncing}
                onClick={handleSaveAndSyncGithub}
                className="w-full py-2.5 bg-[#FF4B4B] hover:bg-[#E63939] text-white font-bold text-sm rounded shadow-sm transition disabled:opacity-50"
              >
                {isSyncing ? 'Saving...' : 'Save schedule'}
              </button>
            </div>

            <div className="space-y-4 pt-4 md:pt-0 pl-0 md:pl-6">
              <h3 className="text-md font-bold text-gray-800 flex items-center gap-1">
                <span>📞</span> Manual Execution
              </h3>

              <p className="text-sm text-gray-600">
                Click below to immediately initiate outbound voice calls for all{' '}
                <span className="font-bold text-gray-900">{pendingQueue.length}</span> pending patient(s).
              </p>

              <button
                disabled={pendingQueue.length === 0 || isBatchExecuting}
                onClick={handleCallAllPendingNow}
                className="w-full py-3 bg-[#FF4B4B] hover:bg-[#E63939] text-white font-extrabold text-sm rounded-lg shadow-sm transition disabled:bg-gray-300 disabled:cursor-not-allowed"
              >
                {isBatchExecuting ? 'Executing Batch Calls...' : '📞 Call All Pending Patients Now'}
              </button>

              {isBatchExecuting && (
                <div className="space-y-2 bg-gray-50 p-4 rounded border border-gray-200">
                  <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
                    <div
                      className="bg-[#FF4B4B] h-3 rounded-full transition-all duration-300"
                      style={{ width: `${batchProgress}%` }}
                    ></div>
                  </div>
                  <p className="text-xs font-mono text-gray-600 text-center">{batchStatusText}</p>
                </div>
              )}

              {batchSummary && (
                <div className="p-3 bg-red-50 text-red-800 text-xs font-bold rounded border border-red-200 space-y-1">
                  <p>{batchSummary}</p>
                  {lastError && <p className="font-mono text-[11px] font-normal text-red-600">Error: {lastError}</p>}
                </div>
              )}
            </div>
          </div>
        </section>

        <hr className="border-gray-300" />

        <section className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="flex border-b border-gray-200 bg-gray-50 text-sm font-bold">
            <button
              onClick={() => setActiveTab('pending')}
              className={`px-6 py-3 border-b-2 transition ${
                activeTab === 'pending'
                  ? 'border-[#FF4B4B] text-[#FF4B4B] bg-white'
                  : 'border-transparent text-gray-500 hover:text-gray-800'
              }`}
            >
              Pending Queue ({pendingQueue.length})
            </button>
            <button
              onClick={() => setActiveTab('roster')}
              className={`px-6 py-3 border-b-2 transition ${
                activeTab === 'roster'
                  ? 'border-[#FF4B4B] text-[#FF4B4B] bg-white'
                  : 'border-transparent text-gray-500 hover:text-gray-800'
              }`}
            >
              Full Patient Roster ({allPatients.length})
            </button>
            <button
              onClick={() => setActiveTab('history')}
              className={`px-6 py-3 border-b-2 transition ${
                activeTab === 'history'
                  ? 'border-[#FF4B4B] text-[#FF4B4B] bg-white'
                  : 'border-transparent text-gray-500 hover:text-gray-800'
              }`}
            >
              Call Audit History
            </button>
          </div>

          {activeTab === 'pending' && (
            <div className="p-6">
              {pendingQueue.length === 0 ? (
                <div className="text-center py-12 text-gray-500 text-sm font-semibold">
                  🎉 No pending calls! All patients have been processed.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm text-gray-700">
                    <thead className="bg-gray-50 text-xs text-gray-500 uppercase border-b border-gray-200">
                      <tr>
                        <th className="px-4 py-3">ID</th>
                        <th className="px-4 py-3">First Name</th>
                        <th className="px-4 py-3">Last Name</th>
                        <th className="px-4 py-3">Phone Number</th>
                        <th className="px-4 py-3">Appointment Date</th>
                        <th className="px-4 py-3">Appointment Time</th>
                        <th className="px-4 py-3">Called Yet</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {pendingQueue.map((patient) => (
                        <tr key={patient.patient_id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 font-mono text-xs text-gray-400">#{patient.patient_id}</td>
                          <td className="px-4 py-3 font-semibold text-gray-900">{patient.first_name}</td>
                          <td className="px-4 py-3 font-semibold text-gray-900">{patient.last_name}</td>
                          <td className="px-4 py-3 font-mono text-gray-600">{patient.phone_number}</td>
                          <td className="px-4 py-3">{patient.appointment_date}</td>
                          <td className="px-4 py-3">{patient.appointment_time}</td>
                          <td className="px-4 py-3">
                            <span className="px-2 py-0.5 text-xs font-bold rounded bg-yellow-100 text-yellow-800">
                              0 (Pending)
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {activeTab === 'roster' && (
            <div className="p-6">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm text-gray-700">
                  <thead className="bg-gray-50 text-xs text-gray-500 uppercase border-b border-gray-200">
                    <tr>
                      <th className="px-4 py-3">ID</th>
                      <th className="px-4 py-3">First Name</th>
                      <th className="px-4 py-3">Last Name</th>
                      <th className="px-4 py-3">DOB</th>
                      <th className="px-4 py-3">Phone Number</th>
                      <th className="px-4 py-3">MRN</th>
                      <th className="px-4 py-3">Appointment</th>
                      <th className="px-4 py-3">Called Yet</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {allPatients.map((patient) => (
                      <tr key={patient.patient_id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 font-mono text-xs text-gray-400">#{patient.patient_id}</td>
                        <td className="px-4 py-3 font-semibold text-gray-900">{patient.first_name}</td>
                        <td className="px-4 py-3 font-semibold text-gray-900">{patient.last_name}</td>
                        <td className="px-4 py-3 text-xs">{patient.dob}</td>
                        <td className="px-4 py-3 font-mono text-gray-600">{patient.phone_number}</td>
                        <td className="px-4 py-3 font-mono text-xs">{patient.medical_record_number}</td>
                        <td className="px-4 py-3 text-xs">
                          {patient.appointment_date} {patient.appointment_time}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`px-2 py-0.5 text-xs font-bold rounded ${
                              Number(patient.called_yet) === 1
                                ? 'bg-green-100 text-green-800'
                                : 'bg-yellow-100 text-yellow-800'
                            }`}
                          >
                            {patient.called_yet}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'history' && (
            <div className="p-6">
              {callHistory.length === 0 ? (
                <div className="text-center py-12 text-gray-500 text-sm font-semibold">No call attempts logged yet.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm text-gray-700">
                    <thead className="bg-gray-50 text-xs text-gray-500 uppercase border-b border-gray-200">
                      <tr>
                        <th className="px-4 py-3">ID</th>
                        <th className="px-4 py-3">Patient ID</th>
                        <th className="px-4 py-3">Call Time</th>
                        <th className="px-4 py-3">Status</th>
                        <th className="px-4 py-3">Vapi Call ID</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {callHistory.map((log, idx) => (
                        <tr key={log.id || idx} className="hover:bg-gray-50">
                          <td className="px-4 py-3 font-mono text-xs text-gray-400">#{log.id || idx + 1}</td>
                          <td className="px-4 py-3 font-mono text-xs">#{log.patient_id}</td>
                          <td className="px-4 py-3">{log.call_time}</td>
                          <td className="px-4 py-3 font-bold text-green-700">{log.status}</td>
                          <td className="px-4 py-3 font-mono text-xs text-gray-500">{log.vapi_call_id || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </section>

        <hr className="border-gray-300" />

        <section className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <button
            onClick={() => setIsAdminOpen(!isAdminOpen)}
            className="w-full px-6 py-4 flex items-center justify-between text-left font-bold text-gray-800 bg-gray-50 hover:bg-gray-100 transition"
          >
            <span className="flex items-center gap-2">
              <span>🛠️</span> Admin Utilities
            </span>
            <span>{isAdminOpen ? '▲' : '▼'}</span>
          </button>

          {isAdminOpen && (
            <div className="p-6 space-y-4 bg-white border-t border-gray-200">
              <p className="text-xs text-gray-500">
                Reset all patient records to <code className="bg-gray-100 px-1 py-0.5 rounded text-gray-800">called_yet = 0</code> to re-test batch execution.
              </p>

              <button
                onClick={handleResetAllPatients}
                className="px-4 py-2 bg-[#FF4B4B] hover:bg-[#E63939] text-white text-xs font-bold rounded shadow-sm transition"
              >
                🔄 Reset All Patients to 'Uncalled'
              </button>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
