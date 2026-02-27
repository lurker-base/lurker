#!/bin/bash
# LURKER Quick Restart - Redémarrage rapide des services

cd /data/.openclaw/workspace/lurker-project
mkdir -p logs

# Kill existing processes
pkill -f "feed_sentinel.py" 2>/dev/null
pkill -f "scanner_cio_ultra.py" 2>/dev/null
pkill -f "scanner_hybrid.py" 2>/dev/null
pkill -f "token_importer.py" 2>/dev/null
pkill -f "lifecycle_core.py" 2>/dev/null

sleep 2

echo "$(date): Démarrage LURKER..."

# Feed Sentinel - vérifie le feed toutes les 2 min
while true; do
    python3 scripts/feed_sentinel.py >> logs/feed_sentinel.log 2>&1
    sleep 120
done &
echo $! > logs/sentinel.pid

# Scanner CIO Ultra - scan rapide toutes les 3 min
while true; do
    python3 scripts/scanner_cio_ultra.py 2>/dev/null || python3 scripts/scanner_core.py >> logs/scanner.log 2>&1
    sleep 180
done &
echo $! > logs/scanner.pid

# Scanner Hybrid - détecte nouveaux tokens toutes les 5 min
if [ -f scripts/scanner_hybrid.py ]; then
    while true; do
        python3 scripts/scanner_hybrid.py >> logs/hybrid.log 2>&1
        sleep 300
    done &
    echo $! > logs/hybrid.pid
fi

# Token Importer - importe CIO vers lurker_state.json toutes les 2 min
if [ -f scripts/token_importer.py ]; then
    while true; do
        python3 scripts/token_importer.py >> logs/importer.log 2>&1
        sleep 120
    done &
    echo $! > logs/importer.pid
fi

# Lifecycle Core - met à jour les catégories toutes les 5 min
if [ -f scripts/lifecycle_core.py ]; then
    while true; do
        python3 scripts/lifecycle_core.py >> logs/lifecycle.log 2>&1
        sleep 300
    done &
    echo $! > logs/lifecycle.pid
fi

echo "$(date): Services LURKER démarrés"
echo "Vérification dans 5 secondes..."
