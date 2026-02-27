#!/bin/bash
# LURKER Auto Push - Pousse les tokens et signaux sur GitHub toutes les heures

cd /data/.openclaw/workspace/lurker-project

# Vérifier s'il y a des changements
if [ -n "$(git status --porcelain)" ]; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] Changes detected, pushing..."
    
    # Config git
    git config user.email "bot@lurker.ai"
    git config user.name "LURKER Bot"
    
    # Add all changes
    git add tokens/base.json data/signals/*.json docs/data/signals/*.json signals/
    
    # Commit
    git commit -m "auto: hourly update $(date +%H:%M) [$(date +%d/%m)]"
    
    # Push avec gestion de conflits
    git pull origin main --rebase --strategy-option=theirs
    git push origin main
    
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] Push completed"
else
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] No changes to push"
fi
