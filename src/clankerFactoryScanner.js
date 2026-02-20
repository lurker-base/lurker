const axios = require('axios');
const fs = require('fs');
const path = require('path');

/**
 * LURKER Clanker Factory Scanner
 * Alternative: scan via DexScreener pour trouver les tokens Clanker
 */

const CONFIG = {
    factoryAddress: '0xE85A59c628F7d27878ACeB4bf3b35733630083a9', // Clanker v4 factory
    endpoints: [
        'https://api.dexscreener.com/latest/dex/tokens/0x4200000000000000000000000000000000000006', // WETH
    ],
    dataFile: path.join(__dirname, '../data/clankerByFactory.json'),
    pollInterval: 15000,
    maxAgeMinutes: 120 // Cherche tokens jusqu'à 2h
};

let seenTokens = new Set();
let signals = [];

// Load existing
try {
    if (fs.existsSync(CONFIG.dataFile)) {
        signals = JSON.parse(fs.readFileSync(CONFIG.dataFile, 'utf8'));
        signals.slice(0, 300).forEach(s => seenTokens.add(s.contract_address));
    }
} catch(e) {}

async function scanByFactory() {
    console.log('[CLANKER-FACTORY] Scanning DexScreener for Clanker tokens...');
    
    try {
        const res = await axios.get(CONFIG.endpoints[0], { timeout: 15000 });
        const pairs = res.data?.pairs || [];
        
        let newCount = 0;
        
        for (const pair of pairs) {
            if (pair.chainId !== 'base') continue;
            
            // Cherche info sur le créateur (pas directement disponible sur DexScreener)
            // Mais on peut identifier les tokens récents avec fort volume
            
            const pairCreated = pair.pairCreatedAt ? new Date(pair.pairCreatedAt) : null;
            if (!pairCreated) continue;
            
            const ageMinutes = (Date.now() - pairCreated) / 60000;
            if (ageMinutes > CONFIG.maxAgeMinutes) continue;
            
            // Récupère le token (pas WETH)
            const weth = '0x4200000000000000000000000000000000000006'.toLowerCase();
            let token = null;
            
            if (pair.baseToken?.address?.toLowerCase() !== weth) {
                token = pair.baseToken;
            } else if (pair.quoteToken?.address?.toLowerCase() !== weth) {
                token = pair.quoteToken;
            }
            
            if (!token) continue;
            
            const tokenAddress = token.address;
            if (seenTokens.has(tokenAddress)) continue;
            seenTokens.add(tokenAddress);
            
            // Vérifie si c'est potentiellement Clanker (microcap + récent)
            const mcap = pair.marketCap || 0;
            const liquidity = pair.liquidity?.usd || 0;
            
            // Heuristique: Clanker tokens sont souvent:
            // - Microcap (< $5M)
            // - Liquidité modérée
            // - Créés récemment
            
            if (mcap > 10000000) continue; // Pas les gros tokens
            if (liquidity < 10000) continue; // Minimum de liquidité
            
            // Check le nom/symbol pour patterns Clanker (optionnel)
            const symbol = token.symbol || '';
            
            const signal = {
                id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
                symbol: token.symbol || 'UNKNOWN',
                name: token.name || '',
                contract_address: tokenAddress,
                pairAddress: pair.pairAddress,
                dexId: pair.dexId,
                ageMinutes: Math.floor(ageMinutes * 10) / 10,
                liquidityUsd: liquidity,
                marketCap: mcap,
                volume5m: pair.volume?.m5 || 0,
                volume1h: pair.volume?.h1 || 0,
                priceChange1h: pair.priceChange?.h1 || 0,
                likelyClanker: true,
                url: pair.url,
                detectedAt: Date.now()
            };
            
            signals.unshift(signal);
            if (signals.length > 500) signals.pop();
            
            newCount++;
            
            console.log(`🔍 $${signal.symbol} | ${Math.floor(ageMinutes)}min | Liq: $${(liquidity/1000).toFixed(1)}k | MCAP: $${(mcap/1000).toFixed(0)}k`);
            
            // Si c'est DAIMON ou similaire, on va chercher plus d'info
            if (symbol.toUpperCase() === 'DAIMON' || liquidity > 100000) {
                console.log(`\n🎯 POTENTIEL CLANKER DÉTECTÉ: $${symbol}`);
                console.log(`   Address: ${tokenAddress}`);
                console.log(`   MCAP: $${mcap.toLocaleString()}`);
                console.log(`   Liquidity: $${liquidity.toLocaleString()}`);
            }
        }
        
        if (newCount > 0) {
            fs.writeFileSync(CONFIG.dataFile, JSON.stringify(signals, null, 2));
            console.log(`[CLANKER-FACTORY] +${newCount} tokens | Total: ${signals.length}`);
        }
        
    } catch(e) {
        console.error('[CLANKER-FACTORY] Error:', e.message);
    }
}

// Recherche spécifique DAIMON
async function searchDaimon() {
    try {
        console.log('[CLANKER-FACTORY] Recherche spécifique DAIMON...');
        
        // Via DexScreener search
        const res = await axios.get('https://api.dexscreener.com/latest/dex/search?q=DAIMON', {
            timeout: 15000
        });
        
        const pairs = res.data?.pairs || [];
        const basePairs = pairs.filter(p => p.chainId === 'base');
        
        console.log(`[CLANKER-FACTORY] Pairs DAIMON trouvées: ${basePairs.length}`);
        
        for (const pair of basePairs.slice(0, 3)) {
            console.log('\n--- DAIMON ---');
            console.log('Symbol:', pair.baseToken?.symbol);
            console.log('Address:', pair.baseToken?.address);
            console.log('DEX:', pair.dexId);
            console.log('Liquidity:', pair.liquidity?.usd);
            console.log('Market Cap:', pair.marketCap);
            console.log('Created:', new Date(pair.pairCreatedAt).toISOString());
            console.log('Age:', Math.floor((Date.now() - pair.pairCreatedAt) / 60000), 'min');
        }
        
    } catch(e) {
        console.error('[CLANKER-FACTORY] Search error:', e.message);
    }
}

console.log('[CLANKER-FACTORY] Alternative scanner (API Clanker instable)');
console.log('[CLANKER-FACTORY] Detection via DexScreener\n');

// Recherche DAIMON d'abord
searchDaimon();

// Puis scan continu
setInterval(scanByFactory, CONFIG.pollInterval);
