#!/bin/bash
DAYS="${1:-7}"
CAL_NAME="La Familia"
osascript -e "
tell application \"Calendar\"
  set startDate to current date
  set time of startDate to 0
  set endDate to startDate + ($DAYS * days)
  set cal to calendar \"$CAL_NAME\"
  set evts to (every event of cal whose start date ≥ startDate and start date < endDate)
  set output to \"\"
  repeat with e in evts
    set output to output & summary of e & \" | \" & (start date of e as string) & \" - \" & (end date of e as string) & linefeed
  end repeat
  return output
end tell
"
