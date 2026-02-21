#!/bin/bash
# LURKER Enrich v2.1 — Atomic write + logs PROD
# À exécuter sur l'hôte (pas dans le conteneur)

set -euo pipefail

SCRIPT_DIR="/data/.openclaw/workspace/lurker-project"
LOG_FILE="/var/log/lurker-enrich.log"
LOCK_FILE="/tmp/lurker-enrich.lock"

# Lock pour éviter exécutions concurrentes
exec 200>"$LOCK_FILE"
if ! flock -n 200; then
  echo "[$(date -Iseconds)] SKIP: Déjà en cours" >> "$LOG_FILE"
  exit 0
fi

# Vérifier conteneur up
if ! docker ps | grep -q openclaw-7zzb-openclaw-1; then
  echo "[$(date -Iseconds)] ERREUR: Conteneur MASTER down" >> "$LOG_FILE"
  exit 1
fi

# Exécuter enrichment
echo "[$(date -Iseconds)] Démarrage enrichment" >> "$LOG_FILE"

docker exec openclaw-7zzb-openclaw-1 bash -c "
  cd $SCRIPT_DIR
  node src/enrichSignals.js
" >> "$LOG_FILE" 2>&1

EXIT_CODE=$?

if [ $EXIT_CODE -ne 0 ]; then
  echo "[$(date -Iseconds)] ERREUR: Exit code $EXIT_CODE" >> "$LOG_FILE"
  exit 1
fi

# Sync vers docs (atomic)
docker exec openclaw-7zzb-openclaw-1 bash -c "
  cd $SCRIPT_DIR
  # Écriture atomique (tmp puis mv)
  cp data/pulseSignals.json docs/data/pulseSignals.json.tmp
  mv docs/data/pulseSignals.json.tmp docs/data/pulseSignals.json
  
  # Vérifier JSON valide
  node -e 'JSON.parse(require(\"fs\").readFileSync(\"docs/data/pulseSignals.json\"))' 2>/dev/null || {
    echo 'ERREUR: JSON invalide après enrichment'
    exit 1
  }
" >> "$LOG_FILE" 2>&1

echo "[$(date -Iseconds)] ✅ Succès" >> "$LOG_FILE"
exit 0
