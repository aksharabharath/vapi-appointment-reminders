from datetime import datetime
import pytz
import streamlit as st
from backend.github_sync import push_file_to_github
from vapi_call_automation import (
    DB_PATH,
    get_all_patients,
    get_call_history,
    get_pending_patients,
    get_scheduled_call_time,
    is_daily_schedule_enabled,
    process_batch_calls,
    reset_all_patients_called_status,
    set_daily_schedule_enabled,
    set_scheduled_call_time,
)

PST_TZ = pytz.timezone("America/Los_Angeles")

st.set_page_config(
    page_title="AI Appointment Assistant",
    page_icon="📞",
    layout="wide",
)

# Custom Styling for Clean Hierarchy
st.markdown(
    """
    <style>
    .stApp { max-width: 1200px; margin: 0 auto; }
    .metric-card {
        background-color: #f8f9fa;
        border: 1px solid #e9ecef;
        padding: 15px;
        border-radius: 8px;
        text-align: center;
    }
    </style>
""",
    unsafe_allow_html=True,
)

# ---------------------------------------------------------
# 1. HEADER & SYSTEM CLOCK
# ---------------------------------------------------------
pst_now = datetime.now(PST_TZ).strftime("%b %d, %Y | %I:%M %p PST")

st.title("📞 AI Appointment Assistant")
st.caption(
    f"Automated Healthcare Voice Reminder System • **System Time:** {pst_now}"
)

st.divider()

# ---------------------------------------------------------
# 2. METRICS DISPLAY
# ---------------------------------------------------------
pending_list = get_pending_patients()
all_patients = get_all_patients()
call_history = get_call_history()

pending_count = len(pending_list)
called_count = len(all_patients) - pending_count
total_count = len(all_patients)

m1, m2, m3 = st.columns(3)
m1.metric("📋 Pending Queue", f"{pending_count} Patients")
m2.metric("✅ Already Called", f"{called_count} Patients")
m3.metric("👥 Total Roster", f"{total_count} Patients")

st.divider()

# ---------------------------------------------------------
# 3. CONTROL CENTER (SCHEDULE & MANUAL TRIGGER)
# ---------------------------------------------------------
st.subheader("⚙️ Control Center")

col_sched, col_trigger = st.columns([1, 1], gap="medium")

with col_sched:
    st.markdown("### ⏰ Daily Automated Schedule")

    current_enabled = is_daily_schedule_enabled()
    new_toggle = st.toggle(
        "Enable Automated Daily Call Batch",
        value=current_enabled,
        help="When enabled, background calls execute automatically at the scheduled time.",
    )

    if new_toggle != current_enabled:
        set_daily_schedule_enabled(new_toggle)
        st.toast(
            f"Automated schedule {'enabled' if new_toggle else 'disabled'}."
        )
        st.rerun()

    # Manual Text Entry for Scheduled Time
    current_time_setting = get_scheduled_call_time()  # e.g. "09:50 AM"

    selected_time = st.text_input(
        "Target Call Time (PST):",
        value=current_time_setting,
        placeholder="e.g. 09:50 AM, 2:30 PM, or 14:00",
        disabled=not new_toggle,
        help="Type any custom time format (e.g. 9:50 AM, 10:15 AM). Press Enter to save.",
    )

    if selected_time.strip() != current_time_setting:
        set_scheduled_call_time(selected_time.strip())
        st.toast(f"✅ Scheduled call time updated to '{selected_time.strip()}' PST!")
        st.rerun()
        
with col_trigger:
    st.markdown("###  Manual Execution")
    st.write(
        f"Click below to immediately initiate outbound voice calls for all **{pending_count} pending patient(s)**."
    )

    api_key = st.secrets.get("VAPI_API_KEY")
    phone_id = st.secrets.get("VAPI_PHONE_NUMBER_ID")

    if st.button(
        "📞 Call All Pending Patients Now",
        disabled=(pending_count == 0),
        type="primary",
        use_container_width=True,
    ):
        if not api_key or not phone_id:
            st.error(
                "Missing VAPI_API_KEY or VAPI_PHONE_NUMBER_ID in Streamlit Secrets."
            )
        else:
            progress_bar = st.progress(0)
            status_text = st.empty()

            def ui_progress(current, total, msg):
                progress_bar.progress(current / total)
                status_text.text(f"[{current}/{total}] {msg}")

            results = process_batch_calls(
                api_key=api_key,
                phone_number_id=phone_id,
                progress_callback=ui_progress,
            )

            status_text.empty()
            progress_bar.empty()
            st.success(
                f"Batch execution completed! Total: {results['total']} | Successful: {results['successful']} | Failed: {results['failed']}"
            )
            st.rerun()

st.divider()

# ---------------------------------------------------------
# 4. TABBED PATIENT & CALL AUDIT VIEWS
# ---------------------------------------------------------
st.subheader("📊 Patient & Audit Data")

tab1, tab2, tab3 = st.tabs(
    ["Pending Queue", "Full Patient Roster", "Call Audit History"]
)

with tab1:
    if pending_list:
        st.dataframe(pending_list, use_container_width=True, hide_index=True)
    else:
        st.info("🎉 No pending calls! All patients have been processed.")

with tab2:
    if all_patients:
        st.dataframe(all_patients, use_container_width=True, hide_index=True)

with tab3:
    if call_history:
        st.dataframe(call_history, use_container_width=True, hide_index=True)
    else:
        st.caption("No call attempts logged yet.")

# ---------------------------------------------------------
# 5. ADMIN UTILITIES
# ---------------------------------------------------------
with st.expander("🛠️ Admin Utilities"):
    st.write(
        "Reset all patient records to `called_yet = 0` to re-test batch execution."
    )
    if st.button("🔄 Reset All Patients to 'Uncalled'"):
        reset_all_patients_called_status()
        st.success("All patient statuses reset to pending.")
        st.rerun()

# Example Streamlit Form or Input for Target Time
new_target_time = st.text_input("Target Call Time (PST):", value="07:50 PM")

if st.button("Save & Sync Schedule"):
    # 1. Save time locally to file or SQLite
    with open("scheduled_time.txt", "w") as f:
        f.write(new_target_time.strip())

    # 2. Auto-commit and push to GitHub so GitHub Actions picks it up!
    with st.spinner("Syncing scheduled time to GitHub..."):
        success = push_file_to_github(
            file_path="scheduled_time.txt",
            commit_message=f"Update target time to {new_target_time.strip()}",
        )
        if success:
            st.success(
                f"✅ Scheduled time ({new_target_time}) saved and synced to GitHub!"
            )