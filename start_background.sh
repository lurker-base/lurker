#!/bin/bash
# LURKER Background Services - Lance tous les services en arrière-plan avec nohup

cd /data/.openclaw/workspace/lurker-project
mkdir -p logs

echo "[$(date)] Démarrage services LURKER..."

# Tuer les anciens processus
pkill -f "token_importer.py" 2>/dev/null
pkill -f "lifecycle_core.py" 2>/dev/null  
pkill -f "cleanup_tokens.py" 2>/dev/null
sleep 1

# Lancer Token Importer en arrière-plan
nohup bash -c 'while true; do
    echo "[$(date)] Running importer" >> logs/importer_loop.log
    python3 scripts/token_importer.py >> logs/importer.log 2>&1
    sleep 120
done' > /dev/null 2>&1 &
echo $! > logs/importer.pid
echo "✅ Importer lancé (PID: $!)"

# Lancer Lifecycle Core en arrière-plan  
nohup bash -c 'while true; do
    echo "[$(date)] Running lifecycle" >> logs/lifecycle_loop.log
    python3 scripts/lifecycle_core.py >> logs/lifecycle.log 2>&1
    sleep 180
done' > /dev/null 2>&1 &
echo $! > logs/lifecycle.pid
echo "✅ Lifecycle lancé (PID: $!)"

# Lancer Cleanup en arrière-plan
nohup bash -c 'while true; do
    echo "[$(date)] Running cleanup" >> logs/cleanup_loop.log
    python3 scripts/cleanup_tokens.py >> logs/cleanup.log 2>&1
    sleep 600
done' > /dev/null 2>&1 &
echo $! > logs/cleanup.pid
echo "✅ Cleanup lancé (PID: $!)"

# Lancer Auto Push en arrière-plan
nohup bash -c 'while true; do
    echo "[$(date)] Running auto_push" >> logs/auto_push_loop.log
    bash auto_push.sh >> logs/auto_push.log 2>&1
    sleep 900
done' > /dev/null 2>&1 &
echo $! > logs/auto_push.pid
echo "✅ Auto Push lancé (PID: $!)"

echo ""
echo "[$(date)] Tous les services sont lancés en arrière-plan"
echo "Pour vérifier: ps aux | grep -E 'importer|lifecycle|cleanup'"
