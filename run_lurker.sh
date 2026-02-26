#!/bin/bash
# LURKER Auto Runner - Lance tous les scripts de surveillance

LURKER_DIR="/data/.openclaw/workspace/lurker-project"
LOG_DIR="/data/.openclaw/logs"
PID_DIR="$LURKER_DIR/logs"

cd "$LURKER_DIR"

mkdir -p "$LOG_DIR" "$PID_DIR"

# Fonction pour lancer un script avec restart
run_loop() {
    local script="$1"
    local interval="$2"
    local name="$3"
    local logfile="$LOG_DIR/lurker_${name}.log"
    
    while true; do
        echo "$(date): Running $name" >> "$logfile"
        python3 "$script" >> "$logfile" 2>&1
        echo "$(date): Sleep ${interval}s" >> "$logfile"
        sleep "$interval"
    done
}

# Lancer tous les scripts en arrière-plan
echo "$(date): Starting LURKER services..."

# Feed Sentinel (toutes les 5 min)
run_loop "scripts/feed_sentinel.py" 300 "sentinel" &
echo $! > "$PID_DIR/sentinel.pid"

# Scanner CIO Ultra (toutes les 2 min)
run_loop "scripts/scanner_cio_ultra.py" 120 "scanner" &
echo $! > "$PID_DIR/scanner.pid"

# Scanner Hybrid (toutes les 3 min) — détecte les contrats frais et alerte
run_loop "scripts/scanner_hybrid.py" 180 "hybrid" &
echo $! > "$PID_DIR/hybrid.pid"

# Token Importer (toutes les 2 min) — importe CIO vers lurker_state.json
run_loop "scripts/token_importer.py" 120 "importer" &
echo $! > "$PID_DIR/importer.pid"

# Lifecycle Core (toutes les 5 min) — met à jour les catégories
run_loop "scripts/lifecycle_core.py" 300 "lifecycle" &
echo $! > "$PID_DIR/lifecycle.pid"

# Signal Distributor désactivé — utiliser bundle_alert.py via scanner_hybrid
# run_loop "scripts/signal_distributor.py" 900 "distributor" &
# echo $! > "$PID_DIR/distributor.pid"

echo "$(date): LURKER services started"
echo "  - Sentinel: 5min (PID: $(cat $PID_DIR/sentinel.pid))"
echo "  - Scanner: 10min (PID: $(cat $PID_DIR/scanner.pid))"
echo "  - Distributor: 15min (PID: $(cat $PID_DIR/distributor.pid))"

# Keep script running
wait
