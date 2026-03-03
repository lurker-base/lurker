#!/bin/bash
while true; do
    echo "[$(date)] Starting importer" >> "logs/importer.log"
    python3 "scripts/token_importer.py" >> "logs/importer.log" 2>&1
    echo "[$(date)] importer exited, restarting in 120s" >> "logs/importer.log"
    sleep "120"
done
