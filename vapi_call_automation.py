import os
import sqlite3
import time
from typing import Callable, Dict, List, Optional
import requests

# SQLite Database File Path
DB_PATH = "patients.db"

# Default API Configuration (overridden dynamically via function arguments)
DEFAULT_VAPI_API_KEY = os.getenv("VAPI_API_KEY", "")
DEFAULT_VAPI_PHONE_NUMBER_ID = os.getenv("VAPI_PHONE_NUMBER_ID", "")


# ==========================================
# 1. DATABASE ACCESS & HELPER FUNCTIONS
# ==========================================


def get_db_connection() -> sqlite3.Connection:
    """Returns a connection to the local SQLite database."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row  # Enables column access by name
    return conn


def get_pending_patients() -> List[Dict]:
    """Retrieves all patients from the database who have not been called yet (called_yet == 0/False)."""
    conn = get_db_connection()
    cursor = conn.cursor()

    # Query patients where called_yet is 0 or False
    cursor.execute(
        """
        SELECT patient_id, first_name, last_name, phone_number, appointment_date, appointment_time, timezone
        FROM patients
        WHERE called_yet = 0 OR called_yet IS NULL OR called_yet = 'FALSE'
    """
    )

    rows = cursor.fetchall()
    conn.close()

    return [dict(row) for row in rows]


def get_all_patients() -> List[Dict]:
    """Retrieves all patients regardless of called_yet status for full roster visibility."""
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute(
        """
        SELECT patient_id, first_name, last_name, phone_number, appointment_date, appointment_time, timezone, called_yet
        FROM patients
    """
    )

    rows = cursor.fetchall()
    conn.close()

    return [dict(row) for row in rows]


def mark_patient_as_called(patient_id: int):
    """Updates a patient's record setting called_yet = 1 after a call execution."""
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute(
        """
        UPDATE patients
        SET called_yet = 1
        WHERE patient_id = ?
    """,
        (patient_id,),
    )

    conn.commit()
    conn.close()


def reset_all_patients_called_status():
    """Resets all patients' called_yet flag back to 0 (useful for testing/demo batch runs)."""
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("""
        UPDATE patients
        SET called_yet = 0
    """)

    conn.commit()
    conn.close()


def log_call_attempt(
    patient_id: int,
    vapi_call_id: str,
    status: str,
    decision: str,
    user_speech: str,
):
    """Inserts a new call interaction log into the call_attempts table."""
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute(
        """
        INSERT INTO call_attempts (patient_id, vapi_call_id, status, decision, user_speech)
        VALUES (?, ?, ?, ?, ?)
    """,
        (patient_id, vapi_call_id, status, decision, user_speech),
    )

    conn.commit()
    conn.close()


def get_call_history() -> List[Dict]:
    """Retrieves all recorded call attempts joined with patient names for display in UI."""
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("""
        SELECT 
            ca.call_attempt_id,
            ca.patient_id,
            p.first_name,
            p.last_name,
            ca.vapi_call_id,
            ca.status,
            ca.decision,
            ca.user_speech,
            ca.created_at
        FROM call_attempts ca
        JOIN patients p ON ca.patient_id = p.patient_id
        ORDER BY ca.created_at DESC
    """)

    rows = cursor.fetchall()
    conn.close()

    return [dict(row) for row in rows]


# ==========================================
# 2. VAPI API INTEGRATION & CALL EXECUTION
# ==========================================


def trigger_vapi_outbound_call(
    patient: Dict, api_key: str, phone_number_id: str
) -> Optional[str]:
    """Triggers an outbound voice call via Vapi API for a given patient dict."""
    url = "https://api.vapi.ai/call/phone"

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    patient_name = f"{patient['first_name']} {patient['last_name']}"
    appt_date = patient["appointment_date"]
    appt_time = patient["appointment_time"]

    # Prompt constructed dynamically with patient variables
    prompt_text = (
        f"You are calling {patient_name} to confirm their upcoming appointment on "
        f"{appt_date} at {appt_time}. Ask them to say 1 to confirm or say 2 to reschedule. "
        "Keep responses friendly, polite, and concise. Once they respond, acknowledge their answer "
        "and immediately hang up the call using the endCall tool."
    )

    payload = {
        "phoneNumberId": phone_number_id,
        "customer": {"number": patient["phone_number"]},
        "assistant": {
            "firstMessage": f"Hello {patient['first_name']}, this is an automated reminder for your appointment on {appt_date} at {appt_time}. Say 1 to confirm, or say 2 to reschedule.",
            "model": {
                "provider": "openai",
                "model": "gpt-4o-mini",
                "messages": [{"role": "system", "content": prompt_text}],
            },
            "voice": {"provider": "playht", "voiceId": "jennifer"},
        },
    }

    try:
        response = requests.post(url, json=payload, headers=headers, timeout=15)
        if response.status_code == 201:
            data = response.json()
            return data.get("id")
        else:
            print(f"Error triggering call: {response.status_code} - {response.text}")
            return None
    except Exception as e:
        print(f"Exception triggering Vapi call: {e}")
        return None


