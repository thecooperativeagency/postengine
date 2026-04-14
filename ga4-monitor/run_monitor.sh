#!/bin/bash

# GA4 Monitor Shell Wrapper
# Designed for cron execution

# Get the directory of this script
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
ENV_FILE="$DIR/.env"

# Load environment variables if .env exists
if [ -f "$ENV_FILE" ]; then
    export $(grep -v '^#' "$ENV_FILE" | xargs)
fi

# Check if Python script exists
PYTHON_SCRIPT="$DIR/ga4_monitor.py"

if [ ! -f "$PYTHON_SCRIPT" ]; then
    echo "ERROR: Python script not found at $PYTHON_SCRIPT"
    exit 2
fi

# Run the monitoring script
# Note: Ensure google-analytics-data is installed in your python environment
python3 "$PYTHON_SCRIPT"
