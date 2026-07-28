"""
Vapi Call Automation - 2-Table Architecture with Auto-Hangup
Pulls patient variables from 'patients' table and appends call outcome logs to 'call_attempts'.
Automatically ends the call immediately after the assistant speaks its response.
"""

from datetime import datetime
import os
import re
import sqlite3
import time
from typing import Dict, Optional
import requests

# Database Configuration
DB_FILE = "patients.db"


# ==========================================
# 1. DATABASE & FORMATTING HELPERS
# ==========================================
def format_spoken_date_time(date_str: str, time_str: str) -> tuple[str, str]:
    """Formats '2026-07-14' and '10:30' into natural spoken English ('Tuesday, July 14th', '10:30 AM')."""
    try:
        dt = datetime.strptime(date_str, "%Y-%m-%d")
        day = dt.day
        if 11 <= day <= 13:
            suffix = "th"
        else:
            suffix = {1: "st", 2: "nd", 3: "rd"}.get(day % 10, "th")

        spoken_date = dt.strftime(f"%A, %B {day}{suffix}")
    except ValueError:
        spoken_date = date_str

    try:
        tm = datetime.strptime(time_str, "%H:%M")
        spoken_time = tm.strftime("%I:%M %p").lstrip("0")
    except ValueError:
        spoken_time = time_str

    return spoken_date, spoken_time


def get_patient_from_db(patient_id: str) -> Optional[Dict]:
    """Fetch patient static details from 'patients' table."""
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    cursor.execute("SELECT * FROM patients WHERE patient_id = ?", (patient_id,))
    row = cursor.fetchone()
    conn.close()

    if not row:
        return None

    return {
        "id": row["patient_id"],
        "firstName": row["first_name"],
        "lastName": row["last_name"],
        "dateOfBirth": row["date_of_birth"],
        "phoneNumber": row["phone_number"],
        "homeAddress": row["home_address"],
        "insuranceNumber": row["insurance_number"],
        "medicalRecordNumber": row["medical_record_number"],
        "appointmentDate": row["appointment_date"],
        "appointmentTime": row["appointment_time"],
        "timezone": row["timezone"],
    }


def log_call_attempt(
    patient_id: str,
    vapi_call_id: str,
    status: str,
    decision: str,
    user_speech: str,
):
    """Insert a new record into 'call_attempts' table without overwriting patient state."""
    conn = sqlite3.connect(DB_FILE)
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
    print("\n" + "=" * 60)
    print("CALL ATTEMPT LOGGED TO DATABASE ('call_attempts')")
    print("=" * 60)
    print(f"  Patient ID  : {patient_id}")
    print(f"  Call ID     : {vapi_call_id}")
    print(f"  Status      : {status}")
    print(f"  Decision    : {decision}")
    print(f"  User Spoke  : '{user_speech}'")
    print("=" * 60)


