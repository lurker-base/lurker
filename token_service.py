#!/usr/bin/env python3
"""
LURKER Token Service - Tourne en permanence pour fetcher les tokens
"""

import os
import sys
import json
import time
import subprocess
from pathlib import Path
from datetime import datetime

ROOT = Path("/data/.openclaw/workspace/lurker-project")
FETCH_INTERVAL = 600  # 10 minutes

def log(msg):
    ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    print(f"[{ts}] {msg}")
    sys.stdout.flush()

def run_fetcher():
    """Lance le token fetcher"""
    try:
        result = subprocess.run(
            ["python3", "scripts/token_fetcher.py"],
            cwd=ROOT,
            capture_output=True,
            text=True,
            timeout=120
        )
        log("Token fetcher exécuté")
        
        # Vérifier si nouveaux tokens
        new_tokens_found = "Added" in result.stdout and "Added 0 new" not in result.stdout
        
        if new_tokens_found or True:  # Toujours essayer de push
            for line in result.stdout.split('\n'):
                if 'New token:' in line or 'Added' in line:
                    log(line.strip())
            
            # Push sur GitHub
            log("Push sur GitHub...")
            try:
                subprocess.run(
                    ["bash", "auto_push.sh"],
                    cwd=ROOT,
                    timeout=60
                )
            except Exception as e:
                log(f"Erreur push: {e}")
            
            # Redémarrer auto_signal_generator
            log("Redémarrage auto_signal_generator...")
            subprocess.run(["pkill", "-f", "auto_signal_generator"], cwd=ROOT)
            time.sleep(2)
            subprocess.Popen(
                ["nohup", "python3", "scripts/auto_signal_generator.py"],
                cwd=ROOT,
                stdout=open(ROOT / "logs/auto_signals.log", "a"),
                stderr=subprocess.STDOUT
            )
        
        return True
    except Exception as e:
        log(f"Erreur: {e}")
        return False

def main():
    log("="*60)
    log("LURKER TOKEN SERVICE - Démarrage")
    log(f"Interval: {FETCH_INTERVAL}s")
    log("="*60)
    
    while True:
        run_fetcher()
        log(f"Prochain fetch dans {FETCH_INTERVAL}s...")
        time.sleep(FETCH_INTERVAL)

if __name__ == "__main__":
    main()
