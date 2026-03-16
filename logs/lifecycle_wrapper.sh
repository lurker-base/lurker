#!/bin/bash
while true; do
    echo "[$(date)] Starting lifecycle" >> "logs/lifecycle.log"
    python3 "scripts/lifecycle_core.py" >> "logs/lifecycle.log" 2>&1
    status=$?
    echo "[$(date)] lifecycle exited with status $status, restarting in 180s" >> "logs/lifecycle.log"
    sleep 180
done