# ==========================================
# 2. VAPI CALL HANDLER CLASS
# ==========================================
class VapiCallHandler:

    def __init__(self, api_key: str, phone_number_id: str):
        self.api_key = api_key
        self.phone_number_id = phone_number_id
        self.base_url = "https://api.vapi.ai"
        self.headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        }

    def make_call(self, patient: Dict) -> Dict:
        """Make call using variables pulled dynamically from 'patients' table with auto-hangup."""

        spoken_date, spoken_time = format_spoken_date_time(
            patient["appointmentDate"], patient["appointmentTime"]
        )
        patient_name = patient["firstName"]

        spoken_message = (
            f"Hello {patient_name}, this is an automated reminder for your appointment on "
            f"{spoken_date} at {spoken_time}. Say 1 to confirm, or say 2 to reschedule."
        )

        payload = {
            "phoneNumberId": self.phone_number_id,
            "customer": {
                "number": patient["phoneNumber"],
                "name": f"{patient['firstName']} {patient['lastName']}",
            },
            "metadata": {"patient_id": patient["id"]},
            "assistant": {
                "name": "Appointment Reminder",
                "firstMessage": spoken_message,
                "endCallFunctionEnabled": True,  # Enables auto-hangup tool
                "model": {
                    "provider": "openai",
                    "model": "gpt-4o-mini",
                    "maxTokens": 100,
                    "messages": [
                        {
                            "role": "system",
                            "content": f"""You are an IVR system confirming an appointment for {patient_name}.

Listen to what {patient_name} says.

IF user says "one", "1", "confirm", or "yes":
Say: "Thank you {patient_name}, your appointment on {spoken_date} at {spoken_time} is confirmed. We look forward to seeing you."
Then immediately call the endCall function to terminate the phone call.

IF user says "two", "2", "reschedule", or "no":
Say: "Thank you {patient_name}. We have logged your request to reschedule your appointment and will send you a link."
Then immediately call the endCall function to terminate the phone call.

IF user says anything else:
Say: "I did not understand your response. Please say 1 to confirm your appointment on {spoken_date} or say 2 to reschedule."
Then immediately call the endCall function to terminate the phone call.

CRITICAL RULES:
- Only say your single-sentence response.
- Do not ask follow-up questions.
- Always call endCall immediately after speaking.""",
                        }
                    ],
                },
                "voice": {
                    "provider": "vapi",
                    "voiceId": "Elliot",
                    "version": "2",
                },
                "transcriber": {
                    "provider": "deepgram",
                    "model": "nova-3",
                    "language": "en",
                },
                "startSpeakingPlan": {"waitSeconds": 0.8},
                "stopSpeakingPlan": {
                    "numWords": 0,
                    "voiceSeconds": 0.3,
                    "backoffSeconds": 1.0,
                },
                "maxDurationSeconds": 45,  # Safety timeout fallback
            },
        }

        print(
            f"Making call to {patient_name} {patient['lastName']} ({patient['phoneNumber']})..."
        )
        print(f"Spoken Prompt: \"{spoken_message}\"")

        response = requests.post(
            f"{self.base_url}/call", headers=self.headers, json=payload
        )

        if response.status_code != 201:
            print(f"Error making call: {response.status_code}")
            print(response.text)
            raise Exception(f"Failed to make call: {response.text}")

        call_data = response.json()
        call_id = call_data.get("id")
        print(f"Call placed successfully. Call ID: {call_id}")

        return call_data

    def get_call_status(self, call_id: str) -> Optional[Dict]:
        try:
            response = requests.get(
                f"{self.base_url}/call/{call_id}",
                headers=self.headers,
                timeout=10,
            )

            if response.status_code != 200:
                print(f"Error getting call status: {response.status_code}")
                return None

            return response.json()
        except Exception as e:
            print(f"Exception getting call status: {e}")
            return None

    def wait_for_call_completion(
        self, call_id: str, max_wait_seconds: int = 120
    ) -> Optional[Dict]:
        start_time = time.time()
        poll_interval = 1

        print(
            f"Waiting for call to complete (max {max_wait_seconds} seconds)..."
        )

        while True:
            elapsed = time.time() - start_time

            if elapsed > max_wait_seconds:
                print(
                    f"Call did not complete within {max_wait_seconds} seconds."
                )
                return None

            call_data = self.get_call_status(call_id)

            if call_data is None:
                time.sleep(poll_interval)
                continue

            status = call_data.get("status")

            if status == "ended":
                print("Call completed.")
                return call_data

            time.sleep(poll_interval)

    def extract_response(self, call_data: Dict) -> Dict:
        user_utterances = []

        messages = call_data.get("messages", [])
        for msg in messages:
            role = str(msg.get("role", "")).lower()
            content = msg.get("content") or msg.get("message") or ""

            if role in ["user", "customer"] and content.strip():
                user_utterances.append(content.strip())

        artifact = call_data.get("artifact", {})
        if not user_utterances and isinstance(artifact, dict):
            full_transcript = artifact.get("transcript", "")
            if full_transcript:
                matches = re.findall(
                    r"(?:User|Customer):\s*(.*?)(?=(?:AI|Assistant|Bot|User|Customer):|$)",
                    full_transcript,
                    re.IGNORECASE | re.DOTALL,
                )
                for match in matches:
                    if match.strip():
                        user_utterances.append(match.strip())

        raw_user_speech = (
            " ".join(user_utterances).lower().strip() if user_utterances else ""
        )

        if re.search(r"\b(1|one|confirm|yes)\b", raw_user_speech):
            decision = "CONFIRMED"
        elif re.search(r"\b(2|two|reschedule|no)\b", raw_user_speech):
            decision = "RESCHEDULE"
        elif raw_user_speech == "":
            decision = "NO_INPUT"
        else:
            decision = "INVALID"

        return {
            "decision": decision,
            "raw_speech": raw_user_speech,
            "status": call_data.get("status", "ended"),
        }


# ==========================================
# 3. MAIN EXECUTION FLOW
# ==========================================

def main():
    # Safely retrieve keys without hardcoded fallbacks
    VAPI_API_KEY = st.secrets.get("VAPI_API_KEY") or os.getenv("VAPI_API_KEY", "")
    VAPI_PHONE_NUMBER_ID = st.secrets.get("VAPI_PHONE_NUMBER_ID") or os.getenv(
        "VAPI_PHONE_NUMBER_ID", ""
    )

    patient = get_patient_from_db("rec_001")
    if not patient:
        print("Error: Record rec_001 not found in patients table")
        return

    print("STARTING CALL AUTOMATION")
    print(
        f"Fetched Patient: {patient['firstName']} {patient['lastName']} | Date: {patient['appointmentDate']} {patient['appointmentTime']}"
    )

    handler = VapiCallHandler(VAPI_API_KEY, VAPI_PHONE_NUMBER_ID)

    try:
        call_response = handler.make_call(patient)
        call_id = call_response.get("id")

        if not call_id:
            print("Error: No call ID returned from API")
            return

        call_data = handler.wait_for_call_completion(
            call_id, max_wait_seconds=120
        )

        if call_data is None:
            print("Error: Call status timeout or failed retrieval")
            return

        result = handler.extract_response(call_data)

        log_call_attempt(
            patient_id=patient["id"],
            vapi_call_id=call_id,
            status=result["status"],
            decision=result["decision"],
            user_speech=result["raw_speech"],
        )

    except Exception as e:
        print(f"\nFatal Error: {e}")
        import traceback

        traceback.print_exc()


if __name__ == "__main__":
    main()