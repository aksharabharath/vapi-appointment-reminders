import os
import sqlite3
import sys
from datetime import datetime
import pytz
from dateutil import parser as time_parser
from vapi_call_automation import (
    DB_PATH,
    get_scheduled_call_time,
    is_daily_schedule_enabled,
    process_batch_calls,
)

PST_TZ = pytz.timezone("America/Los_Angeles")


def run_headless_daily_batch():
    print("==================================================")
    print("🤖 STARTING AUTOMATED DAILY BATCH CALL PROCESSOR")
    print("==================================================")

    # 1. Check if Daily Schedule is ENABLED in UI
    if not is_daily_schedule_enabled():
        print("⏸️ Daily schedule is currently DISABLED in UI settings. Exiting.")
        sys.exit(0)

    # 2. Flexible Time Evaluation
    scheduled_time_str = get_scheduled_call_time()  # Custom typed string from UI
    now_pst = datetime.now(PST_TZ)
    current_time_str = now_pst.strftime("%I:%M %p")

    print(f"⏰ UI Typed Scheduled Time: '{scheduled_time_str}'")
    print(f"🕒 Current System Time (PST): {current_time_str}")

    is_manual_trigger = os.getenv("GITHUB_EVENT_NAME") == "workflow_dispatch"

    if not is_manual_trigger:
        try:
            # Flexible parse of user-entered string to extracting hour & minute
            target_time = time_parser.parse(scheduled_time_str).time()

            # Compare current hour & minute against target
            target_minutes = target_time.hour * 60 + target_time.minute
            current_minutes = now_pst.hour * 60 + now_pst.minute

            time_diff = abs(target_minutes - current_minutes)

            # Execution window of 10 minutes
            if time_diff > 10:
                print(
                    f"⏳ Current time ({current_time_str}) does not match UI target ('{scheduled_time_str}'). Skipping execution."
                )
                sys.exit(0)

        except Exception as e:
            print(f"⚠️ Warning: Could not parse typed time string '{scheduled_time_str}': {e}. Executing batch as fallback.")

    api_key = os.getenv("VAPI_API_KEY")
    phone_number_id = os.getenv("VAPI_PHONE_NUMBER_ID")

    if not api_key or not phone_number_id:
        print("❌ ERROR: Missing VAPI_API_KEY or VAPI_PHONE_NUMBER_ID.")
        sys.exit(1)

    # 3. Execute Batch Calls
    print("🚀 Time match confirmed! Executing batch calls...")
    try:
        summary = process_batch_calls(
            api_key=api_key,
            phone_number_id=phone_number_id,
            progress_callback=lambda c, t, m: print(f"[{c}/{t}] {m}"),
        )
        print("--------------------------------------------------")
        print("🎉 BATCH COMPLETE!")
        print(f"Total: {summary['total']} | Successful: {summary['successful']} | Failed: {summary['failed']}")
        print("--------------------------------------------------")

        conn = sqlite3.connect(DB_PATH)
        conn.execute("PRAGMA wal_checkpoint(FULL);")
        conn.close()

    except Exception as e:
        print(f"❌ FATAL ERROR during batch execution: {e}")
        sys.exit(1)


if __name__ == "__main__":
    run_headless_daily_batch()