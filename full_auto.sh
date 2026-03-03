#!/bin/bash
# LURKER Full Auto - Système complet autonome 24/7
# Ce script doit tourner en permanence et relance tout automatiquement

cd /data/.openclaw/workspace/lurker-project
mkdir -p logs

echo "[$(date)] Démarrage système LURKER FULL AUTO..."

# Fonction pour lancer un service avec restart auto
# Utilise exec pour que le PID soit celui du processus Python
launch_service() {
    local script="$1"
    local interval="$2"
    local name="$3"
    local logfile="logs/${name}.log"
    
    # Créer un wrapper script
    cat > "logs/${name}_wrapper.sh" << EOF
#!/bin/bash
while true; do
    echo "[\$(date)] Starting $name" >> "$logfile"
    python3 "$script" >> "$logfile" 2>&1
    echo "[\$(date)] $name exited, restarting in ${interval}s" >> "$logfile"
    sleep "$interval"
done
EOF
    chmod +x "logs/${name}_wrapper.sh"
    
    # Lancer le wrapper
    nohup "logs/${name}_wrapper.sh" > /dev/null 2>&1 &
    local wrapper_pid=$!
    echo $wrapper_pid > "logs/${name}.pid"
    
    # Attendre que le Python démarre et capturer son PID
    sleep 2
    local py_pid=$(pgrep -f "$script" | head -1)
    if [ -n "$py_pid" ]; then
        echo $py_pid > "logs/${name}_py.pid"
        echo "  ✅ $name lancé (Wrapper PID: $wrapper_pid, Python PID: $py_pid)"
    else
        echo "  ⚠️  $name lancé (Wrapper PID: $wrapper_pid, Python PID: en attente)"
    fi
}

# Arrêter les anciens processus (sauf nous-même)
echo "Arrêt des processus existants..."
MY_PID=$$
pgrep -f "lifecycle_core.py" | grep -v "$MY_PID" | xargs -r kill 2>/dev/null
pgrep -f "token_importer.py" | grep -v "$MY_PID" | xargs -r kill 2>/dev/null
pgrep -f "cleanup_tokens.py" | grep -v "$MY_PID" | xargs -r kill 2>/dev/null
pgrep -f "scanner_cio_ultra.py" | grep -v "$MY_PID" | xargs -r kill 2>/dev/null
pgrep -f "auto_push.sh" | grep -v "$MY_PID" | xargs -r kill 2>/dev/null
# Ne pas tuer full_auto.sh avec grep pour éviter de se tuer soi-même
ps aux | grep "full_auto.sh" | grep -v grep | grep -v "$MY_PID" | awk '{print $2}' | xargs -r kill 2>/dev/null
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
launch_service "scripts/scanner_v2.py" 300 "scanner"

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

# Sauvegarder le PID du script principal
echo $$ > logs/full_auto.pid

echo ""
echo "[$(date)] Système LURKER FULL AUTO démarré"
echo "Services actifs:"
echo "  - Token Importer (toutes les 2 min)"
echo "  - Lifecycle Core (toutes les 3 min)"
echo "  - Cleanup (toutes les 10 min)"
echo "  - Scanner CIO (toutes les 15 min)"
echo "  - Auto Push GitHub (toutes les 15 min)"
echo ""
echo "PIDs sauvegardés dans: logs/*.pid"
echo "Logs disponibles dans: logs/"
echo ""
echo "Pour arrêter: pkill -f full_auto.sh && pkill -f lurker_wrapper"
