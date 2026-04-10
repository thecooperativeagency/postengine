#!/bin/bash
# GA4 Query Helper
# Usage: ./ga4-query.sh <account_email> <property_id> [start_date] [end_date]
# List accounts: ./ga4-query.sh <account_email> list-accounts
# List properties: ./ga4-query.sh <account_email> list-properties <account_id>

CLIENT_ID="3183077001-novu90sdpid6ttvtuh449ntiko8op4bb.apps.googleusercontent.com"
CLIENT_SECRET="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"

EMAIL="$1"
ACTION="$2"

# Get refresh token from keyring — try analytics-scoped token first, fall back to default
REFRESH_JSON=$(security find-generic-password -a "token:analytics:${EMAIL}" -s "gogcli" -w 2>/dev/null)
if [ -z "$REFRESH_JSON" ]; then
  REFRESH_JSON=$(security find-generic-password -a "token:default:${EMAIL}" -s "gogcli" -w 2>/dev/null)
fi
REFRESH_TOKEN=$(echo "$REFRESH_JSON" | python3 -c "import sys,json; print(json.load(sys.stdin)['refresh_token'])")

# Get access token
ACCESS_TOKEN=$(curl -s -X POST "https://oauth2.googleapis.com/token" \
  -d "client_id=${CLIENT_ID}" \
  -d "client_secret=${CLIENT_SECRET}" \
  -d "refresh_token=${REFRESH_TOKEN}" \
  -d "grant_type=refresh_token" | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")

if [ "$ACTION" = "list-accounts" ]; then
  curl -s -H "Authorization: Bearer $ACCESS_TOKEN" \
    "https://analyticsadmin.googleapis.com/v1beta/accounts"

elif [ "$ACTION" = "list-properties" ]; then
  ACCOUNT_ID="$3"
  curl -s -H "Authorization: Bearer $ACCESS_TOKEN" \
    "https://analyticsadmin.googleapis.com/v1beta/properties?filter=parent:accounts/${ACCOUNT_ID}"

elif [ "$ACTION" = "report" ]; then
  PROPERTY_ID="$3"
  START_DATE="${4:-30daysAgo}"
  END_DATE="${5:-today}"
  curl -s -X POST -H "Authorization: Bearer $ACCESS_TOKEN" \
    -H "Content-Type: application/json" \
    "https://analyticsdata.googleapis.com/v1beta/properties/${PROPERTY_ID}:runReport" \
    -d "{
      \"dateRanges\": [{\"startDate\": \"${START_DATE}\", \"endDate\": \"${END_DATE}\"}],
      \"metrics\": [{\"name\": \"sessions\"}, {\"name\": \"totalUsers\"}, {\"name\": \"newUsers\"}, {\"name\": \"screenPageViews\"}],
      \"dimensions\": [{\"name\": \"date\"}]
    }"
else
  echo "Usage:"
  echo "  List accounts:    ./ga4-query.sh <email> list-accounts"
  echo "  List properties:  ./ga4-query.sh <email> list-properties <account_id>"
  echo "  Run report:       ./ga4-query.sh <email> report <property_id> [start_date] [end_date]"
fi
