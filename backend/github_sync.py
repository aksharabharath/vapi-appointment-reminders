import base64
import os
import requests
import streamlit as st


def push_file_to_github(
    file_path="scheduled_time.txt", commit_message="Update target call time"
):
    """Programmatically updates a file in GitHub repository via REST API with complete error catching."""
    try:
        token = os.getenv("GITHUB_PAT") or st.secrets.get("GITHUB_PAT")
        repo = os.getenv("GITHUB_REPO") or st.secrets.get(
            "GITHUB_REPO", "aksharabharath/vapi-appointment-reminders"
        )

        if not token:
            st.error(
                "❌ `GITHUB_PAT` missing. Add it to Streamlit App Settings -> Secrets."
            )
            return False

        url = f"https://api.github.com/repos/{repo}/contents/{file_path}"
        headers = {
            "Authorization": f"Bearer {token}",
            "Accept": "application/vnd.github.v3+json",
        }

        # 1. Fetch current file SHA if it exists
        get_resp = requests.get(url, headers=headers, timeout=10)

        sha = None
        if get_resp.status_code == 200:
            sha = get_resp.json().get("sha")
        elif get_resp.status_code == 401:
            st.error("❌ GitHub Authentication Failed: Invalid `GITHUB_PAT`.")
            return False
        elif get_resp.status_code == 404:
            st.info(
                f"ℹ️ File `{file_path}` not found on GitHub. Creating it now..."
            )

        # 2. Read local content
        if not os.path.exists(file_path):
            st.error(f"❌ Local file `{file_path}` does not exist.")
            return False

        with open(file_path, "r") as f:
            content = f.read()

        encoded_content = base64.b64encode(content.encode("utf-8")).decode(
            "utf-8"
        )

        # 3. PUT payload
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
                f"❌ GitHub API Error ({put_resp.status_code}): {put_resp.json().get('message')}"
            )
            return False

    except Exception as e:
        st.error(f"❌ Sync Exception: {str(e)}")
        return False