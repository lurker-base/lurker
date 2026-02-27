#!/bin/bash
# LURKER Hourly Push Service
# Lance ce script via: while true; do ./hourly_push.sh; sleep 3600; done

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Hourly push check..."

# Push les tokens et signaux
cd /data/.openclaw/workspace/lurker-project

# Config git si pas déjà fait
git config user.email "bot@lurker.ai" 2>/dev/null
git config user.name "LURKER Bot" 2>/dev/null

# Check for changes
if [ -n "$(git status --porcelain)" ]; then
    echo "  Changes detected, committing..."
    
    # Add files
    git add tokens/base.json data/signals/*.json docs/data/signals/*.json signals/ 2>/dev/null
    
    # Commit
    git commit -m "auto: hourly sync $(date +%H:%M) [$(date +%d/%m/%Y)]" 2>/dev/null
    
    # Push (with pull first to avoid conflicts)
    git pull origin main --rebase --strategy-option=theirs 2>/dev/null
    git push origin main 2>/dev/null
    
    echo "  ✅ Push completed"
else
    echo "  No changes"
fi
