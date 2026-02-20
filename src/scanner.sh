#!/bin/bash
# LURKER Live Scanner - Shell version
# Runs every 10 seconds, fetches from Clanker, enriches with DexScreener

DIR="/data/.openclaw/workspace/lurker-project"
OUTPUT="$DIR/data/allClankerSignals.json"
SEEN="$DIR/data/.seen_tokens"

# Init seen file
if [ ! -f "$SEEN" ]; then
    echo "" > "$SEEN"
fi

echo "[LIVE] Starting LURKER scanner..."

while true; do
    # Fetch from Clanker
    RESPONSE=$(curl -s -H "User-Agent: Mozilla/5.0" "https://clanker.world/api/tokens?limit=30" 2>/dev/null)
    
    if [ -n "$RESPONSE" ]; then
        # Parse with node
        node -e "
            const fs = require('fs');
            const data = $RESPONSE;
            const tokens = data.data || [];
            
            const OUTPUT = '$OUTPUT';
            const SEEN = '$SEEN';
            
            let seen = new Set();
            try { seen = new Set(fs.readFileSync(SEEN, 'utf8').split('\\n').filter(Boolean)); } catch(e) {}
            
            let existing = [];
            try { existing = JSON.parse(fs.readFileSync(OUTPUT, 'utf8')); } catch(e) {}
            
            let newTokens = [];
            
            for (const t of tokens) {
                const addr = (t.contract_address || '').toLowerCase();
                if (!addr || seen.has(addr)) continue;
                
                const ageMin = (Date.now() - new Date(t.deployed_at)) / 60000;
                if (ageMin > 120) continue;
                
                seen.add(addr);
                
                newTokens.push({
                    symbol: t.symbol,
                    name: t.name,
                    contract_address: t.contract_address,
                    address: t.contract_address,
                    detectedAt: Date.now(),
                    ageMinutes: Math.floor(ageMin),
                    source: ageMin < 15 ? 'live' : 'recent',
                    status: 'FRESH',
                    liquidityUsd: 0,
                    marketCap: 0,
                    volume24h: 0,
                    url: 'https://dexscreener.com/base/' + t.contract_address
                });
                
                console.log('👁️  ' + t.symbol + ' | ' + Math.floor(ageMin) + 'min old');
            }
            
            if (newTokens.length > 0) {
                const all = [...newTokens, ...existing].slice(0, 200);
                fs.writeFileSync(OUTPUT, JSON.stringify(all, null, 2));
                fs.writeFileSync(SEEN, Array.from(seen).join('\\n'));
                console.log('[LIVE] Saved ' + newTokens.length + ' new tokens');
            }
        " 2>&1 | tee -a "$DIR/logs/scanner.log"
    fi
    
    sleep 10
done
