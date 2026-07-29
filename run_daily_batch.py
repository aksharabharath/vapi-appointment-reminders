import os
import sys
from vapi_call_automation import get_pst_now_str, process_batch_calls


def run_cron_job():
    print(
        f"⏰ [{get_pst_now_str()}] Starting automated 8:00 AM PST daily call batch run..."
    )

    api_key = os.getenv("VAPI_API_KEY", "")
    phone_id = os.getenv("VAPI_PHONE_NUMBER_ID", "")

    if not api_key or not phone_id:
        print("❌ Error: Missing VAPI_API_KEY or VAPI_PHONE_NUMBER_ID env vars.")
        sys.exit(1)

    summary = process_batch_calls(
        api_key=api_key,
        phone_number_id=phone_id,
        progress_callback=lambda idx, total, msg: print(
            f"[{idx}/{total}] {msg}"
        ),
    )

    print(
        f"✅ [{get_pst_now_str()}] Batch run completed! Processed: {summary['processed']}, Successful: {summary['successful']}, Failed: {summary['failed']}"
    )


if __name__ == "__main__":
    run_cron_job()