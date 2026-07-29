import os
import sqlite3
import time
from datetime import datetime
from typing import Callable, Dict, List, Optional
import requests

# SQLite Database File Path
DB_PATH = "patients.db"


def format_date_for_speech(raw_date_str: str) -> str:
    """Converts YYYY-MM-DD or similar date string to spoken format like 'Wednesday, August 5th'."""
    try:
        dt = datetime.strptime(str(raw_date_str).strip(), "%Y-%m-%d")
        day = dt.day
        # Add ordinal suffix (1st, 2nd, 3rd, 4th...)
        suffix = (
            "th"
            if 11 <= day <= 13
            else {1: "st", 2: "nd", 3: "rd"}.get(day % 10, "th")
        )
        return dt.strftime(f"%A, %B {day}{suffix}")
    except Exception:
        return str(raw_date_str)


# ==========================================
# 1. DATABASE ACCESS & HELPER FUNCTIONS
# ==========================================


def get_db_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def get_pending_patients() -> List[Dict]:
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        """
        SELECT patient_id, first_name, last_name, phone_number, appointment_date, appointment_time, timezone
        FROM patients
        WHERE called_yet = 0 OR called_yet IS NULL OR called_yet = 'FALSE'
        ORDER BY patient_id ASC
    """
    )
    rows = cursor.fetchall()
    conn.close()
    return [dict(row) for row in rows]


def get_all_patients() -> List[Dict]:
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        """
        SELECT patient_id, first_name, last_name, phone_number, appointment_date, appointment_time, timezone, called_yet
        FROM patients
        ORDER BY patient_id ASC
    """
    )
    rows = cursor.fetchall()
    conn.close()
    return [dict(row) for row in rows]


def mark_patient_as_called(patient_id: int):
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
    url = "https://api.vapi.ai/call/phone"

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    patient_name = f"{patient['first_name']} {patient['last_name']}"
    first_name = patient["first_name"]

    # Convert date format to spoken English
    spoken_date = format_date_for_speech(patient["appointment_date"])
    appt_time = patient["appointment_time"]

    # Phone number E.164 formatting
    raw_phone = str(patient["phone_number"]).strip()
    if not raw_phone.startswith("+"):
        raw_phone = f"+1{raw_phone}"

    prompt_text = (
        f"You are calling {patient_name} to confirm their appointment on {spoken_date} at {appt_time}.\n\n"
        "INSTRUCTIONS:\n"
        "1. Do NOT greet them again.\n"
        "2. Listen for their numerical or verbal answer (1/confirm OR 2/reschedule).\n"
        "3. If they say 1 or confirm: Say 'Thank you, your appointment is confirmed! Have a great day and goodbye!'\n"
        "4. If they say 2 or reschedule: Say 'Thank you, our office team will contact you to reschedule. Have a great day and goodbye!'\n"
        "5. Keep responses concise."
    )

    payload = {
        "phoneNumberId": phone_number_id,
        "customer": {"number": raw_phone},
        "assistant": {
            "firstMessage": f"Hello {first_name}, this is an automated reminder for your appointment on {spoken_date} at {appt_time}. Say 1 to confirm, or say 2 to reschedule.",
            "model": {
                "provider": "openai",
                "model": "gpt-4o-mini",
                "messages": [{"role": "system", "content": prompt_text}],
                "temperature": 0.2,
            },
            "endCallPhrases": ["goodbye", "have a great day"],
            "silenceTimeoutSeconds": 25,
            "maxDurationSeconds": 120,
        },
    }

    try:
        response = requests.post(url, json=payload, headers=headers, timeout=15)
        if response.status_code in [200, 201]:
            data = response.json()
            return data.get("id")
        else:
            print(
                f"Error triggering call for patient {patient['patient_id']}: {response.status_code} - {response.text}"
            )
            return None
    except Exception as e:
        print(f"Exception triggering Vapi call: {e}")
        return None

    
def poll_vapi_call_status(
    vapi_call_id: str, api_key: str, max_attempts: int = 15, delay: int = 4
) -> Dict:
    url = f"https://api.vapi.ai/call/{vapi_call_id}"
    headers = {"Authorization": f"Bearer {api_key}"}

    for _ in range(max_attempts):
        try:
            res = requests.get(url, headers=headers, timeout=10)
            if res.status_code == 200:
                data = res.json()
                status = data.get("status")

                if status in ["ended", "completed"]:
                    transcript = data.get("transcript", "")
                    messages = data.get("messages", [])

                    patient_speech = ""
                    for msg in messages:
                        if msg.get("role") == "user":
                            patient_speech += f" {msg.get('content', '')}"

                    patient_speech = patient_speech.strip() or transcript

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

        vapi_call_id = trigger_vapi_outbound_call(
            patient, api_key, phone_number_id
        )

        if not vapi_call_id:
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

        # Poll for completion
        call_result = poll_vapi_call_status(
            vapi_call_id, api_key, max_attempts=12, delay=4
        )

        log_call_attempt(
            patient_id=patient_id,
            vapi_call_id=vapi_call_id,
            status=call_result["status"],
            decision=call_result["decision"],
            user_speech=call_result["user_speech"],
        )

        mark_patient_as_called(patient_id)

        successful += 1
        results_detail.append({
            "patient": patient_name,
            "status": call_result["status"],
            "decision": call_result["decision"],
        })

        # Buffer pause between sequential calls to ensure clean line handoff
        time.sleep(3)

    return {
        "total": total_patients,
        "processed": total_patients,
        "successful": successful,
        "failed": failed,
        "details": results_detail,
    }