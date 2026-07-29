# 📞 AI Appointment Assistant — Voice AI Workflow Automation

An AI-powered appointment reminder system that uses conversational voice agents to automate patient confirmation calls.

This project explores how AI can be integrated into a larger software system by combining **voice AI, APIs, databases, automation, and user-facing applications**.

Built with **Streamlit**, **Vapi AI**, **OpenAI GPT-4o-mini**, and **SQLite**, this application can automatically place appointment reminder calls, understand user responses, classify outcomes, and track call history through a dashboard interface.

The goal of this project was to explore how an AI model can become a component inside a larger workflow that solves a real-world problem.

---

# Features

## AI Voice Calling System

The core of the application is an AI voice agent that manages appointment confirmation workflows.

The system combines:

- **Vapi AI** for outbound voice calls and call management
- **OpenAI GPT-4o-mini** for conversation reasoning and intent classification
- **Speech recognition and text-to-speech pipeline** for natural voice interactions

---

## Key Voice Features & Call Outcomes

### Automated Outbound Calling

The system can automatically initiate appointment reminder calls to patients using Vapi's voice API.

The AI assistant communicates with patients, collects their responses, and determines the appropriate next action.

---

### Automated Voicemail Detection

The system uses Vapi's Answering Machine Detection (AMD) to identify voicemail responses.

When a voicemail is detected, the assistant automatically delivers a concise appointment reminder message instead of attempting an interactive conversation.

This prevents the system from incorrectly treating answering machines as live conversations.

---

### Natural Speech Formatting

To improve the user experience, raw database values are converted into natural spoken language before being passed to the voice agent.

Example:

```
2026-08-05
```

is converted into:

```
Wednesday, August 5th
```

allowing appointment information to sound more natural during voice interactions.

---

### Intent Classification

The AI assistant analyzes conversations and classifies each call into one of the following outcomes:

| Outcome | Description | Queue Behavior |
|---|---|---|
| CONFIRMED | Patient confirmed attendance | Removed from retry queue |
| RESCHEDULE | Patient requested appointment changes | Removed from retry queue |
| VOICEMAIL | Automated voicemail reminder delivered | Remains queued for retry |
| WRONG_NUMBER | Non-patient answered or invalid contact | Remains queued |
| NO_INPUT / TIMEOUT | Call unanswered or no usable response | Remains queued |
| INVALID_DATA | Record failed validation before calling | Skipped and logged |

The system only updates:

```
called_yet = 1
```

when a successful live interaction results in either:

- CONFIRMED
- RESCHEDULE

This ensures unanswered calls, voicemail outcomes, and failed interactions remain available for future retry attempts.

---

# Conversation Handling & Guardrails

Real conversations are unpredictable, so the system includes handling for several edge cases.

## Wrong Number Handling

The assistant detects cases where:

- The wrong person answers
- The patient is unavailable
- The phone number is incorrect

The outcome is recorded in the call history.

---

## Identity Verification

If the user asks:

> "Who is this?"

The assistant explains the purpose of the call before continuing.

---

## Ambiguous Responses

The system handles unclear responses such as:

- "Maybe"
- "I'm not sure"
- "I don't know"

by requesting clarification instead of incorrectly classifying the response.

---

## Out-of-Scope Questions

The assistant is designed to remain focused on the appointment workflow.

For example:

User:

> "What's the weather today?"

The assistant redirects back to appointment confirmation instead of answering unrelated questions.

---

# Patient Data Validation

Before initiating calls, the system validates patient information to prevent failed workflows and unnecessary API usage.

Validation includes:

- Phone number formatting checks
- Missing patient information detection
- Appointment date validation
- Preventing incomplete records from entering the calling queue

Invalid records are skipped and logged in the database.

Example:

```
SKIPPED_INVALID_DATA
```

---

# Automated Scheduling System

The application supports automated daily appointment reminder execution.

Features:

- Daily scheduled batch execution at **8:00 AM PST**
- GitHub Actions workflow automation
- Dashboard toggle to enable or disable scheduled calling
- Persistent scheduling settings stored in SQLite

Workflow:

```
Scheduled Trigger
        |
        v
Retrieve Pending Patients
        |
        v
Validate Patient Information
        |
        v
Initiate Voice Calls
        |
        v
Store Call Outcomes
```

---

# Streamlit Dashboard

The project includes a Streamlit dashboard for monitoring and managing the calling workflow.

Dashboard capabilities:

- View pending appointment calls
- Monitor completed call attempts
- Track confirmation status
- View call outcomes
- Display real-time updates during batch execution
- Enable or disable automated scheduling

---

# System Architecture

