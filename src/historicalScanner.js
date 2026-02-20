const axios = require('axios');
const fs = require('fs');
const path = require('path');

/**
 * LURKER Historical Scanner
 * Récupère les tokens Clanker créés avant le lancement de LURKER
 * Utilise BaseScan API + Dune
 */

const CONFIG = {
    // BaseScan API (v1 deprecated, on utilise workaround)
    basescanKey: 'BT9GEVYNT7P3IH5ZNQVXAM131YC6Q5DRGH',
    
    // Factory Clanker v4
    clankerFactory: '0xE85A59c628F7d27878ACeB4bf3b35733630083a9',
    
    // Dune
    duneKey: 'StAmNTvnKwEb7ue2Cto5IethDa3kunBj',
    
    // Output
    dataFile: path.join(__dirname, '../data/clankerHistorical.json'),
    
    // Combien de jours en arrière scanner
    lookbackDays: 3
};

// Load existing
let historicalTokens = [];
try {
    if (fs.existsSync(CONFIG.dataFile)) {
        historicalTokens = JSON.parse(fs.readFileSync(CONFIG.dataFile, 'utf8'));
    }
} catch(e) {}

// Scan via DexScreener (méthode la plus fiable pour l'historique)
async function scanDexScreenerHistory() {
    console.log('[HISTO] Scanning DexScreener for recent tokens...');
    
    const foundTokens = [];
    
    // Liste de tokens à vérifier (on va récupérer les pairs récentes)
    try {
        // Récupère toutes les paires WETH sur Base
        const res = await axios.get(
            'https://api.dexscreener.com/latest/dex/tokens/0x4200000000000000000000000000000000000006',
            { timeout: 20000 }
        );
        
        const pairs = res.data?.pairs || [];
        console.log(`[HISTO] Total WETH pairs: ${pairs.length}`);
        
        const cutoff = Date.now() - (CONFIG.lookbackDays * 24 * 60 * 60 * 1000);
        
        for (const pair of pairs) {
            if (pair.chainId !== 'base') continue;
            
            // Age
            const created = pair.pairCreatedAt;
            if (!created) continue;
            
            // Ne garde que les tokens des derniers jours
            if (created < cutoff) continue;
            
            // Token info
            const weth = '0x4200000000000000000000000000000000000006'.toLowerCase();
            let token = null;
            
            if (pair.baseToken?.address?.toLowerCase() !== weth) {
                token = pair.baseToken;
            } else if (pair.quoteToken?.address?.toLowerCase() !== weth) {
                token = pair.quoteToken;
            }
            
            if (!token) continue;
            
            const ageHours = (Date.now() - created) / (1000 * 60 * 60);
            
            foundTokens.push({
                symbol: token.symbol,
                name: token.name,
                contract_address: token.address,
                pairAddress: pair.pairAddress,
                dexId: pair.dexId,
                ageHours: Math.floor(ageHours * 10) / 10,
                ageDays: Math.floor(ageHours / 24 * 10) / 10,
                liquidityUsd: pair.liquidity?.usd || 0,
                marketCap: pair.marketCap || 0,
                volume24h: pair.volume?.h24 || 0,
                pairCreatedAt: new Date(created).toISOString(),
                likelyClanker: pair.dexId?.toLowerCase().includes('uniswap') && ageHours < 48,
                url: pair.url
            });
        }
        
        console.log(`[HISTO] Found ${foundTokens.length} tokens from last ${CONFIG.lookbackDays} days`);
        
    } catch(e) {
        console.error('[HISTO] Error:', e.message);
    }
    
    return foundTokens;
}

// Cherche DAIMON spécifiquement
async function findDaimon() {
    console.log('[HISTO] Searching for DAIMON...');
    
    try {
        const res = await axios.get(
            'https://api.dexscreener.com/latest/dex/search?q=DAIMON',
            { timeout: 15000 }
        );
        
        const pairs = res.data?.pairs || [];
        const basePairs = pairs.filter(p => p.chainId === 'base');
        
        for (const pair of basePairs) {
            if (pair.baseToken?.symbol === 'DAIMON') {
                console.log('[HISTO] ✓ DAIMON found!');
                console.log('  Address:', pair.baseToken.address);
                console.log('  Created:', new Date(pair.pairCreatedAt).toISOString());
                console.log('  Liquidity:', pair.liquidity?.usd);
                console.log('  Market Cap:', pair.marketCap);
                
                return {
                    symbol: 'DAIMON',
                    name: pair.baseToken.name,
                    contract_address: pair.baseToken.address,
                    pairAddress: pair.pairAddress,
                    dexId: pair.dexId,
                    ageHours: (Date.now() - pair.pairCreatedAt) / (1000 * 60 * 60),
                    liquidityUsd: pair.liquidity?.usd || 0,
                    marketCap: pair.marketCap || 0,
                    found: true
                };
            }
        }
    } catch(e) {
        console.error('[HISTO] Search error:', e.message);
    }
    
    return null;
}

// Merge avec tokens existants
function mergeTokens(newTokens) {
    const existingAddresses = new Set(historicalTokens.map(t => t.contract_address));
    let added = 0;
    
    for (const token of newTokens) {
        if (!existingAddresses.has(token.contract_address)) {
            historicalTokens.unshift(token);
            existingAddresses.add(token.contract_address);
            added++;
        }
    }
    
    // Sort by creation date (newest first)
    historicalTokens.sort((a, b) => 
        new Date(b.pairCreatedAt) - new Date(a.pairCreatedAt)
    );
    
    // Keep top 500
    if (historicalTokens.length > 500) {
        historicalTokens = historicalTokens.slice(0, 500);
    }
    
    fs.writeFileSync(CONFIG.dataFile, JSON.stringify(historicalTokens, null, 2));
    
    return added;
}

// Main
async function main() {
    console.log('[HISTO] LURKER Historical Scanner');
    console.log(`[HISTO] Looking back ${CONFIG.lookbackDays} days\n`);
    
    // Find DAIMON
    const daimon = await findDaimon();
    if (daimon) {
        const added = mergeTokens([daimon]);
        console.log(`[HISTO] DAIMON added: ${added > 0 ? 'YES' : 'already exists'}`);
    }
    
    // Scan all recent
    const recentTokens = await scanDexScreenerHistory();
    const added = mergeTokens(recentTokens);
    
    console.log(`\n[HISTO] Added ${added} new tokens`);
    console.log(`[HISTO] Total historical DB: ${historicalTokens.length}`);
    
    // Summary
    const clankerLike = historicalTokens.filter(t => t.likelyClanker).length;
    console.log(`[HISTO] Likely Clanker tokens: ${clankerLike}`);
}

main();
