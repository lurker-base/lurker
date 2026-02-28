#!/bin/bash
# LURKER Full Auto - Système complet autonome 24/7
# Ce script doit tourner en permanence et relance tout automatiquement

cd /data/.openclaw/workspace/lurker-project
mkdir -p logs

echo "[$(date)] Démarrage système LURKER FULL AUTO..."

# Fonction pour lancer un service avec restart auto
launch_service() {
    local script="$1"
    local interval="$2"
    local name="$3"
    local logfile="logs/${name}.log"
    
    (
        while true; do
            echo "[$(date)] Starting $name" >> "$logfile"
            python3 "$script" >> "$logfile" 2>&1
            echo "[$(date)] $name exited, restarting in ${interval}s" >> "$logfile"
            sleep "$interval"
        done
    ) &
    echo $! > "logs/${name}.pid"
    echo "  ✅ $name lancé (PID: $!)"
}

# Arrêter les anciens processus
echo "Arrêt des processus existants..."
pkill -f "lifecycle_core.py" 2>/dev/null
pkill -f "token_importer.py" 2>/dev/null
pkill -f "cleanup_tokens.py" 2>/dev/null
pkill -f "auto_push.sh" 2>/dev/null
sleep 2

# Lancer les services
echo "Lancement des services..."

# 1. Token Importer - importe CIO vers lurker_state toutes les 2 min
launch_service "scripts/token_importer.py" 120 "importer"

# 2. Lifecycle Core - met à jour les catégories toutes les 3 min
launch_service "scripts/lifecycle_core.py" 180 "lifecycle"

# 3. Cleanup - nettoie les vieux tokens toutes les 10 min
launch_service "scripts/cleanup_tokens.py" 600 "cleanup"

# 4. Scanner CIO Ultra - scanne les nouveaux tokens toutes les 15 min
launch_service "scripts/scanner_cio_ultra.py" 900 "scanner"

# 5. Auto Push - pousse sur GitHub toutes les 15 min
(
    while true; do
        echo "[$(date)] Auto push check..." >> logs/auto_push.log
        bash auto_push.sh >> logs/auto_push.log 2>&1
        sleep 900
    done
) &
echo $! > logs/auto_push.pid
echo "  ✅ auto_push lancé (PID: $!)"

echo ""
echo "[$(date)] Système LURKER FULL AUTO démarré"
echo "Services actifs:"
echo "  - Token Importer (toutes les 2 min)"
echo "  - Lifecycle Core (toutes les 3 min)"
echo "  - Cleanup (toutes les 10 min)"
echo "  - Scanner CIO (toutes les 15 min)"
echo "  - Auto Push GitHub (toutes les 15 min)"
echo ""
echo "Le système tourne en arrière-plan et se relance automatiquement."
echo "Logs disponibles dans: logs/"