```
                Patient Database
                       |
                       v
             Pre-Call Validation Layer
                       |
          +------------+------------+
          |                         |
       Valid                     Invalid
          |                         |
          v                         v
    Vapi Voice Agent          Log Validation Error
          |
          v
   Speech Recognition
          |
          v
     GPT-4o-mini
          |
          v
 Intent Classification
          |
   +------+------+---------+
   |             |         |
Confirm     Reschedule   Other
   |             |         |
   +-------------+---------+
                 |
                 v
          Call Outcome Database
```

---

# Call Workflow

1. The system retrieves pending patient appointments from SQLite.

2. Patient records are validated before calling.

3. Vapi initiates an outbound voice call.

4. The AI assistant communicates with the patient.

5. User speech is converted into text.

6. GPT-4o-mini analyzes the conversation and determines the user's intent.

7. The final outcome is stored in the database.

8. Confirmed or rescheduled appointments are removed from the retry queue.

9. Failed, unanswered, or voicemail calls remain available for future attempts.

---

# Repository Structure

```
├── .github/
│   └── workflows/
│       └── daily_calls.yml        # Automated daily scheduler
│
├── app.py                         # Streamlit dashboard
│
├── vapi_call_automation.py        # Core calling workflow, validation, AI prompts
│
├── run_daily_batch.py             # Automated batch execution script
│
├── patients.db                    # SQLite database
│
├── requirements.txt               # Python dependencies
│
└── README.md                      # Documentation
```

---

# Database Design

The application uses SQLite for storing patient information, call history, and application settings.

## patients

Stores appointment information.

| Column | Description |
|---|---|
| patient_id | Unique patient identifier |
| first_name | Patient first name |
| last_name | Patient last name |
| phone_number | Contact phone number |
| appointment_date | Scheduled appointment date |
| appointment_time | Scheduled appointment time |
| timezone | Patient timezone |
| called_yet | Tracks whether appointment was successfully confirmed |

---

## call_attempts

Stores every call attempt and outcome.

| Column | Description |
|---|---|
| call_attempt_id | Unique call record |
| patient_id | Associated patient |
| vapi_call_id | Vapi call identifier |
| status | Call execution status |
| decision | Final call classification |
| user_speech | Extracted user response or error message |
| created_at | Call timestamp |

**Note:** All timestamps in `call_attempts` are standardized using the US/Pacific timezone:

```
America/Los_Angeles
```

---

## settings

Stores application configuration.

| Column | Description |
|---|---|
| key | Setting name |
| value | Setting value |

Example:

```
daily_schedule_enabled = 1
```

---

# Setup

## Requirements

- Python 3.10+
- Vapi AI account
- Vapi phone number
- OpenAI API access

---

## Installation

Clone the repository:

```bash
git clone https://github.com/aksharabharath/vapi-appointment-reminders.git

cd vapi-appointment-reminders
```

Install dependencies:

```bash
pip install -r requirements.txt
```

Create environment variables:

```bash
VAPI_API_KEY="your_api_key"

VAPI_PHONE_NUMBER_ID="your_phone_number_id"
```

---

# Running the Application

Launch the Streamlit dashboard:

```bash
streamlit run app.py
```

Run the automated calling workflow manually:

```bash
python run_daily_batch.py
```

---

# Deployment

The application uses:

- **Streamlit Cloud** for dashboard deployment
- **GitHub Actions** for automated daily execution

Sensitive credentials such as API keys are stored using environment variables rather than being hardcoded into the application.

---

# 🧠ngineering Challenges & Lessons Learned

## Building AI Systems Beyond Models

A major focus of this project was understanding how AI models become useful when integrated into larger applications.

Instead of only focusing on the AI model itself, this project explored:

- API integration
- Workflow automation
- Database design
- User interaction
- Reliability and error handling

---

## Designing Reliable Conversations

Voice applications introduce unpredictable user behavior.

This project explored:

- Creating conversation guardrails
- Handling ambiguous responses
- Managing unexpected user inputs
- Designing reliable AI workflows

---

## Managing Application State

The system required tracking:

- Pending calls
- Completed calls
- Retry conditions
- Conversation outcomes

This introduced challenges around database design and maintaining consistent workflow state.

---

# Future Improvements

Potential future improvements include:

## Product Features

- Patient management interface
- Advanced analytics dashboard
- Human handoff support
- SMS fallback reminders
- Multi-language voice support

## Engineering Improvements

- More automated AI evaluation tests
- Improved monitoring and logging
- Larger-scale database architecture
- More flexible scheduling rules

---

# Project Goal

This project was built around one central question:

**How can AI become a component inside a larger system that solves real problems for users?**

Through this project, I explored the engineering side of AI — not only building AI functionality, but designing the surrounding software systems that make AI useful.
