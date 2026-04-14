# GA4 Monitoring Research

This research document outlines the Google Analytics 4 (GA4) Data API requirements for fetching daily session counts.

## 1. API Endpoint
The correct endpoint for generating reports is the `runReport` method of the Google Analytics Data API (v1beta).

- **URL:** `POST https://analyticsdata.googleapis.com/v1beta/properties/{property_id}:runReport`
- **Method:** `POST`

## 2. JSON Request Body
To fetch daily sessions for a specific date (e.g., yesterday), use the following structure.

```json
{
  "dimensions": [
    {
      "name": "date"
    }
  ],
  "metrics": [
    {
      "name": "sessions"
    }
  ],
  "dateRanges": [
    {
      "startDate": "yesterday",
      "endDate": "yesterday"
    }
  ],
  "keepEmptyRows": true
}
```

- **Dimension:** `date` (format: YYYYMMDD).
- **Metric:** `sessions`.
- **Date Range:** `yesterday` is a supported keyword. You can also use specific dates like `2026-04-11`.
- **keepEmptyRows:** Set to `true` to ensure you get a row even if sessions are zero.

## 3. Authentication
For a server-side cron script, a **Service Account JSON key** is the industry standard and best practice.

- **Why Service Account?** It doesn't require manual user interaction (no login screen) after the initial setup. OAuth is better for user-facing apps where individuals log in.
- **Setup:**
    1. Create a Service Account in the [Google Cloud Console](https://console.cloud.google.com/).
    2. Download the JSON key file.
    3. **Crucial:** Add the Service Account's email address (e.g., `account-name@project-id.iam.gserviceaccount.com`) as a user with "Viewer" permissions in the **GA4 Admin > Property Access Management** for each property.

## 4. Handling Multiple Properties
The GA4 Data API does **not** support querying multiple Property IDs in a single `runReport` call. You must:
1. Iterate through your list of Property IDs.
2. Send a separate POST request for each ID.
3. (Optional) Use `batchRunReports` to bundle up to 20 requests into one HTTP call, but the responses are still distinct.

**Our Properties:**
- Brian Harris BMW: `334199347`
- Audi Baton Rouge: `381984706`
- BMW of Jackson: `255835161`

## 5. Rate Limits & Quotas (Standard Properties)
GA4 enforces property-level quotas.
- **Core Tokens Per Day:** 25,000 (usually enough for a few monitoring calls).
- **Core Tokens Per Hour:** 5,000.
- **Concurrent Requests:** 10 per property.
- **Server Errors:** Max 10 per project per property per hour.

**Pro-tip:** Including `"returnPropertyQuota": true` in your JSON request will return the remaining quota in the response.

## 6. Minimal Working Example (Python)

```python
import os
from google.analytics.data_v1beta import BetaAnalyticsDataClient
from google.analytics.data_v1beta.types import (
    DateRange,
    Dimension,
    Metric,
    RunReportRequest,
)

# Set the path to your service account JSON key
os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = "path/to/your/key.json"

def get_sessions(property_id):
    client = BetaAnalyticsDataClient()
    
    request = RunReportRequest(
        property=f"properties/{property_id}",
        dimensions=[Dimension(name="date")],
        metrics=[Metric(name="sessions")],
        date_ranges=[DateRange(start_date="yesterday", end_date="yesterday")],
    )
    
    response = client.run_report(request)
    
    for row in response.rows:
        print(f"Date: {row.dimension_values[0].value}, Sessions: {row.metric_values[0].value}")

# Properties to monitor
properties = ["334199347", "381984706", "255835161"]

for pid in properties:
    print(f"Fetching for {pid}...")
    get_sessions(pid)
```
