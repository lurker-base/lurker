#!/bin/bash
while true; do
    echo "[$(date)] Starting lifecycle" >> "logs/lifecycle.log"
    python3 "scripts/lifecycle_core.py" >> "logs/lifecycle.log" 2>&1
    # If python3 exited, log and sleep before next attempt
    status=0
    echo "[$(date)] lifecycle exited with status , restarting in 180s" >> "logs/lifecycle.log"
    sleep "180"
done
