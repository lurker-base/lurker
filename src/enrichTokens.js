const axios = require('axios');
const fs = require('fs');
const path = require('path');

/**
 * LURKER Enrich - Ajoute les données DexScreener aux tokens existants
 */

const ALL_SIGNALS = path.join(__dirname, '../data/allClankerSignals.json');

async function enrichToken(token) {
    const addr = token.contract_address || token.address;
    if (!addr) return null;
    
    try {
        const res = await axios.get(
            `https://api.dexscreener.com/latest/dex/tokens/${addr}`,
            { timeout: 10000 }
        );
        
        if (!res.data?.pairs?.length) {
            return null;
        }
        
        // Paire avec plus de liquidité
        const pair = res.data.pairs.sort((a, b) => 
            (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0)
        )[0];
        
        return {
            ...token,
            liquidityUsd: parseFloat(pair.liquidity?.usd || 0),
            marketCap: parseFloat(pair.marketCap || 0),
            volume5m: parseFloat(pair.volume?.m5 || 0),
            volume1h: parseFloat(pair.volume?.h1 || 0),
            volume24h: parseFloat(pair.volume?.h24 || 0),
            priceChange5m: parseFloat(pair.priceChange?.m5 || 0),
            priceChange1h: parseFloat(pair.priceChange?.h1 || 0),
            dexId: pair.dexId,
            url: pair.url,
            enrichedAt: Date.now()
        };
        
    } catch(e) {
        return null;
    }
}

async function main() {
    console.log('[ENRICH] Loading tokens...');
    
    let tokens = [];
    try {
        tokens = JSON.parse(fs.readFileSync(ALL_SIGNALS, 'utf8'));
    } catch(e) {
        console.error('[ENRICH] Error loading:', e.message);
        return;
    }
    
    console.log(`[ENRICH] Total tokens: ${tokens.length}`);
    
    // Filtre ceux sans données
    const toEnrich = tokens.filter(t => 
        !(t.liquidityUsd > 0) && !(t.liquidity > 0) && !(t.marketCap > 0)
    );
    
    console.log(`[ENRICH] Tokens to enrich: ${toEnrich.length}`);
    
    let enriched = 0;
    
    for (let i = 0; i < toEnrich.length; i++) {
        const token = toEnrich[i];
        console.log(`[ENRICH] ${i+1}/${toEnrich.length} - ${token.symbol}...`);
        
        const data = await enrichToken(token);
        
        if (data && data.liquidityUsd > 0) {
            // Update in main array
            const idx = tokens.findIndex(t => 
                (t.contract_address || t.address) === (token.contract_address || token.address)
            );
            if (idx >= 0) {
                tokens[idx] = data;
                enriched++;
                console.log(`  ✓ Liq: $${data.liquidityUsd.toLocaleString()}`);
            }
        } else {
            console.log(`  ✗ No data`);
        }
        
        // Délai pour pas surcharger API
        await new Promise(r => setTimeout(r, 500));
    }
    
    // Save
    fs.writeFileSync(ALL_SIGNALS, JSON.stringify(tokens, null, 2));
    
    console.log(`\n[ENRICH] Done! Enriched ${enriched} tokens`);
}

main();
