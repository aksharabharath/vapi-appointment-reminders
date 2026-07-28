"""
Streamlit UI for Vapi Appointment Reminder Automation
Connects to patients.db and executes calls via VapiCallHandler.
"""

import os
import sqlite3
import streamlit as st
from vapi_call_automation import VapiCallHandler, get_patient_from_db, log_call_attempt

DB_FILE = "patients.db"


# ==========================================
# SAFE CREDENTIAL LOADING
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

if not VAPI_API_KEY or not VAPI_PHONE_NUMBER_ID:
    st.error(
        "❌ API Credentials missing! Please configure VAPI_API_KEY and VAPI_PHONE_NUMBER_ID."
    )
    st.stop()



# ==========================================
# PAGE CONFIGURATION
# ==========================================
st.set_page_config(page_title="Appointment Call Manager", page_icon="📞", layout="centered")

st.title("📞 Patient Appointment Call Manager")
st.markdown("Select a patient from the database, trigger an automated voice reminder, and track responses.")

st.divider()

# ==========================================
# 1. FETCH ALL PATIENTS FROM DATABASE
# ==========================================
def get_all_patients():
    """Fetch list of all patients for the dropdown selection."""
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    cursor.execute("SELECT patient_id, first_name, last_name, phone_number, appointment_date, appointment_time FROM patients")
    rows = cursor.fetchall()
    conn.close()
    return [dict(r) for r in rows]

def get_call_history():
    """Fetch full history of call attempts with separate first and last name columns."""
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    cursor.execute("""
        SELECT 
            c.call_attempt_id AS "Attempt ID",
            p.first_name AS "First Name",
            p.last_name AS "Last Name",
            c.status AS "Call Status",
            c.decision AS "Outcome",
            c.user_speech AS "Spoken Response",
            c.created_at AS "Timestamp"
        FROM call_attempts c
        JOIN patients p ON c.patient_id = p.patient_id
        ORDER BY c.call_attempt_id DESC
    """)
    rows = cursor.fetchall()
    conn.close()
    return [dict(r) for r in rows]

# ==========================================
# 2. PATIENT SELECTION & DETAILS CARD
# ==========================================
patients = get_all_patients()

if not patients:
    st.error("No patients found in patients.db! Make sure patients.db is initialized.")
    st.stop()

# Dropdown for selecting a patient
patient_options = {f"{p['first_name']} {p['last_name']} ({p['patient_id']})": p['patient_id'] for p in patients}
selected_label = st.selectbox("Select Patient to Call:", list(patient_options.keys()))
selected_patient_id = patient_options[selected_label]

# Fetch full record for selected patient
patient_data = get_patient_from_db(selected_patient_id)

# Display Patient Details Card
col1, col2 = st.columns(2)
with col1:
    st.subheader("👤 Patient Identity")
    st.write(f"**Name:** {patient_data['firstName']} {patient_data['lastName']}")
    st.write(f"**Phone:** `{patient_data['phoneNumber']}`")
    st.write(f"**DOB:** {patient_data.get('dateOfBirth', 'N/A')}")

with col2:
    st.subheader("📅 Appointment Info")
    st.write(f"**Date:** {patient_data['appointmentDate']}")
    st.write(f"**Time:** {patient_data['appointmentTime']}")
    st.write(f"**Timezone:** {patient_data.get('timezone', 'N/A')}")

st.divider()



if st.button("🚀 Start Automated Call", type="primary", use_container_width=True):
    handler = VapiCallHandler(VAPI_API_KEY, VAPI_PHONE_NUMBER_ID)

    with st.status("Initiating outbound voice call...", expanded=True) as status_box:
        try:
            # Step A: Place Call
            st.write(f"📞 Dialing **{patient_data['phoneNumber']}**...")
            call_response = handler.make_call(patient_data)
            call_id = call_response.get("id")

            if not call_id:
                st.error("Failed to initiate call. No Call ID returned.")
                st.stop()

            st.write(f"✅ Call Placed. **Call ID:** `{call_id}`")
            st.write("⏳ Waiting for patient response and call completion...")

            # Step B: Wait for Call Completion
            call_data = handler.wait_for_call_completion(call_id, max_wait_seconds=120)

            if call_data is None:
                st.error("Call timed out or status check failed.")
                st.stop()

            # Step C: Extract Response
            result = handler.extract_response(call_data)

            # Step D: Log to Database
            log_call_attempt(
                patient_id=patient_data["id"],
                vapi_call_id=call_id,
                status=result["status"],
                decision=result["decision"],
                user_speech=result["raw_speech"],
            )

            status_box.update(label="Call Complete!", state="complete", expanded=False)

            # Display Call Outcome Summary
            st.success(f"**Call Status:** {result['status'].upper()}")
            
            if result["decision"] == "CONFIRMED":
                st.balloons()
                st.success(f"🎉 **Patient Decision:** CONFIRMED (Spoke: '{result['raw_speech']}')")
            elif result["decision"] == "RESCHEDULE":
                st.warning(f"🔄 **Patient Decision:** RESCHEDULE REQUESTED (Spoke: '{result['raw_speech']}')")
            else:
                st.info(f"❓ **Patient Decision:** {result['decision']} (Spoke: '{result['raw_speech']}')")

        except Exception as e:
            status_box.update(label="Call Failed", state="error")
            st.error(f"Error during execution: {e}")

st.divider()

# ==========================================
# 4. CALL HISTORY TABLE
# ==========================================
st.subheader("📊 Recent Call Attempts History")
history = get_call_history()

if history:
    st.dataframe(history, use_container_width=True)
else:
    st.info("No call attempts logged yet. Click 'Start Automated Call' above to make your first attempt.")