#!/bin/bash
cd /data/.openclaw/workspace/lurker-project
curl -s -H "User-Agent: Mozilla/5.0" "https://clanker.world/api/tokens?limit=30" | node -e "
const fs = require('fs');
const data = JSON.parse(require('fs').readFileSync(0, 'utf8'));
const tokens = data.data || [];
const OUTPUT = './data/allClankerSignals.json';

let existing = [];
try { existing = JSON.parse(fs.readFileSync(OUTPUT, 'utf8')); } catch(e) {}

let seen = new Set(existing.map(t => (t.contract_address || t.address || '').toLowerCase()));
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
        liquidityUsd: 0, marketCap: 0, volume24h: 0,
        url: 'https://dexscreener.com/base/' + t.contract_address
    });
    console.log('[FETCH] ' + t.symbol + ' | ' + Math.floor(ageMin) + 'min');
}

if (newTokens.length > 0) {
    const all = [...newTokens, ...existing].slice(0, 200);
    fs.writeFileSync(OUTPUT, JSON.stringify(all, null, 2));
    console.log('[FETCH] +' + newTokens.length + ' tokens');
}
"
