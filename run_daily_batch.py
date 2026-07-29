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

    # 2. Check Operator Scheduled Time against Current PST Time
    scheduled_time_str = get_scheduled_call_time()  # e.g., "09:50 AM"
    now_pst = datetime.now(PST_TZ)
    current_time_str = now_pst.strftime("%I:%M %p")  # e.g., "09:50 AM"

    print(
        f"⏰ Operator Scheduled Time: {scheduled_time_str} | Current Time: {current_time_str} PST"
    )

    api_key = os.getenv("VAPI_API_KEY")
    phone_number_id = os.getenv("VAPI_PHONE_NUMBER_ID")

    if not api_key or not phone_number_id:
        print(
            "❌ ERROR: Missing VAPI_API_KEY or VAPI_PHONE_NUMBER_ID in environment variables."
        )
        sys.exit(1)

    # 3. Execute Batch Calls
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