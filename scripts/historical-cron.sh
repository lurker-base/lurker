#!/bin/bash
# Cron job: Scan historical tokens every hour

cd /data/.openclaw/workspace/lurker-project

# Scan for historical tokens (last 3 days)
node src/historicalScanner.js >> /tmp/lurker_historical.log 2>&1

# Merge databases
node src/mergeDatabases.js >> /tmp/lurker_merge.log 2>&1

echo "[$(date)] Historical scan completed" >> /tmp/lurker_cron.log
