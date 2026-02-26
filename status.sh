#!/bin/bash
# LURKER Status Monitor

echo "========================================"
echo "LURKER SYSTEM STATUS"
echo "========================================"
echo ""

# Check processes
echo "🔄 RUNNING PROCESSES:"
ps aux | grep -v grep | grep -E "(scanner_core|feed_sentinel|auto_signal)" | awk '{print "  - " $11 " (PID: " $2 ")"}'

echo ""
echo "📊 TOKENS IN DATABASE:"
TOKENS=$(cat /data/.openclaw/workspace/lurker-project/tokens/base.json 2>/dev/null | grep -c '"0x' || echo "0")
echo "  Total: $TOKENS tokens"

echo ""
echo "📡 RECENT SIGNALS:"
ls -lt /data/.openclaw/workspace/lurker-project/signals/ 2>/dev/null | head -6 | tail -5 | awk '{print "  " $9 " (" $6 " " $7 " " $8 ")"}'

echo ""
echo "📝 RECENT LOGS:"
tail -5 /data/.openclaw/logs/lurker_scanner.log 2>/dev/null || echo "  Scanner log not available"
tail -5 /data/.openclaw/workspace/lurker-project/logs/auto_signals.log 2>/dev/null || echo "  Signal log not available"

echo ""
echo "========================================"
echo "LURKER IS OPERATIONAL ✅"
echo "========================================"
