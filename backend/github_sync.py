import base64
import os
import requests
import streamlit as st

def push_file_to_github(file_path="scheduled_time.txt", commit_message="Update target call time"):
    """Programmatically commits/updates a file in GitHub repository via REST API."""
    token = os.getenv("GITHUB_PAT") or st.secrets.get("GITHUB_PAT")
    repo = os.getenv("GITHUB_REPO") or st.secrets.get("GITHUB_REPO", "aksharabharath/vapi-appointment-reminders")

    if not token:
        st.error("⚠️ GITHUB_PAT is missing from Streamlit Secrets. Add it to Secrets!")
        return False

    url = f"https://api.github.com/repos/{repo}/contents/{file_path}"
    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github.v3+json",
    }

    # 1. Check if the file exists on GitHub to get its SHA
    get_resp = requests.get(url, headers=headers)
    sha = get_resp.json().get("sha") if get_resp.status_code == 200 else None

    # 2. Read local file content
    if not os.path.exists(file_path):
        st.error(f"File '{file_path}' not found locally.")
        return False

    with open(file_path, "r") as f:
        content = f.read()

    encoded_content = base64.b64encode(content.encode("utf-8")).decode("utf-8")

    # 3. Payload handles both Creation (no sha) and Update (with sha)
    payload = {
        "message": commit_message,
        "content": encoded_content,
        "branch": "main",
    }
    if sha:
        payload["sha"] = sha

    put_resp = requests.put(url, headers=headers, json=payload)

    if put_resp.status_code in [200, 201]:
        return True
    else:
        st.error(f"GitHub REST API Error ({put_resp.status_code}): {put_resp.json()}")
        return False