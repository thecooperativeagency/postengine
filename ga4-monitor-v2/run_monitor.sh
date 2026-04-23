#!/bin/bash

# Get the directory where the script is located
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Load environment variables from .env file
if [ -f "$DIR/.env" ]; then
    export $(grep -v '^#' "$DIR/.env" | xargs)
else
    echo "Error: .env file not found in $DIR"
    exit 1
fi

# Run the python script
python3 "$DIR/ga4_monitor.py"
