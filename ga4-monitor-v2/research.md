# GA4 Monitor V2 Research: API Query Format

## 1. Correct API Endpoint
The Google Analytics 4 (GA4) Data API (v1beta) uses the following endpoint for running reports:
`POST https://analyticsdata.googleapis.com/v1beta/properties/{propertyId}:runReport`

- **propertyId**: The numeric unique identifier for the GA4 property.

---

## 2. JSON Request Body Structure
To query "sessions" (metric) for a specific "date" (dimension) filtered to "yesterday", use this structure:

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
  ]
}
```

---

## 3. Authentication: Service Account vs. OAuth
For a **cron script** (server-to-server), a **Service Account JSON key** is significantly better.

| Method | Why it's better for Cron |
| :--- | :--- |
| **Service Account** | Does not require human interaction for login. Uses a persistent JSON key file. Ideal for automated, background tasks. |
| **OAuth 2.0** | Requires an initial "consent" flow in a browser and handling refresh tokens. Better for user-facing apps. |

**Setup Recommendation:**
1. Create a Service Account in the Google Cloud Console.
2. Download the JSON key file.
3. Add the Service Account's email address to the GA4 Property (Admin > Property Settings > Property Access Management) with "Viewer" or "Analyst" permissions.

---

## 4. Specifying Multiple Property IDs
The `runReport` method acts on a **single property at a time** via the URL path. To monitor multiple properties, you must iterate through the property IDs and send separate requests.

**Properties to monitor:**
- Brian Harris BMW: `334199347`
- Audi Baton Rouge: `381984706`
- BMW of Jackson: `255835161`

---

## 5. Rate Limits and Quotas (Core Quotas)
GA4 Property-level quotas are measured in **tokens**.

- **Tokens per Day:** 25,000 to 250,000 (Standard vs. 360).
- **Tokens per Hour:** 5,000 to 50,000.
- **Concurrent Requests:** 10 (Standard) to 50 (360).
- **Server Errors per Property per Hour:** 10.

For a simple daily cron job fetching session counts for 3 properties, you will use a negligible amount of tokens (roughly 10-30 tokens per day).

---

## 6. Minimal Working Python Example
Requires `google-analytics-data` library: `pip install google-analytics-data`

```python
import os
from google.analytics.data_v1beta import BetaAnalyticsDataClient
from google.analytics.data_v1beta.types import (
    DateRange,
    Dimension,
    Metric,
    RunReportRequest,
)

# Set path to your service account JSON key
os.environ['GOOGLE_APPLICATION_CREDENTIALS'] = 'path/to/service-account-key.json'

def get_yesterday_sessions(property_id):
    client = BetaAnalyticsDataClient()

    request = RunReportRequest(
        property=f"properties/{property_id}",
        dimensions=[Dimension(name="date")],
        metrics=[Metric(name="sessions")],
        date_ranges=[DateRange(start_date="yesterday", end_date="yesterday")],
    )

    response = client.run_report(request)

    print(f"Report for Property: {property_id}")
    for row in response.rows:
        print(f"Date: {row.dimension_values[0].value}, Sessions: {row.metric_values[0].value}")

# Properties to monitor
property_ids = ['334199347', '381984706', '255835161']

for pid in property_ids:
    get_yesterday_sessions(pid)
```
