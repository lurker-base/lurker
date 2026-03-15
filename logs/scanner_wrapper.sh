#!/bin/bash
while true; do
    echo "[$(date)] Starting scanner" >> "logs/scanner.log"
    python3 "scripts/scanner_v2.py" >> "logs/scanner.log" 2>&1
    
    # Regenerate feeds after scan
    echo "[$(date)] Regenerating feeds..." >> "logs/scanner.log"
    node scripts/generateFeeds.js >> "logs/scanner.log" 2>&1
    
    # Send Telegram alert for new tokens
    python3 scripts/post_scan_alert.py
    
    echo "[$(date)] scanner exited with status , restarting in 300s" >> "logs/scanner.log"
    sleep 300
done
