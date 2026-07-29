import os
import sqlite3
import subprocess
import time
from datetime import datetime
from typing import Callable, Dict, List, Optional
import pytz
import requests

# SQLite Database File Path
DB_PATH = "patients.db"
PST_TZ = pytz.timezone("America/Los_Angeles")


def auto_commit_db_to_git(commit_message: str = "Auto-update patients.db"):
    """Pushes local SQLite database changes back to GitHub so data persists across refreshes."""
    try:
        conn = sqlite3.connect(DB_PATH)
        conn.execute("PRAGMA wal_checkpoint(FULL);")
        conn.close()

        subprocess.run(["git", "add", DB_PATH], check=True)
        result = subprocess.run(
            ["git", "commit", "-m", f"DB: {commit_message}"],
            capture_output=True,
            text=True,
        )
        if "nothing to commit" not in result.stdout:
            subprocess.run(["git", "push"], check=True)
            print(f"✅ Automatically pushed {DB_PATH} updates to GitHub.")
    except Exception as e:
        print(f"Note: Git auto-push skipped or unavailable: {e}")


def get_pst_now_str() -> str:
    """Returns current date and time formatted in PST/PDT string."""
    return datetime.now(PST_TZ).strftime("%Y-%m-%d %I:%M:%S %p PST")


def format_date_for_speech(raw_date_str: str) -> str:
    """Converts YYYY-MM-DD or similar date string to spoken format like 'Wednesday, August 5th'."""
    try:
        dt = datetime.strptime(str(raw_date_str).strip(), "%Y-%m-%d")
        day = dt.day
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
    conn = sqlite3.connect(DB_PATH, timeout=20)
    conn.row_factory = sqlite3.Row
    return conn


def init_settings_table():
    """Ensures settings table exists with daily schedule default = enabled (1)."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        )
    """)
    cursor.execute("""
        INSERT OR IGNORE INTO settings (key, value) VALUES ('daily_schedule_enabled', '1')
    """)
    conn.commit()
    conn.close()


def is_daily_schedule_enabled() -> bool:
    """Checks whether automated 8 AM PST schedule is turned ON in UI settings."""
    init_settings_table()
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT value FROM settings WHERE key = 'daily_schedule_enabled'"
    )
    row = cursor.fetchone()
    conn.close()
    return row["value"] == "1" if row else True


def set_daily_schedule_enabled(enabled: bool):
    """Updates daily schedule setting (1 = enabled, 0 = disabled)."""
    init_settings_table()
    conn = get_db_connection()
    cursor = conn.cursor()
    val = "1" if enabled else "0"
    cursor.execute(
        """
        INSERT INTO settings (key, value) VALUES ('daily_schedule_enabled', ?)
        ON CONFLICT(key) DO UPDATE SET value = ?
    """,
        (val, val),
    )
    conn.commit()
    conn.close()


def get_pending_patients() -> List[Dict]:
    """Retrieves all patients where called_yet is 0, '0', FALSE, or NULL."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        """
        SELECT patient_id, first_name, last_name, phone_number, appointment_date, appointment_time, timezone
        FROM patients
        WHERE called_yet = 0 OR called_yet = '0' OR called_yet IS NULL OR called_yet = 'FALSE' or called_yet = 0.0
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
    """Explicitly updates called_yet = 1 and commits immediately."""
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
    auto_commit_db_to_git("Reset all patients called_yet to 0")


def log_call_attempt(
    patient_id: int,
    vapi_call_id: str,
    status: str,
    decision: str,
    user_speech: str,
):
    conn = get_db_connection()
    cursor = conn.cursor()
    pst_timestamp = get_pst_now_str()

    cursor.execute(
        """
        INSERT INTO call_attempts (patient_id, vapi_call_id, status, decision, user_speech, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
    """,
        (
            patient_id,
            vapi_call_id,
            status,
            decision,
            user_speech,
            pst_timestamp,
        ),
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
        ORDER BY ca.call_attempt_id DESC
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
    spoken_date = format_date_for_speech(patient["appointment_date"])
    appt_time = patient["appointment_time"]

    raw_phone = str(patient["phone_number"]).strip()
    if not raw_phone.startswith("+"):
        raw_phone = f"+1{raw_phone}"

    prompt_text = (
        f"You are calling {patient_name} to confirm their appointment on {spoken_date} at {appt_time}.\n\n"
        "INSTRUCTIONS FOR LIVE HUMAN:\n"
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
            "voicemailMessage": f"Hello {first_name}, this is an automated reminder regarding your appointment on {spoken_date} at {appt_time}. Please call our office back to confirm. Thank you!",
            "voicemailDetection": {
                "provider": "vapi",
                "backoffPlan": {
                    "maxRetries": 5,
                    "startAtSeconds": 2.5,
                    "frequencySeconds": 2.5,
                },
                "beepMaxAwaitSeconds": 25,
            },
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
    """Polls Vapi API and thoroughly extracts user speech from messages, transcript, or summary."""
    url = f"https://api.vapi.ai/call/{vapi_call_id}"
    headers = {"Authorization": f"Bearer {api_key}"}

    for _ in range(max_attempts):
        try:
            res = requests.get(url, headers=headers, timeout=10)
            if res.status_code == 200:
                data = res.json()
                status = data.get("status")
                ended_reason = data.get("endedReason", "")

                if status in ["ended", "completed"]:
                    messages = data.get("messages", [])
                    transcript = data.get("transcript", "")
                    summary = data.get("summary", "")

                    if "voicemail" in ended_reason.lower():
                        return {
                            "status": "COMPLETED",
                            "decision": "VOICEMAIL",
                            "user_speech": "[Voicemail - Left Message]",
                        }

                    # Extract user utterances from messages payload
                    user_speech_parts = []
                    for msg in messages:
                        role = msg.get("role", "").lower()
                        content = msg.get("message", "") or msg.get("content", "")
                        if role in ["user", "customer"] and content:
                            user_speech_parts.append(str(content).strip())

                    # Fallback to transcript parsing if messages array didn't contain explicit user roles
                    full_user_speech = " ".join(user_speech_parts).strip()
                    if not full_user_speech and transcript:
                        full_user_speech = transcript.strip()

                    # Classify decision intent
                    speech_lower = full_user_speech.lower()
                    decision = "NO_INPUT"

                    if "1" in speech_lower or "confirm" in speech_lower or "yes" in speech_lower:
                        decision = "CONFIRMED"
                    elif "2" in speech_lower or "reschedule" in speech_lower or "change" in speech_lower:
                        decision = "RESCHEDULE"
                    elif full_user_speech:
                        decision = "INVALID"

                    return {
                        "status": "COMPLETED",
                        "decision": decision,
                        "user_speech": full_user_speech or "No response detected",
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
                idx,
                total_patients,
                f"Calling {patient_name} ({idx}/{total_patients})...",
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
            failed += 1
            results_detail.append({
                "patient": patient_name,
                "status": "FAILED",
                "decision": "ERROR",
            })
            continue

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

        # STRICT RULE: Update called_yet = 1 if decision is CONFIRMED or RESCHEDULE
        if call_result["decision"] in ["CONFIRMED", "RESCHEDULE"]:
            mark_patient_as_called(patient_id)

        successful += 1
        results_detail.append({
            "patient": patient_name,
            "status": call_result["status"],
            "decision": call_result["decision"],
        })

        time.sleep(2)

    # Automatically commit and push patients.db changes to GitHub
    auto_commit_db_to_git("Log batch call attempts and patient status updates")

    return {
        "total": total_patients,
        "processed": total_patients,
        "successful": successful,
        "failed": failed,
        "details": results_detail,
    }