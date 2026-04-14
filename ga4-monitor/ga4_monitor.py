import os
import sys
import datetime
import logging
from google.analytics.data_v1beta import BetaAnalyticsDataClient
from google.analytics.data_v1beta.types import (
    DateRange,
    Dimension,
    Metric,
    RunReportRequest,
)

# Configuration
PROPERTIES = {
    "334199347": "Brian Harris BMW",
    "381984706": "Audi Baton Rouge",
    "255835161": "BMW of Jackson",
}
ALERT_THRESHOLD = 100
LOG_FILE = "/Users/lucfaucheux/.openclaw/workspace/ga4-monitor/monitor.log"

# Setup logging
logging.basicConfig(
    filename=LOG_FILE,
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)

def get_yesterday_sessions(client, property_id):
    """Queries GA4 for yesterday's sessions."""
    try:
        request = RunReportRequest(
            property=f"properties/{property_id}",
            dimensions=[Dimension(name="date")],
            metrics=[Metric(name="sessions")],
            date_ranges=[DateRange(start_date="yesterday", end_date="yesterday")],
            keep_empty_rows=True
        )
        
        response = client.run_report(request)
        
        # If no rows returned but keep_empty_rows=True, it usually means 0 sessions
        if not response.rows:
            return 0
            
        # Get the first (and only) row
        sessions = int(response.rows[0].metric_values[0].value)
        return sessions
    except Exception as e:
        logging.error(f"Error fetching data for property {property_id}: {e}")
        print(f"ERROR: Failed to fetch data for {PROPERTIES.get(property_id, property_id)}: {e}")
        return None

def main():
    # Check for credentials
    key_path = os.environ.get("GA4_SERVICE_ACCOUNT_KEY")
    if not key_path:
        print("ERROR: GA4_SERVICE_ACCOUNT_KEY environment variable not set.")
        sys.exit(2)
    
    if not os.path.exists(key_path):
        print(f"ERROR: Service account key file not found at: {key_path}")
        sys.exit(2)

    # Set the standard Google env var for the client library
    os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = key_path

    try:
        client = BetaAnalyticsDataClient()
    except Exception as e:
        print(f"ERROR: Failed to initialize GA4 client: {e}")
        sys.exit(2)

    any_alerts = False
    print(f"--- GA4 Session Monitor - {datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')} ---")
    
    for pid, name in PROPERTIES.items():
        sessions = get_yesterday_sessions(client, pid)
        
        if sessions is None:
            # Error already logged and printed
            any_alerts = True
            continue

        status = "OK"
        if sessions < ALERT_THRESHOLD:
            status = "ALERT"
            any_alerts = True
            print(f"⚠️  {name}: {sessions} sessions (Threshold: {ALERT_THRESHOLD})")
        else:
            print(f"✅ {name}: {sessions} sessions")

        # Write to log file
        log_msg = f"Property: {name} ({pid}) | Sessions: {sessions} | Status: {status}"
        logging.info(log_msg)

    if any_alerts:
        print("\nResult: Alerts triggered or errors occurred.")
        sys.exit(1)
    else:
        print("\nResult: All properties healthy.")
        sys.exit(0)

if __name__ == "__main__":
    main()
