#!/bin/bash
while true; do
    echo "[$(date)] Starting scanner" >> "logs/scanner.log"
    python3 "scripts/scanner_cio_ultra.py" >> "logs/scanner.log" 2>&1
    status=$?
    echo "[$(date)] scanner exited with status $status, restarting in 300s" >> "logs/scanner.log"
    sleep 300
done
