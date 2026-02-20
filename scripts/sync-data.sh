#!/bin/bash
# Sync data from backend to website (continuous)

cd /data/.openclaw/workspace/lurker-project

while true; do
    # Sync alerts
    if [ -f "data/alerts.json" ]; then
        cp "data/alerts.json" "docs/data/alerts.json"
    fi
    
    # Sync all signals (live + historical)
    if [ -f "data/allClankerSignals.json" ]; then
        cp "data/allClankerSignals.json" "docs/data/allSignals.json"
    fi
    
    # Sync historical
    if [ -f "data/clankerHistorical.json" ]; then
        cp "data/clankerHistorical.json" "docs/data/historical.json"
    fi
    
    sleep 10
done
