import os
import sys
import logging
from datetime import datetime
from google.analytics.data_v1beta import BetaAnalyticsDataClient
from google.analytics.data_v1beta.types import (
    DateRange,
    Dimension,
    Metric,
    RunReportRequest,
)

# Configuration
PROPERTIES = {
    "Brian Harris BMW": "334199347",
    "Audi Baton Rouge": "381984706",
    "BMW of Jackson": "255835161"
}
THRESHOLD = 100
LOG_FILE = "/Users/lucfaucheux/.openclaw/workspace/ga4-monitor-v2/monitor.log"

# Setup Logging
logging.basicConfig(
    filename=LOG_FILE,
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)

def get_sessions(client, property_id):
    """Queries GA4 for yesterday's sessions."""
    try:
        request = RunReportRequest(
            property=f"properties/{property_id}",
            dimensions=[Dimension(name="date")],
            metrics=[Metric(name="sessions")],
            date_ranges=[DateRange(start_date="yesterday", end_date="yesterday")],
        )
        response = client.run_report(request)
        
        # If no rows returned, sessions = 0
        if not response.rows:
            return 0
        
        # Sum sessions (usually just one row for one day)
        total_sessions = sum(int(row.metric_values[0].value) for row in response.rows)
        return total_sessions
    except Exception as e:
        logging.error(f"Error querying property {property_id}: {str(e)}")
        raise

def main():
    # Set credentials from env var
    key_path = os.getenv('GA4_SERVICE_ACCOUNT_KEY')
    if not key_path:
        print("❌ Error: GA4_SERVICE_ACCOUNT_KEY environment variable not set.")
        sys.exit(1)
    
    os.environ['GOOGLE_APPLICATION_CREDENTIALS'] = key_path
    
    client = BetaAnalyticsDataClient()
    any_alerts = False
    
    print(f"GA4 Session Monitor - {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("-" * 50)
    
    for name, pid in PROPERTIES.items():
        try:
            sessions = get_sessions(client, pid)
            if sessions >= THRESHOLD:
                status = f"✅ OK: {sessions} sessions"
                logging.info(f"{name} ({pid}): OK - {sessions} sessions")
            else:
                status = f"⚠️ ALERT: {sessions} sessions (Threshold: {THRESHOLD})"
                logging.warning(f"{name} ({pid}): ALERT - {sessions} sessions")
                any_alerts = True
            
            print(f"{name:<20} | {status}")
        except Exception as e:
            print(f"{name:<20} | ❌ ERROR: See log")
            any_alerts = True

    if any_alerts:
        sys.exit(1)
    else:
        sys.exit(0)

if __name__ == "__main__":
    main()
