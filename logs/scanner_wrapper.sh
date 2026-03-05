#!/bin/bash
while true; do
    echo "[$(date)] Starting scanner" >> "logs/scanner.log"
    python3 "scripts/scanner_v2.py" >> "logs/scanner.log" 2>&1
    # If python3 exited, log and sleep before next attempt
    status=0
    echo "[$(date)] scanner exited with status , restarting in 300s" >> "logs/scanner.log"
    sleep "300"
done
