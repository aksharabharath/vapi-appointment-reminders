import base64
import os
import requests
import streamlit as st


def push_file_to_github(
    file_content: str,
    file_path="scheduled_time.txt",
    commit_message="Update target call time",
):
    """Programmatically updates a file directly on GitHub via REST API."""
    try:
        token = os.getenv("GITHUB_PAT") or st.secrets.get("GITHUB_PAT")
        repo = os.getenv("GITHUB_REPO") or st.secrets.get(
            "GITHUB_REPO", "aksharabharath/vapi-appointment-reminders"
        )

        if not token:
            st.error(
                "❌ GITHUB_PAT is missing from Streamlit Secrets. Please add it to Secrets!"
            )
            return False

        url = f"https://api.github.com/repos/{repo}/contents/{file_path}"
        headers = {
            "Authorization": f"Bearer {token}",
            "Accept": "application/vnd.github.v3+json",
        }

        # 1. Fetch current file SHA if it exists on GitHub
        get_resp = requests.get(url, headers=headers, timeout=10)
        sha = get_resp.json().get("sha") if get_resp.status_code == 200 else None

        # 2. Base64 encode the string directly
        encoded_content = base64.b64encode(
            file_content.strip().encode("utf-8")
        ).decode("utf-8")

        # 3. Payload
        payload = {
            "message": commit_message,
            "content": encoded_content,
            "branch": "main",
        }
        if sha:
            payload["sha"] = sha

        put_resp = requests.put(url, headers=headers, json=payload, timeout=10)

        if put_resp.status_code in [200, 201]:
            return True
        else:
            st.error(
                f"❌ GitHub REST Error ({put_resp.status_code}): {put_resp.json().get('message')}"
            )
            return False

    except Exception as e:
        st.error(f"❌ Exception pushing to GitHub: {str(e)}")
        return False