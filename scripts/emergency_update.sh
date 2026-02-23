#!/bin/bash
# LURKER Emergency Manual Update
# Use this when feed is stale and auto-fix doesn't work

echo "🚨 LURKER EMERGENCY MANUAL UPDATE"
echo "=================================="
echo ""

cd /data/.openclaw/workspace/lurker-project

echo "[1/4] Running scanner..."
python3 scripts/scanner_cio_ultra.py

echo ""
echo "[2/4] Checking results..."
python3 scripts/feed_sentinel.py

echo ""
echo "[3/4] Committing changes..."
git add signals/cio_feed.json state/token_registry.json 2>/dev/null
git diff --cached --quiet || git commit -m "fix: emergency manual update $(date +%H:%M)"

echo ""
echo "[4/4] Pushing to GitHub..."
git push origin main

echo ""
echo "✅ Emergency update complete!"
echo ""
echo "Verify at: https://lurker-base.github.io/lurker/live.html"
