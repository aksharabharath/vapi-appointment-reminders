'use client';

import { useState, useEffect } from 'react';

interface Patient {
  id: number;
  patient_name: string;
  phone_number: string;
  appointment_time: string;
  status: string;
  retry_count: number;
  last_call_timestamp?: string;
  called_yet?: number;
}

interface CallHistory {
  id: number;
  patient_id: number;
  patient_name: string;
  phone_number: string;
  status: string;
  call_time: string;
  vapi_call_id?: string;
}

export default function StreamlitStyleDashboard() {
  // Real-time Clock
  const [pstTime, setPstTime] = useState<string>('');

  // Data States
  const [allPatients, setAllPatients] = useState<Patient[]>([]);
  const [callLogs, setCallLogs] = useState<CallHistory[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // Control Center: Schedule State
  const [isScheduleEnabled, setIsScheduleEnabled] = useState<boolean>(true);
  const [targetTime, setTargetTime] = useState<string>('01:00');
  const [period, setPeriod] = useState<string>('PM');
  const [isSyncing, setIsSyncing] = useState<boolean>(false);

  // Control Center: Manual Batch State
  const [isBatchExecuting, setIsBatchExecuting] = useState<boolean>(false);
  const [batchProgress, setBatchProgress] = useState<number>(0);
  const [batchStatusText, setBatchStatusText] = useState<string>('');
  const [batchSummary, setBatchSummary] = useState<string | null>(null);

  // Active Tab
  const [activeTab, setActiveTab] = useState<'pending' | 'roster' | 'history'>('pending');

  // Admin Utilities Expander State
  const [isAdminOpen, setIsAdminOpen] = useState<boolean>(false);

  // System Notifications
  const [toastMessage, setToastMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  // Update Clock Every Second (America/Los_Angeles Timezone)
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

  // Fetch Data from Next.js API Routes
  const fetchData = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/reminders');
      const json = await res.json();
      if (json.success) {
        setAllPatients(json.data || []);
      }
    } catch (err) {
      console.error('Failed to load patient database:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Derived Queues
  const pendingQueue = allPatients.filter(
    (p) => (p.called_yet === undefined ? p.status.toLowerCase() === 'pending' : p.called_yet === 0)
  );
  const alreadyCalledQueue = allPatients.length - pendingQueue.length;

  // Toggle Schedule Handler
  const handleToggleSchedule = (enabled: boolean) => {
    setIsScheduleEnabled(enabled);
    setToastMessage({
      type: 'info',
      text: enabled ? 'Automated schedule enabled!' : 'Automated schedule disabled!',
    });
  };

  // Sync Schedule to GitHub
  const handleSaveAndSyncGithub = async () => {
    setIsSyncing(true);
    setToastMessage({ type: 'info', text: 'Syncing schedule directly to GitHub...' });

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
          text: `✅ Target call time set to '${timeString}' PST and synced to GitHub!`,
        });
      } else {
        setToastMessage({
          type: 'error',
          text: '❌ Sync failed. Please check Streamlit Cloud Secrets / GitHub Token.',
        });
      }
    } catch (err) {
      setToastMessage({
        type: 'error',
        text: '❌ Sync failed. Please check Streamlit Cloud Secrets.',
      });
    } finally {
      setIsSyncing(false);
    }
  };

  // Manual Batch Execution Handler
  const handleCallAllPendingNow = async () => {
    if (pendingQueue.length === 0) return;

    setIsBatchExecuting(true);
    setBatchProgress(0);
    setBatchSummary(null);

    let successCount = 0;
    let failedCount = 0;
    const total = pendingQueue.length;

    for (let i = 0; i < total; i++) {
      const patient = pendingQueue[i];
      const currentStep = i + 1;
      setBatchProgress(Math.round((currentStep / total) * 100));
      setBatchStatusText(`[${currentStep}/${total}] Calling ${patient.patient_name}...`);

      try {
        const res = await fetch('/api/calls/trigger', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            phoneNumber: patient.phone_number,
            patientName: patient.patient_name,
            appointmentTime: patient.appointment_time,
          }),
        });

        const json = await res.json();
        if (json.success) {
          successCount++;
        } else {
          failedCount++;
        }
      } catch (err) {
        failedCount++;
      }
    }

    setBatchSummary(`Batch completed! Total: ${total} | Successful: ${successCount} | Failed: ${failedCount}`);
    setIsBatchExecuting(false);
    fetchData(); // Rerun app data refresh
  };

  // Admin Reset Handler
  const handleResetAllPatients = async () => {
    try {
      const res = await fetch('/api/admin/reset', { method: 'POST' });
      const json = await res.json();
      if (json.success) {
        setToastMessage({ type: 'success', text: 'All patient statuses reset to pending.' });
        fetchData();
      } else {
        setToastMessage({ type: 'error', text: 'Failed to reset patient statuses.' });
      }
    } catch (err) {
      setToastMessage({ type: 'error', text: 'Error connecting to server.' });
    }
  };

  return (
    <div className="min-h-screen bg-[#F0F2F6] font-sans text-gray-800 p-4 md:p-8">
      <div className="max-w-[1200px] mx-auto space-y-6">

        {/* 1. HEADER SECTION */}
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

        {/* System Toast Messages */}
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
            <button
              onClick={() => setToastMessage(null)}
              className="text-xs font-bold text-gray-500 hover:text-gray-800"
            >
              ✕
            </button>
          </div>
        )}

        {/* 2. DASHBOARD METRICS */}
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

        {/* 3. CONTROL CENTER */}
        <section className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
          <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
            <span>⚙️</span> Control Center
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 divide-y md:divide-y-0 md:divide-x divide-gray-200">

            {/* 3A. ⏰ Daily Automated Schedule */}
            <div className="space-y-4 pr-0 md:pr-4">
              <h3 className="text-md font-bold text-gray-800 flex items-center gap-1">
                <span>⏰</span> Daily Automated Schedule
              </h3>

              {/* Schedule Toggle */}
              <div className="flex items-center justify-between bg-gray-50 p-3 rounded-lg border border-gray-200">
                <div>
                  <p className="text-sm font-semibold text-gray-800">Enable Automated Daily Call Batch</p>
                  <p className="text-xs text-gray-500">
                    When enabled, background calls execute automatically at scheduled time.
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={isScheduleEnabled}
                  onChange={(e) => handleToggleSchedule(e.target.checked)}
                  className="h-5 w-5 text-red-500 rounded border-gray-300 focus:ring-red-400"
                />
              </div>

              {/* Time Input & AM/PM Selector */}
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

              {/* Save & Sync Button */}
              <button
                disabled={!isScheduleEnabled || isSyncing}
                onClick={handleSaveAndSyncGithub}
                className="w-full py-2.5 bg-[#FF4B4B] hover:bg-[#E63939] text-white font-bold text-sm rounded shadow-sm transition disabled:opacity-50"
              >
                {isSyncing ? 'Syncing...' : '💾 Save & Sync Schedule to GitHub'}
              </button>
            </div>

            {/* 3B. 📞 Manual Execution */}
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

              {/* Progress UI */}
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

              {/* Batch Summary */}
              {batchSummary && (
                <div className="p-3 bg-green-50 text-green-800 text-xs font-bold rounded border border-green-200">
                  {batchSummary}
                </div>
              )}
            </div>
          </div>
        </section>

        <hr className="border-gray-300" />

        {/* 4. PATIENT & AUDIT DATA TABS */}
        <section className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          {/* Tab Selection Navigation */}
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

          {/* Tab 1: Pending Queue */}
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
                        <th className="px-4 py-3">Patient Name</th>
                        <th className="px-4 py-3">Phone Number</th>
                        <th className="px-4 py-3">Appointment Time</th>
                        <th className="px-4 py-3">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {pendingQueue.map((patient) => (
                        <tr key={patient.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 font-mono text-xs text-gray-400">#{patient.id}</td>
                          <td className="px-4 py-3 font-semibold text-gray-900">{patient.patient_name}</td>
                          <td className="px-4 py-3 font-mono text-gray-600">{patient.phone_number}</td>
                          <td className="px-4 py-3">{patient.appointment_time}</td>
                          <td className="px-4 py-3">
                            <span className="px-2 py-0.5 text-xs font-bold rounded bg-yellow-100 text-yellow-800">
                              Pending
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

          {/* Tab 2: Full Patient Roster */}
          {activeTab === 'roster' && (
            <div className="p-6">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm text-gray-700">
                  <thead className="bg-gray-50 text-xs text-gray-500 uppercase border-b border-gray-200">
                    <tr>
                      <th className="px-4 py-3">ID</th>
                      <th className="px-4 py-3">Patient Name</th>
                      <th className="px-4 py-3">Phone Number</th>
                      <th className="px-4 py-3">Appointment Time</th>
                      <th className="px-4 py-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {allPatients.map((patient) => (
                      <tr key={patient.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 font-mono text-xs text-gray-400">#{patient.id}</td>
                        <td className="px-4 py-3 font-semibold text-gray-900">{patient.patient_name}</td>
                        <td className="px-4 py-3 font-mono text-gray-600">{patient.phone_number}</td>
                        <td className="px-4 py-3">{patient.appointment_time}</td>
                        <td className="px-4 py-3">
                          <span
                            className={`px-2 py-0.5 text-xs font-bold rounded ${
                              patient.status.toLowerCase() === 'confirmed'
                                ? 'bg-green-100 text-green-800'
                                : 'bg-yellow-100 text-yellow-800'
                            }`}
                          >
                            {patient.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Tab 3: Call Audit History */}
          {activeTab === 'history' && (
            <div className="p-6">
              {callLogs.length === 0 ? (
                <div className="text-center py-12 text-gray-500 text-sm font-semibold">
                  No call attempts logged yet.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm text-gray-700">
                    <thead className="bg-gray-50 text-xs text-gray-500 uppercase border-b border-gray-200">
                      <tr>
                        <th className="px-4 py-3">Call ID</th>
                        <th className="px-4 py-3">Patient Name</th>
                        <th className="px-4 py-3">Phone Number</th>
                        <th className="px-4 py-3">Call Time</th>
                        <th className="px-4 py-3">Outcome</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {callLogs.map((log) => (
                        <tr key={log.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 font-mono text-xs text-gray-400">{log.vapi_call_id || log.id}</td>
                          <td className="px-4 py-3 font-semibold text-gray-900">{log.patient_name}</td>
                          <td className="px-4 py-3 font-mono text-gray-600">{log.phone_number}</td>
                          <td className="px-4 py-3">{log.call_time}</td>
                          <td className="px-4 py-3 font-bold">{log.status}</td>
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

        {/* 5. 🛠️ ADMIN UTILITIES EXPANDER */}
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
