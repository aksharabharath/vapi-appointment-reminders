import os
import streamlit as st

# Import backend helper functions
from vapi_call_automation import (
    get_all_patients,
    get_call_history,
    get_pending_patients,
    get_pst_now_str,
    is_daily_schedule_enabled,
    process_batch_calls,
    reset_all_patients_called_status,
    set_daily_schedule_enabled,
)

st.set_page_config(
    page_title="AI Appointment Assistant",
    page_icon="📞",
    layout="wide",
    initial_sidebar_state="collapsed",
)


def get_secret(key_name: str) -> str:
    try:
        if key_name in st.secrets:
            return st.secrets[key_name]
    except Exception:
        pass
    return os.getenv(key_name, "")


VAPI_API_KEY = get_secret("VAPI_API_KEY")
VAPI_PHONE_NUMBER_ID = get_secret("VAPI_PHONE_NUMBER_ID")

# ==========================================
# 1. HEADER & APP TITLE
# ==========================================
st.title("AI Appointment Assistant — Intelligent Voice Workflow Automation")
st.caption(
    f"Automated outbound voice assistant | Current Time: **{get_pst_now_str()}**"
)

if not VAPI_API_KEY or not VAPI_PHONE_NUMBER_ID:
    st.error(
        "❌ **API Credentials missing!** Please configure `VAPI_API_KEY` and `VAPI_PHONE_NUMBER_ID` in Streamlit Secrets or `.env`."
    )
    st.stop()

# Load DB records
pending_patients = get_pending_patients()
all_patients = get_all_patients()
call_history = get_call_history()

pending_count = len(pending_patients)
total_count = len(all_patients)
called_count = total_count - pending_count

# Metrics Dashboard
m1, m2, m3 = st.columns(3)
m1.metric("Pending Calls", pending_count)
m2.metric("Already Called", called_count)
m3.metric("Total Patients in Roster", total_count)

st.divider()

# ==========================================
# 2. SCHEDULE TOGGLE (PLACED AT TOP)
# ==========================================
st.subheader("Automated Daily Schedule")
current_schedule_state = is_daily_schedule_enabled()
new_schedule_state = st.toggle(
    "Enable Automated Daily 8:00 AM PST Call Batch",
    value=current_schedule_state,
    help="When enabled, the system will automatically run batch calls every morning at 8:00 AM PST for all pending patients.",
)

if new_schedule_state != current_schedule_state:
    set_daily_schedule_enabled(new_schedule_state)
    st.success(
        f"Schedule updated: {'Enabled (Active at 8 AM PST)' if new_schedule_state else 'Disabled'}"
    )
    st.rerun()

st.divider()

# ==========================================
# 3. BATCH CALL TRIGGER SECTION
# ==========================================
st.subheader("Manual Batch Call Trigger")

if pending_count == 0:
    st.info(
        "🎉 **All patients have already been called!** Click 'Reset All Patients' below if you want to re-run a batch test."
    )
else:
    st.write(
        f"Click below to manually initiate voice reminder calls for all **{pending_count} pending patient(s)** immediately."
    )

    if st.button(
        f"📞 Call All {pending_count} Pending Patients Now",
        type="primary",
        use_container_width=True,
    ):
        progress_bar = st.progress(0, text="Initializing batch calling...")
        status_box = st.empty()

        def update_ui_progress(current_idx: int, total: int, message: str):
            percent = int((current_idx / total) * 100)
            progress_bar.progress(percent, text=message)
            status_box.info(f"⏳ **Processing:** {message}")

        summary = process_batch_calls(
            api_key=VAPI_API_KEY,
            phone_number_id=VAPI_PHONE_NUMBER_ID,
            progress_callback=update_ui_progress,
        )

        progress_bar.progress(100, text="Batch processing complete!")
        status_box.success(
            f"✅ **Batch Complete!** Executed {summary['successful']} call(s) successfully."
        )

        st.rerun()

st.divider()

# ==========================================
# 4. DATA TABLES & MONITORING
# ==========================================
tab1, tab2, tab3 = st.tabs([
    "📋 Pending Queue",
    "👥 Full Patient Roster",
    "📊 Call Attempts Audit History",
])

with tab1:
    st.subheader("Patients Pending Calls (`called_yet = False`)")
    if pending_count == 0:
        st.write("No patients currently waiting for calls.")
    else:
        formatted_pending = []
        for p in pending_patients:
            formatted_pending.append({
                "ID": p["patient_id"],
                "Name": f"{p['first_name']} {p['last_name']}",
                "Phone": p["phone_number"],
                "Appointment Date": p["appointment_date"],
                "Appointment Time": p["appointment_time"],
                "Status": "⏳ Pending Call",
            })
        st.dataframe(formatted_pending, use_container_width=True)

with tab2:
    st.subheader("Complete Patient Registry")
    formatted_roster = []
    for p in all_patients:
        is_called = bool(p.get("called_yet"))
        formatted_roster.append({
            "ID": p["patient_id"],
            "Name": f"{p['first_name']} {p['last_name']}",
            "Phone": p["phone_number"],
            "Appointment Date": p["appointment_date"],
            "Appointment Time": p["appointment_time"],
            "Called Yet?": "✅ True" if is_called else "❌ False",
        })
    st.dataframe(formatted_roster, use_container_width=True)

with tab3:
    st.subheader("Logged Interaction History (`call_attempts`) - PST")
    if not call_history:
        st.write("No calls logged yet.")
    else:
        formatted_history = []
        for h in call_history:
            formatted_history.append({
                "Attempt ID": h["call_attempt_id"],
                "Patient Name": f"{h['first_name']} {h['last_name']}",
                "Status": h["status"],
                "Decision": h["decision"],
                "Response": h["user_speech"],
                "Timestamp (PST)": h["created_at"],
            })
        st.dataframe(formatted_history, use_container_width=True)

st.divider()

# ==========================================
# 5. ADMIN UTILITIES (MOVED TO BOTTOM)
# ==========================================
st.subheader("⚙️ Admin Utilities")
st.write("Use this utility to reset all patient call statuses for re-testing.")

if st.button("🔄 Reset All Patients to 'Uncalled'"):
    reset_all_patients_called_status()
    st.success("All patient records set to `called_yet = False`!")
    st.rerun()