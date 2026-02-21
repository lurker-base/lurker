#!/bin/bash
# LURKER V2.1 Enricher Cron - Génère signaux ALPHA premium

LOG_FILE="/var/log/lurker-v21.log"
LOCK_FILE="/tmp/lurker-v21.lock"
CONTAINER_NAME="openclaw-7zzb-openclaw-1"

# Anti-overlap (skip si < 5 min)
if [ -f "$LOCK_FILE" ]; then
    LAST_RUN=$(stat -c %Y "$LOCK_FILE" 2>/dev/null || echo 0)
    NOW=$(date +%s)
    DIFF=$((NOW - LAST_RUN))
    if [ $DIFF -lt 300 ]; then
        echo "[$(date)] SKIP: Last run ${DIFF}s ago (< 300s)" >> "$LOG_FILE"
        exit 0
    fi
fi

# Check conteneur actif
if ! docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
    echo "[$(date)] ERROR: Container ${CONTAINER_NAME} not running" >> "$LOG_FILE"
    exit 1
fi

# Exécution
echo "[$(date)] Starting V2.1 enrich..." >> "$LOG_FILE"

docker exec "$CONTAINER_NAME" /bin/bash -c "
    cd /data/.openclaw/workspace/lurker-project && \
    node src/enrichSignalsV2_1.js 2>&1
" >> "$LOG_FILE" 2>&1

EXIT_CODE=$?

if [ $EXIT_CODE -eq 0 ]; then
    # Copier vers docs/data/
    docker exec "$CONTAINER_NAME" /bin/bash -c "
        cp /data/.openclaw/workspace/lurker-project/data/pulseSignals.v2.alpha.json /data/.openclaw/workspace/lurker-project/docs/data/ && \
        cp /data/.openclaw/workspace/lurker-project/data/pulseSignals.v2.public.json /data/.openclaw/workspace/lurker-project/docs/data/
    " >> "$LOG_FILE" 2>&1
    
    # Commit si changements (pas bloquant)
    docker exec "$CONTAINER_NAME" /bin/bash -c "
        cd /data/.openclaw/workspace/lurker-project && \
        git add docs/data/pulseSignals.v2.*.json data/pulseSignals.v2.*.json 2>/dev/null && \
        git diff --cached --quiet || git commit -m 'Auto: V2.1 signals update' && git push
    " >> "$LOG_FILE" 2>&1
    
    echo "[$(date)] SUCCESS: V2.1 enriched and synced" >> "$LOG_FILE"
else
    echo "[$(date)] ERROR: Exit code $EXIT_CODE" >> "$LOG_FILE"
fi

# Mise à jour lock
touch "$LOCK_FILE"

exit $EXIT_CODE
