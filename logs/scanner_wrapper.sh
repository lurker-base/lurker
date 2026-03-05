#!/bin/bash
while true; do
    echo "[$(date)] Starting scanner" >> "logs/scanner.log"
    python3 "scripts/scanner_v2.py" >> "logs/scanner.log" 2>&1
    echo "[$(date)] scanner exited, restarting in 300s" >> "logs/scanner.log"
    sleep "300"
done