def poll_vapi_call_status(
    vapi_call_id: str, api_key: str, max_attempts: int = 12, delay: int = 5
) -> Dict:
    """Polls Vapi API until the call is completed or reaches max retry attempts."""
    url = f"https://api.vapi.ai/call/{vapi_call_id}"
    headers = {"Authorization": f"Bearer {api_key}"}

    for _ in range(max_attempts):
        try:
            res = requests.get(url, headers=headers, timeout=10)
            if res.status_code == 200:
                data = res.json()
                status = data.get("status")

                if status in ["ended", "completed"]:
                    # Parse transcript / response
                    transcript = data.get("transcript", "")
                    messages = data.get("messages", [])

                    # Extract patient speech from message transcript if available
                    patient_speech = ""
                    for msg in messages:
                        if msg.get("role") == "user":
                            patient_speech += f" {msg.get('content', '')}"

                    patient_speech = patient_speech.strip() or transcript

                    # Determine decision output
                    decision = "NO_INPUT"
                    if "1" in patient_speech or "confirm" in patient_speech.lower():
                        decision = "CONFIRMED"
                    elif (
                        "2" in patient_speech
                        or "reschedule" in patient_speech.lower()
                    ):
                        decision = "RESCHEDULE"
                    elif patient_speech:
                        decision = "INVALID"

                    return {
                        "status": "COMPLETED",
                        "decision": decision,
                        "user_speech": patient_speech,
                    }

            time.sleep(delay)
        except Exception as e:
            print(f"Error polling call status: {e}")
            time.sleep(delay)

    return {
        "status": "TIMEOUT",
        "decision": "NO_INPUT",
        "user_speech": "Call timed out or was unanswered.",
    }


# ==========================================
# 3. BATCH PROCESSOR FOR UNCALLED PATIENTS
# ==========================================


def process_batch_calls(
    api_key: str,
    phone_number_id: str,
    progress_callback: Optional[Callable[[int, int, str], None]] = None,
) -> Dict:
    """Sequentially loops through all uncalled patients, triggers calls, logs results, and updates status.

    Parameters:
        api_key: Vapi API key
        phone_number_id: Vapi Phone Number ID
        progress_callback: Optional function callback(current_index, total_count, status_message) for UI updates.

    Returns:
        Summary dict containing execution metrics.
    """
    pending_patients = get_pending_patients()
    total_patients = len(pending_patients)

    if total_patients == 0:
        return {
            "total": 0,
            "processed": 0,
            "successful": 0,
            "failed": 0,
            "details": [],
        }

    successful = 0
    failed = 0
    results_detail = []

    for idx, patient in enumerate(pending_patients, start=1):
        patient_id = patient["patient_id"]
        patient_name = f"{patient['first_name']} {patient['last_name']}"

        if progress_callback:
            progress_callback(
                idx, total_patients, f"Calling {patient_name} ({idx}/{total_patients})..."
            )

        # 1. Trigger Vapi Call
        vapi_call_id = trigger_vapi_outbound_call(
            patient, api_key, phone_number_id
        )

        if not vapi_call_id:
            # Handle API trigger failure gracefully
            log_call_attempt(
                patient_id=patient_id,
                vapi_call_id="FAILED_TRIGGER",
                status="FAILED",
                decision="ERROR",
                user_speech="Could not trigger call via Vapi API.",
            )
            mark_patient_as_called(patient_id)
            failed += 1
            results_detail.append({
                "patient": patient_name,
                "status": "FAILED",
                "decision": "ERROR",
            })
            continue

        # 2. Poll for call completion & extract transcript
        call_result = poll_vapi_call_status(
            vapi_call_id, api_key, max_attempts=8, delay=4
        )

        # 3. Log attempt outcome to database
        log_call_attempt(
            patient_id=patient_id,
            vapi_call_id=vapi_call_id,
            status=call_result["status"],
            decision=call_result["decision"],
            user_speech=call_result["user_speech"],
        )

        # 4. Mark patient as called in patients table
        mark_patient_as_called(patient_id)

        successful += 1
        results_detail.append({
            "patient": patient_name,
            "status": call_result["status"],
            "decision": call_result["decision"],
        })

    return {
        "total": total_patients,
        "processed": total_patients,
        "successful": successful,
        "failed": failed,
        "details": results_detail,
    }