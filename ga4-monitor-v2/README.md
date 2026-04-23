# GA4 Session Monitor

Daily monitoring script to ensure GA4 properties are receiving traffic. Checks yesterday's session counts against a threshold (default: 100 sessions).

## Setup Instructions

### 1. Install Dependencies
Requires the Google Analytics Data API client library:
```bash
pip install google-analytics-data
```

### 2. Service Account Setup
1. Create a Service Account in the [Google Cloud Console](https://console.cloud.google.com/).
2. Download the JSON key file.
3. In Google Analytics (Admin > Property Settings > Property Access Management), add the Service Account's email address with **Viewer** or **Analyst** permissions to all monitored properties:
   - Brian Harris BMW (334199347)
   - Audi Baton Rouge (381984706)
   - BMW of Jackson (255835161)

### 3. Configuration
Create a `.env` file in the same directory as the script:
```bash
GA4_SERVICE_ACCOUNT_KEY="/path/to/your/service-account-key.json"
```

### 4. Usage
Run manually to test:
```bash
./run_monitor.sh
```

### 5. Automated Monitoring (Crontab)
To run every morning at 8:00 AM, add this to your crontab (`crontab -e`):
```bash
0 8 * * * /Users/lucfaucheux/.openclaw/workspace/ga4-monitor-v2/run_monitor.sh >> /Users/lucfaucheux/.openclaw/workspace/ga4-monitor-v2/monitor.log 2>&1
```

## Files
- `ga4_monitor.py`: The core Python monitoring script.
- `run_monitor.sh`: Shell wrapper that loads environment variables.
- `monitor.log`: Log file containing timestamped status and alerts.
