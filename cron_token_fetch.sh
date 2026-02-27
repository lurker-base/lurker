#!/bin/bash
# LURKER CRON - Rafraîchissement automatique des tokens
# À ajouter au crontab: */10 * * * * /data/.openclaw/workspace/lurker-project/cron_token_fetch.sh

cd /data/.openclaw/workspace/lurker-project

# Fetch new tokens
python3 scripts/token_fetcher.py >> logs/cron_fetcher.log 2>&1

# Commit si nouveaux tokens
if [ -n "$(git status --porcelain tokens/base.json)" ]; then
    git add tokens/base.json
    git commit -m "auto: refresh tokens $(date +%H:%M)" 
    git push origin main
fi

# Redémarrer le signal generator pour prendre en compte les nouveaux tokens
pkill -f auto_signal_generator
sleep 2
nohup python3 scripts/auto_signal_generator.py >> logs/auto_signals.log 2>&1 &
