const axios = require('axios');
const fs = require('fs');
const path = require('path');

/**
 * LURKER Clanker Live Scanner
 * Detects Clanker tokens the second they launch
 */

const API = 'https://clanker.world/api/tokens';
const FILE = path.join(__dirname, '../data/clankerLiveSignals.json');
let seen = new Set();

// Load existing
try {
    if (fs.existsSync(FILE)) {
        const data = JSON.parse(fs.readFileSync(FILE, 'utf8'));
        data.slice(0, 300).forEach(s => seen.add(s.contract_address || s.address));
    }
} catch(e) {}

async function scan() {
    try {
        const res = await axios.get(API, { params: { limit: 25 }, timeout: 10000 });
        const tokens = res.data?.data || [];
        let newTokens = [];
        
        for (const t of tokens) {
            if (seen.has(t.contract_address)) continue;
            seen.add(t.contract_address);
            
            const ageMin = (Date.now() - new Date(t.deployed_at)) / 60000;
            if (ageMin > 15) continue; // Only < 15 min
            
            const ageSec = Math.floor(ageMin * 60);
            const score = ageSec < 60 ? 50 : ageSec < 180 ? 40 : 30;
            
            console.log(`🚨 $${t.symbol} | ${ageSec}s | ${t.contract_address.slice(0, 20)}... | Score: ${score}`);
            
            newTokens.push({
                symbol: t.symbol,
                name: t.name,
                contract_address: t.contract_address,
                factory_address: t.factory_address,
                pool_address: t.pool_address,
                tx_hash: t.tx_hash,
                deployed_at: t.deployed_at,
                ageSeconds: ageSec,
                score,
                detectedAt: Date.now()
            });
        }
        
        if (newTokens.length > 0) {
            let existing = [];
            try { existing = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch(e) {}
            existing.unshift(...newTokens);
            fs.writeFileSync(FILE, JSON.stringify(existing.slice(0, 500), null, 2));
        }
    } catch(e) {}
}

console.log('[CLANKER-LIVE] LURKER watching Clanker...');
console.log('[CLANKER-LIVE] New tokens every 3s\n');

scan();
setInterval(scan, 3000);
