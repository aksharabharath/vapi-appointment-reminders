import os
import streamlit as st

# Import backend helper functions from vapi_call_automation
from vapi_call_automation import (
    get_all_patients,
    get_call_history,
    get_pending_patients,
    process_batch_calls,
    reset_all_patients_called_status,
)

# Set page layout and title
st.set_page_config(
    page_title="Batch Patient Reminder System",
    page_icon="📞",
    layout="wide",
)


# ==========================================
# 1. SAFE SECRETS / CREDENTIAL RETRIEVAL
# ==========================================
def get_secret(key_name: str) -> str:
    """Safely fetch secrets from st.secrets (Streamlit Cloud) or os.getenv (Local)."""
    try:
        if key_name in st.secrets:
            return st.secrets[key_name]
    except Exception:
        pass
    return os.getenv(key_name, "")


VAPI_API_KEY = get_secret("VAPI_API_KEY")
VAPI_PHONE_NUMBER_ID = get_secret("VAPI_PHONE_NUMBER_ID")


# ==========================================
# 2. MAIN APP LAYOUT & HEADER
# ==========================================
st.title("📞 Batch AI Appointment Reminder System")
st.caption(
    "Automated outbound voice assistant powered by Vapi, Streamlit, and SQLite"
)

# API Key Validation Banner
if not VAPI_API_KEY or not VAPI_PHONE_NUMBER_ID:
    st.error(
        "❌ **API Credentials missing!** Please configure `VAPI_API_KEY` and `VAPI_PHONE_NUMBER_ID` in Streamlit Secrets or `.env`."
    )
    st.stop()

# Retrieve current DB state
pending_patients = get_pending_patients()
all_patients = get_all_patients()
call_history = get_call_history()

pending_count = len(pending_patients)
total_count = len(all_patients)
called_count = total_count - pending_count


# Metrics Summary Bar
m1, m2, m3 = st.columns(3)
m1.metric("Pending Calls", pending_count, delta_color="normal")
m2.metric("Already Called", called_count)
m3.metric("Total Patients in Roster", total_count)

st.divider()


# ==========================================
# 3. SIDEBAR UTILITIES
# ==========================================
with st.sidebar:
    st.header("⚙️ Admin Controls")
    st.markdown("Use this utility to reset all patient call statuses for testing.")

    if st.button("🔄 Reset All Patients to 'Uncalled'", use_container_width=True):
        reset_all_patients_called_status()
        st.success("All patient records set to `called_yet = False`!")
        st.rerun()

    st.markdown("---")
    st.markdown("### System Specs")
    st.write(f"**Database:** `patients.db` (SQLite)")
    st.write(f"**Voice Model:** OpenAI `gpt-4o-mini`")
    st.write(f"**Transcription:** Deepgram `nova-3`")


# ==========================================
# 4. BATCH CALL EXECUTION SECTION
# ==========================================
st.subheader("🚀 Batch Call Trigger")

if pending_count == 0:
    st.info(
        "🎉 **All patients have already been called!** Click 'Reset All Patients' in the sidebar if you want to re-run a batch test."
    )
else:
    st.write(
        f"Click below to initiate automated voice reminder calls for all **{pending_count} pending patient(s)**."
    )

    # Batch Call Button
    if st.button(
        f"📞 Call All {pending_count} Pending Patients",
        type="primary",
        use_container_width=True,
    ):
        progress_bar = st.progress(0, text="Initializing batch calling...")
        status_box = st.empty()

        # Define progress update callback for Streamlit UI
        def update_ui_progress(current_idx: int, total: int, message: str):
            percent = int((current_idx / total) * 100)
            progress_bar.progress(percent, text=message)
            status_box.info(f"⏳ **Processing:** {message}")

        # Execute Batch Call Loop
        summary = process_batch_calls(
            api_key=VAPI_API_KEY,
            phone_number_id=VAPI_PHONE_NUMBER_ID,
            progress_callback=update_ui_progress,
        )

        progress_bar.progress(100, text="Batch processing complete!")
        status_box.success(
            f"✅ **Batch Complete!** Executed {summary['successful']} call(s) successfully out of {summary['total']} pending."
        )

        # Pause briefly and refresh UI to update data tables
        st.rerun()

st.divider()


# ==========================================
# 5. DATA TABLES & MONITORING
# ==========================================
tab1, tab2, tab3 = st.tabs([
    "📋 Pending Queue",
    "👥 Full Patient Roster",
    "📊 Call Attempts Audit History",
])

# TAB 1: PENDING PATIENTS QUEUE
with tab1:
    st.subheader("Patients Pending Calls (`called_yet = False`)")
    if pending_count == 0:
        st.write("No patients currently waiting for calls.")
    else:
        # Display formatted table of pending patients
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

# TAB 2: FULL PATIENT ROSTER
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

# TAB 3: CALL ATTEMPTS HISTORY
with tab3:
    st.subheader("Logged Interaction History (`call_attempts`)")
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
                "Transcript / Response": h["user_speech"],
                "Timestamp": h["created_at"],
            })
        st.dataframe(formatted_history, use_container_width=True)