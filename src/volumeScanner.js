const axios = require('axios');
const fs = require('fs');
const path = require('path');

/**
 * LURKER Volume Scanner
 * Détecte les tokens avec fort volume sur Base (peu importe l'âge)
 */

const CONFIG = {
    endpoints: [
        'https://api.dexscreener.com/latest/dex/tokens/0x4200000000000000000000000000000000000006',
        'https://api.dexscreener.com/latest/dex/tokens/0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    ],
    dataFile: path.join(__dirname, '../data/volumeSignals.json'),
    pollInterval: 20000, // 20 secondes
    minVolume1h: 50000,   // Min $50k volume 1h
    minLiquidity: 10000   // Min $10k liqui
};

let seenTokens = new Set();
let hotTokens = [];

// Load existing
try {
    if (fs.existsSync(CONFIG.dataFile)) {
        hotTokens = JSON.parse(fs.readFileSync(CONFIG.dataFile, 'utf8'));
        hotTokens.slice(0, 200).forEach(t => seenTokens.add(t.contract_address));
    }
} catch(e) {}

async function scanVolume() {
    let allPairs = [];
    
    for (const endpoint of CONFIG.endpoints) {
        try {
            const res = await axios.get(endpoint, { timeout: 15000 });
            allPairs = allPairs.concat(res.data?.pairs || []);
        } catch(e) {}
    }
    
    let newHot = 0;
    
    for (const pair of allPairs) {
        if (pair.chainId !== 'base') continue;
        
        // Récupère le token
        const weth = '0x4200000000000000000000000000000000000006'.toLowerCase();
        const usdc = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'.toLowerCase();
        
        let token = null;
        if (pair.baseToken?.address?.toLowerCase() !== weth && pair.baseToken?.address?.toLowerCase() !== usdc) {
            token = pair.baseToken;
        } else if (pair.quoteToken?.address?.toLowerCase() !== weth && pair.quoteToken?.address?.toLowerCase() !== usdc) {
            token = pair.quoteToken;
        }
        
        if (!token) continue;
        
        const volume1h = pair.volume?.h1 || 0;
        const liquidity = pair.liquidity?.usd || 0;
        
        // Filtre: fort volume récent
        if (volume1h < CONFIG.minVolume1h) continue;
        if (liquidity < CONFIG.minLiquidity) continue;
        
        const tokenAddress = token.address;
        const isNew = !seenTokens.has(tokenAddress);
        
        if (isNew) {
            seenTokens.add(tokenAddress);
            newHot++;
        }
        
        // Log si fort volume
        if (volume1h >= 100000) {
            const age = pair.pairCreatedAt ? 
                Math.floor((Date.now() - new Date(pair.pairCreatedAt)) / 60000) : '?';
            
            console.log(`🔥 $${token.symbol} | Vol 1h: $${(volume1h/1000).toFixed(0)}k | Liq: $${(liquidity/1000).toFixed(0)}k | Age: ${age}min | ${pair.dexId}`);
            
            // Sauvegarde
            const signal = {
                symbol: token.symbol,
                name: token.name,
                contract_address: tokenAddress,
                volume1h,
                volume24h: pair.volume?.h24 || 0,
                liquidityUsd: liquidity,
                marketCap: pair.marketCap || 0,
                priceChange1h: pair.priceChange?.h1 || 0,
                dexId: pair.dexId,
                pairAddress: pair.pairAddress,
                url: pair.url,
                isNew,
                detectedAt: Date.now()
            };
            
            hotTokens.unshift(signal);
            if (hotTokens.length > 300) hotTokens.pop();
        }
    }
    
    if (newHot > 0 || hotTokens.length > 0) {
        fs.writeFileSync(CONFIG.dataFile, JSON.stringify(hotTokens, null, 2));
    }
    
    if (newHot > 0) {
        console.log(`[VOLUME] +${newHot} hot tokens detected`);
    }
}

console.log('[VOLUME] LURKER Volume Scanner');
console.log('[VOLUME] Min vol 1h: $50k | Min liq: $10k');
console.log('[VOLUME] Every 20s...\n');

scanVolume();
setInterval(scanVolume, CONFIG.pollInterval);
