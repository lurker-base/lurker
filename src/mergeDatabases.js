const fs = require('fs');
const path = require('path');

/**
 * Merge Historical Tokens into Main Database
 * Combine les tokens historiques avec les détections temps réel
 */

const HISTO_FILE = path.join(__dirname, '../data/clankerHistorical.json');
const LIVE_FILE = path.join(__dirname, '../data/clankerLiveSignals.json');
const MERGED_FILE = path.join(__dirname, '../data/allClankerSignals.json');

function mergeDatabases() {
    console.log('[MERGE] Combining historical + live tokens...');
    
    // Load files
    let historical = [];
    let live = [];
    
    try {
        if (fs.existsSync(HISTO_FILE)) {
            historical = JSON.parse(fs.readFileSync(HISTO_FILE, 'utf8'));
        }
    } catch(e) {
        console.error('[MERGE] Error loading historical:', e.message);
    }
    
    try {
        if (fs.existsSync(LIVE_FILE)) {
            live = JSON.parse(fs.readFileSync(LIVE_FILE, 'utf8'));
        }
    } catch(e) {
        console.error('[MERGE] Error loading live:', e.message);
    }
    
    console.log(`[MERGE] Historical: ${historical.length} tokens`);
    console.log(`[MERGE] Live: ${live.length} tokens`);
    
    // Merge
    const seen = new Set();
    const merged = [];
    
    // Add live first (plus récents)
    for (const token of live) {
        const addr = token.contract_address || token.address;
        if (!addr || seen.has(addr)) continue;
        seen.add(addr);
        merged.push({
            ...token,
            source: 'live',
            contract_address: addr
        });
    }
    
    // Add historical
    for (const token of historical) {
        const addr = token.contract_address;
        if (!addr || seen.has(addr)) continue;
        seen.add(addr);
        merged.push({
            ...token,
            source: 'historical',
            detectedAt: Date.now() - (token.ageHours * 60 * 60 * 1000) // Approximation
        });
    }
    
    // Sort by detected time
    merged.sort((a, b) => (b.detectedAt || 0) - (a.detectedAt || 0));
    
    // Save
    fs.writeFileSync(MERGED_FILE, JSON.stringify(merged, null, 2));
    
    console.log(`[MERGE] Combined: ${merged.length} unique tokens`);
    console.log(`[MERGE] Saved to: allClankerSignals.json`);
    
    // Stats
    const liveCount = merged.filter(t => t.source === 'live').length;
    const histoCount = merged.filter(t => t.source === 'historical').length;
    console.log(`[MERGE] Breakdown: ${liveCount} live, ${histoCount} historical`);
}

mergeDatabases();
