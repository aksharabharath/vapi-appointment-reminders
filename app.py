import os
from datetime import datetime
import pytz
import streamlit as st

# Local modules
from backend.github_sync import push_file_to_github
from vapi_call_automation import (
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

# Page Configuration
st.set_page_config(
    page_title="AI Appointment Assistant",
    page_icon="📞",
    layout="wide",
)

# Custom Layout Styling
st.markdown(
    """
    <style>
    .stApp { max-width: 1200px; margin: 0 auto; }
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

    # Automated Daily Schedule Toggle
    current_enabled = is_daily_schedule_enabled()
    new_toggle = st.toggle(
        "Enable Automated Daily Call Batch",
        value=current_enabled,
        help="When enabled, background calls execute automatically at the scheduled time.",
    )

    if new_toggle != current_enabled:
        set_daily_schedule_enabled(new_toggle)
        st.toast(
            f"Automated schedule {'enabled' if new_toggle else 'disabled'}!"
        )
        st.rerun()

    # Load target call time from helper/file
# Check session state first, then fallback to file helper
    if "current_time_setting" not in st.session_state:
        st.session_state["current_time_setting"] = (
            get_scheduled_call_time() or "01:00 PM"
        )

    current_time_setting = st.session_state["current_time_setting"]

    # Safely extract digits and AM/PM
    parts = current_time_setting.split()
    default_digits = parts[0] if len(parts) > 0 else "12:50"
    default_period = parts[1].upper() if len(parts) > 1 else "PM"

    col_time_val, col_period = st.columns([2, 1])

    with col_time_val:
        typed_time = st.text_input(
            "Target Call Time (PST):",
            value=default_digits,
            placeholder="e.g. 12:50",
            disabled=not new_toggle,
            help="Type time digits (e.g. 12:50, 01:00).",
        )

    with col_period:
        selected_period = st.selectbox(
            "Period:",
            options=["AM", "PM"],
            index=0 if default_period == "AM" else 1,
            disabled=not new_toggle,
        )

    full_selected_time = f"{typed_time.strip()} {selected_period}"

    st.write(f"**Target Schedule:** `{full_selected_time} PST`")

    # Explicit Save & Sync Button
    if st.button(
        "💾 Save & Sync Schedule to GitHub",
        disabled=not new_toggle,
        type="secondary",
        width="stretch",
    ):
        with st.spinner("Syncing schedule directly to GitHub..."):
            # Push string directly to GitHub
            success = push_file_to_github(
                file_content=full_selected_time,
                file_path="scheduled_time.txt",
                commit_message=f"Update scheduled time to '{full_selected_time}'",
            )

        if success:
            # Update session state memory so UI doesn't revert to 09:50 AM
            st.session_state["current_time_setting"] = full_selected_time
            set_scheduled_call_time(full_selected_time)

            st.success(
                f"✅ Target call time set to '{full_selected_time}' PST and synced to GitHub!"
            )
        else:
            st.error("❌ Sync failed. Please check Streamlit Cloud Secrets.")

with col_trigger:
    st.markdown("### 📞 Manual Execution")
    st.write(
        f"Click below to immediately initiate outbound voice calls for all **{pending_count} pending patient(s)**."
    )

    api_key = st.secrets.get("VAPI_API_KEY")
    phone_id = st.secrets.get("VAPI_PHONE_NUMBER_ID")

    if st.button(
        "📞 Call All Pending Patients Now",
        disabled=(pending_count == 0),
        type="primary",
        width="stretch",
    ):
        if not api_key or not phone_id:
            st.error(
                "Missing `VAPI_API_KEY` or `VAPI_PHONE_NUMBER_ID` in Streamlit Secrets."
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
                f"Batch completed! Total: {results['total']} | Successful: {results['successful']} | Failed: {results['failed']}"
            )
            st.rerun()

st.divider()

# ---------------------------------------------------------
# 4. PATIENT ROSTER & CALL AUDIT VIEWS
# ---------------------------------------------------------
st.subheader("📊 Patient & Audit Data")

tab1, tab2, tab3 = st.tabs(
    ["Pending Queue", "Full Patient Roster", "Call Audit History"]
)

with tab1:
    if pending_list:
        st.dataframe(pending_list, width="stretch", hide_index=True)
    else:
        st.info("🎉 No pending calls! All patients have been processed.")

with tab2:
    if all_patients:
        st.dataframe(all_patients, width="stretch", hide_index=True)

with tab3:
    if call_history:
        st.dataframe(call_history, width="stretch", hide_index=True)
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