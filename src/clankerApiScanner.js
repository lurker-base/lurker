const axios = require('axios');
const fs = require('fs');
const path = require('path');

/**
 * LURKER Clanker API Scanner
 * Utilise l'API directe de clanker.world
 */

const CONFIG = {
    apiUrl: 'https://clanker.world/api/tokens',
    dataFile: path.join(__dirname, '../data/clankerApiSignals.json'),
    pollInterval: 5000, // 5 secondes
    maxAgeMinutes: 10   // Tokens < 10 min
};

let signals = [];
let lastCheck = new Set();

// Load existing
try {
    if (fs.existsSync(CONFIG.dataFile)) {
        signals = JSON.parse(fs.readFileSync(CONFIG.dataFile, 'utf8'));
        if (!Array.isArray(signals)) signals = [];
        // Populate lastCheck
        signals.slice(0, 100).forEach(s => lastCheck.add(s.contract_address));
    }
} catch(e) { signals = []; }

// Fetch from Clanker API
async function fetchClankerTokens() {
    try {
        const res = await axios.get(CONFIG.apiUrl, {
            params: { limit: 50 },
            timeout: 15000
        });
        return res.data?.data || [];
    } catch(e) {
        return [];
    }
}

// Calculate score
function calculateScore(token) {
    let score = 0;
    
    // Freshness
    const deployed = new Date(token.deployed_at);
    const ageMinutes = (Date.now() - deployed) / 60000;
    
    if (ageMinutes < 2) score += 50;
    else if (ageMinutes < 5) score += 40;
    else if (ageMinutes < 10) score += 30;
    
    // Market cap
    if (token.starting_market_cap > 0) {
        if (token.starting_market_cap < 100000) score += 10; // Microcap
        if (token.starting_market_cap > 50000) score += 10;
    }
    
    // Has image
    if (token.img_url) score += 10;
    
    // Social links
    if (token.socialLinks && token.socialLinks.length > 0) score += 10;
    
    return { score, ageMinutes };
}

// Main scan
async function scan() {
    const tokens = await fetchClankerTokens();
    let newCount = 0;
    let highScores = [];
    
    for (const token of tokens) {
        const addr = token.contract_address;
        
        // Skip if already seen
        if (lastCheck.has(addr)) continue;
        lastCheck.add(addr);
        
        // Calculate age and score
        const { score, ageMinutes } = calculateScore(token);
        
        // Skip old tokens
        if (ageMinutes > CONFIG.maxAgeMinutes) continue;
        
        const signal = {
            id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
            contract_address: addr,
            symbol: token.symbol,
            name: token.name,
            factory_address: token.factory_address,
            pool_address: token.pool_address,
            tx_hash: token.tx_hash,
            deployed_at: token.deployed_at,
            ageMinutes: Math.floor(ageMinutes),
            starting_market_cap: token.starting_market_cap,
            img_url: token.img_url,
            type: token.type,
            score,
            detectedAt: Date.now()
        };
        
        signals.unshift(signal);
        if (signals.length > 500) signals.pop();
        
        newCount++;
        
        // Log high scores
        if (score >= 40) {
            highScores.push(signal);
            console.log(`🚨 [CLANKER] $${token.symbol} | ${Math.floor(ageMinutes)}min | ${token.factory_address?.slice(0, 15)}... | Score: ${score}`);
        }
    }
    
    // Save
    if (newCount > 0) {
        fs.writeFileSync(CONFIG.dataFile, JSON.stringify(signals, null, 2));
        console.log(`[CLANKER-API] +${newCount} new | Total: ${signals.length}`);
    }
}

// Run
console.log('[CLANKER-API] LURKER Clanker API Scanner');
console.log('[CLANKER-API] Checking every 5s...\n');

scan();
setInterval(scan, CONFIG.pollInterval);
