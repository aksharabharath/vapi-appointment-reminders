import os
import sqlite3
import sys
from datetime import datetime
import pytz
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
        print(
            "⏸️ Daily automated schedule is currently DISABLED in UI settings. Exiting."
        )
        sys.exit(0)

    # 2. Compare Current Time against UI Dropdown Setting
    scheduled_time_str = get_scheduled_call_time()  # e.g., "09:50 AM"
    now_pst = datetime.now(PST_TZ)
    current_time_str = now_pst.strftime("%I:%M %p")  # e.g., "09:50 AM"

    print(f"⏰ UI Scheduled Time: {scheduled_time_str}")
    print(f"🕒 Current PST Time:   {current_time_str}")

    # Parse hour and minute to allow a 10-minute execution window
    try:
        sched_dt = datetime.strptime(scheduled_time_str, "%I:%M %p")
        # Check if current time is within 10 minutes of scheduled time
        time_diff_seconds = abs((now_pst.time().hour * 3600 + now_pst.time().minute * 60) - 
                                (sched_dt.hour * 3600 + sched_dt.minute * 60))
        
        # If execution is triggered manually via GitHub Actions UI, bypass time check
        is_manual_trigger = os.getenv("GITHUB_EVENT_NAME") == "workflow_dispatch"

        if time_diff_seconds > 600 and not is_manual_trigger:
            print(f"⏳ Current time ({current_time_str}) does not match UI target ({scheduled_time_str}). Skipping execution.")
            sys.exit(0)
    except Exception as e:
        print(f"Warning: Could not parse time window, proceeding with call attempt: {e}")

    api_key = os.getenv("VAPI_API_KEY")
    phone_number_id = os.getenv("VAPI_PHONE_NUMBER_ID")

    if not api_key or not phone_number_id:
        print("❌ ERROR: Missing VAPI_API_KEY or VAPI_PHONE_NUMBER_ID.")
        sys.exit(1)

    # 3. Execute Batch Calls
    print("🚀 Time matches UI setting! Initiating batch call process...")
    try:
        summary = process_batch_calls(
            api_key=api_key,
            phone_number_id=phone_number_id,
            progress_callback=lambda c, t, m: print(f"[{c}/{t}] {m}"),
        )
        print("--------------------------------------------------")
        print("🎉 BATCH COMPLETE!")
        print(
            f"Total: {summary['total']} | Successful: {summary['successful']} | Failed: {summary['failed']}"
        )
        print("--------------------------------------------------")

        conn = sqlite3.connect(DB_PATH)
        conn.execute("PRAGMA wal_checkpoint(FULL);")
        conn.close()

    except Exception as e:
        print(f"❌ FATAL ERROR during batch execution: {e}")
        sys.exit(1)


if __name__ == "__main__":
    run_headless_daily_batch()