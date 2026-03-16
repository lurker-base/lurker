#!/bin/bash
while true; do
    echo "[$(date)] Starting cleanup" >> "logs/cleanup.log"
    python3 "scripts/cleanup_tokens.py" >> "logs/cleanup.log" 2>&1
    status=$?
    echo "[$(date)] cleanup exited with status $status, restarting in 600s" >> "logs/cleanup.log"
    sleep 600
done
