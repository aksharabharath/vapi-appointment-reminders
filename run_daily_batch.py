import sys
import os
import sqlite3
import subprocess
from vapi_call_automation import (
    process_batch_calls,
    is_daily_schedule_enabled,
    DB_PATH
)

def run_headless_daily_batch():
    print("==================================================")
    print("🤖 STARTING AUTOMATED DAILY BATCH CALL PROCESSOR")
    print("==================================================")

    # 1. Check if Daily Schedule is ENABLED in DB settings
    if not is_daily_schedule_enabled():
        print("⏸️ Daily automated schedule is currently DISABLED in UI settings. Exiting.")
        sys.exit(0)

    # 2. Extract Credentials from Environment (Set by GitHub Actions or .env)
    api_key = os.getenv("VAPI_API_KEY")
    phone_number_id = os.getenv("VAPI_PHONE_NUMBER_ID")

    if not api_key or not phone_number_id:
        print("❌ ERROR: Missing VAPI_API_KEY or VAPI_PHONE_NUMBER_ID in environment variables.")
        sys.exit(1)

    print("✅ Schedule is ACTIVE. Fetching credentials and initiating batch...")

    # Progress logger for headless execution
    def console_progress(current: int, total: int, message: str):
        print(f"[{current}/{total}] {message}")

    # 3. Execute Batch Calls
    try:
        summary = process_batch_calls(
            api_key=api_key,
            phone_number_id=phone_number_id,
            progress_callback=console_progress
        )
        print("--------------------------------------------------")
        print(f"🎉 BATCH COMPLETE!")
        print(f"Total: {summary['total']} | Successful: {summary['successful']} | Failed: {summary['failed']}")
        print("--------------------------------------------------")

        # Force SQLite WAL Checkpoint to flush all memory buffers to disk
        conn = sqlite3.connect(DB_PATH)
        conn.execute("PRAGMA wal_checkpoint(FULL);")
        conn.close()
        print("💾 SQLite write buffers checkpointed to patients.db disk file.")

    except Exception as e:
        print(f"❌ FATAL ERROR during batch execution: {e}")
        sys.exit(1)

if __name__ == "__main__":
    run_headless_daily_batch()