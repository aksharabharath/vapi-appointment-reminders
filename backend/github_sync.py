import base64
import os
import requests
import streamlit as st


def push_file_to_github(
    file_path="scheduled_time.txt", commit_message="Update target call time"
):
    """Programmatically commits and pushes a file to GitHub repository via REST API."""
    token = os.getenv("GITHUB_PAT") or st.secrets.get("GITHUB_PAT")
    repo = os.getenv("GITHUB_REPO") or st.secrets.get(
        "GITHUB_REPO", "aksharabharath/vapi-appointment-reminders"
    )

    if not token:
        st.error(
            "GITHUB_PAT is missing from environment/secrets. Cannot push to GitHub."
        )
        return False

    url = f"https://api.github.com/repos/{repo}/contents/{file_path}"
    headers = {
        "Authorization": f"token {token}",
        "Accept": "application/vnd.github.v3+json",
    }

    # 1. Get the current file SHA (required by GitHub API to update an existing file)
    get_resp = requests.get(url, headers=headers)
    sha = get_resp.json().get("sha") if get_resp.status_code == 200 else None

    # 2. Read the local file content and encode to base64
    if not os.path.exists(file_path):
        st.error(f"File {file_path} does not exist locally.")
        return False

    with open(file_path, "r") as f:
        content = f.read()

    encoded_content = base64.b64encode(content.encode("utf-8")).decode("utf-8")

    # 3. Commit & Push to GitHub
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
        st.error(f"GitHub API Error: {put_resp.json()}")
        return False