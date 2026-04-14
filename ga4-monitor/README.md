# GA4 Session Monitor

Automated daily monitoring for Google Analytics 4 session counts.

## Overview

This tool queries the GA4 Data API for yesterday's session counts for key properties and alerts if they fall below a specific threshold (default: 100 sessions).

### Monitored Properties:
- Brian Harris BMW (334199347)
- Audi Baton Rouge (381984706)
- BMW of Jackson (255835161)

## Files

- `ga4_monitor.py`: The core Python script that performs the API queries and logic.
- `run_monitor.sh`: A shell wrapper to load environment variables and run the script.
- `monitor.log`: Log file containing historical run data.
- `.env`: (User-created) Contains the path to your Google Service Account key.

## Setup Instructions

### 1. Install Dependencies
Ensure you have the Google Analytics Data library installed:
```bash
pip install google-analytics-data
```

### 2. Google Cloud Setup
1. Create a **Service Account** in the [Google Cloud Console](https://console.cloud.google.com/).
2. Download the **JSON Key file**.
3. Enable the **Google Analytics Data API** for your project.

### 3. GA4 Access Setup
For **each** monitored property, you must add the Service Account email (e.g., `monitor@project-id.iam.gserviceaccount.com`) as a user with **Viewer** permissions in **GA4 Admin > Property Access Management**.

### 4. Configuration
Create a `.env` file in this directory with the path to your JSON key:
```bash
GA4_SERVICE_ACCOUNT_KEY="/path/to/your/service-account-key.json"
```

### 5. Crontab Setup
To run the monitor daily at 8:00 AM, add the following to your crontab (`crontab -e`):
```bash
0 8 * * * /Users/lucfaucheux/.openclaw/workspace/ga4-monitor/run_monitor.sh >> /Users/lucfaucheux/.openclaw/workspace/ga4-monitor/cron.log 2>&1
```

## Monitoring Logic
- **Exit Code 0**: All properties met the threshold.
- **Exit Code 1**: One or more properties fell below the threshold or an error occurred.
- **Logs**: Every run is logged to `monitor.log` with timestamps and session counts.
