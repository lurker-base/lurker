#!/bin/bash
# Sync alerts from backend to website

SRC="/data/.openclaw/workspace/lurker-project/data/alerts.json"
DST="/data/.openclaw/workspace/lurker-project/docs/data/alerts.json"

while true; do
    if [ -f "$SRC" ]; then
        cp "$SRC" "$DST"
    fi
    sleep 10
done
