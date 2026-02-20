const axios = require('axios');
const fs = require('fs');
const path = require('path');

// Config
const CONFIG = {
    minLiquidityUSD: 1000,
    minVolume24h: 1000,
    maxAgeHours: 1.0,             // < 60min
    minAgeHours: 0.05,            // Au moins 3 min
    scanInterval: 30000,          // 30 secondes
    dataFile: path.join(__dirname, '../data/signals.json'),
    
    // Subgraph endpoints
    subgraphs: {
        clanker: 'https://api.goldsky.com/api/public/project_clvcr54et3r3n01xjg1b8e5gb/subgraphs/clanker-base/1.0.0/gn',
        uniswap: 'https://api.thegraph.com/subgraphs/name/ianlapham/uniswap-v3-base',
        base: 'https://api.thegraph.com/subgraphs/name/baseswapfi/v2-base'
    },
    
    // Sources
    sources: ['clanker', 'bankr', 'uniswap', 'aerodrome'],
    
    blacklist: [
        '0x4200000000000000000000000000000000000006', // WETH
        '0x2Ae3F1Ec7F1F5012CFEab0185bfc7aa3cf0DEc22', // cbETH
        '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', // USDC
        '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb', // DAI
        '0x4158734D47Bc9694570F8E8eD8DcF2CCd60b55F2', // USDbC
        '0xc1CBa3fCea344f92D9239c08C4168F955537b1D6', // BMX
        '0x78a087d713Be963Bf307b18F2Ff8122EF9A63ae9', // BSWAP
        '0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA', // USDCb
        '0xEB466342C4d449BC9f53A865D5Cb90586f405215', // axlUSDC
        '0x27D2DECb4bFC9C76F0309b8E88dec3d601fEe63a', // OVN
        '0x6985884C4392D348587B19cb9eAAf157F13271cd', // ZRO
        '0xA99F6E6785c55B3BbE9f80CC30FCB4c86E60E7D7', // PEPE
        '0x532f51C46A1e03B63A2d28F88C5d13b4b9D9D3b0', // CUSTOS
        '0x4EAf39847ec1aBv3e4f3F79211c61F15B90B2F4c', // BRETT
        '0x6B46C1F46D883012d47d13d9b8E5e99c32b6e315', // TOSHI
        '0x940181a94A35A4569E4529A3CDfB74e38FD98631', // AERO
        '0x9c0e957b6B655189d1F754688c9530C861b9bEB2', // DEGEN
        '0x0578d8A44db98B23BF096A382e016e29a5Ce0ffe', // HIGHER
        '0xBde0A8E5db3A35eE8857e0257E4F25E6B5F1F6A8', // KEYCAT
        '0x0c55a9bC4843989238EaDA8E1c4235e9aCf1b3a5', // DAIMON
    ]
};

// Ensure data directory
const dataDir = path.dirname(CONFIG.dataFile);
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

let signals = [];
try {
    if (fs.existsSync(CONFIG.dataFile)) {
        signals = JSON.parse(fs.readFileSync(CONFIG.dataFile, 'utf8'));
        if (!Array.isArray(signals)) signals = [];
    }
} catch(e) { signals = []; }

// Fetch from Clanker Subgraph
async function fetchClankerTokens() {
    const query = `
    {
        tokens(first: 50, orderBy: createdAt, orderDirection: desc) {
            id
            name
            symbol
            createdAt
            pool
        }
    }`;
    
    try {
        const res = await axios.post(CONFIG.subgraphs.clanker, { query }, { timeout: 15000 });
        const tokens = res.data?.data?.tokens || [];
        
        console.log(`[CLANKER] Found ${tokens.length} tokens from subgraph`);
        
        return tokens.map(t => ({
            address: t.id,
            symbol: t.symbol,
            name: t.name,
            source: 'clanker',
            createdAt: parseInt(t.createdAt) * 1000,
            pairAddress: t.pool
        }));
    } catch(e) {
        console.log('[CLANKER] Subgraph error:', e.message);
        return [];
    }
}

// Fetch from Uniswap V3 Subgraph
async function fetchUniswapTokens() {
    const query = `
    {
        pools(first: 50, orderBy: createdAtTimestamp, orderDirection: desc, where: {chainId: 8453}) {
            id
            token0 { id symbol name }
            token1 { id symbol name }
            createdAtTimestamp
            liquidity
        }
    }`;
    
    try {
        const res = await axios.post(CONFIG.subgraphs.uniswap, { query }, { timeout: 15000 });
        const pools = res.data?.data?.pools || [];
        
        console.log(`[UNISWAP] Found ${pools.length} pools from subgraph`);
        
        const tokens = [];
        for (const pool of pools) {
            // Skip if token0 is WETH/USDC (common pair)
            const isStable = ['WETH', 'USDC', 'USDT', 'DAI'].includes(pool.token0.symbol);
            const targetToken = isStable ? pool.token1 : pool.token0;
            
            tokens.push({
                address: targetToken.id,
                symbol: targetToken.symbol,
                name: targetToken.name,
                source: 'uniswap',
                createdAt: parseInt(pool.createdAtTimestamp) * 1000,
                pairAddress: pool.id
            });
        }
        return tokens;
    } catch(e) {
        console.log('[UNISWAP] Subgraph error:', e.message);
        return [];
    }
}

// Fetch from DexScreener (fallback/verification)
async function fetchDexScreenerData(tokenAddress) {
    try {
        const res = await axios.get(
            `https://api.dexscreener.com/latest/dex/tokens/${tokenAddress}`,
            { timeout: 10000 }
        );
        if (!res.data?.pairs?.length) return null;
        
        const pair = res.data.pairs.sort((a, b) => 
            parseFloat(b.liquidity?.usd || 0) - parseFloat(a.liquidity?.usd || 0)
        )[0];
        
        return {
            priceUSD: parseFloat(pair.priceUsd) || 0,
            liquidityUSD: parseFloat(pair.liquidity?.usd) || 0,
            volume24h: parseFloat(pair.volume?.h24) || 0,
            volume6h: parseFloat(pair.volume?.h6) || 0,
            volume1h: parseFloat(pair.volume?.h1) || 0,
            volume5m: parseFloat(pair.volume?.m5) || 0,
            marketCap: parseFloat(pair.marketCap) || 0,
            txns24h: pair.txns?.h24 || { buys: 0, sells: 0 },
            dex: pair.dexId
        };
    } catch(e) {
        return null;
    }
}

// Calculate score
function calculateScore(data) {
    let score = 0;
    const checks = [];
    
    if (data.liquidityUSD > 50000) { score += 30; checks.push('high_liq'); }
    else if (data.liquidityUSD > 10000) { score += 20; checks.push('good_liq'); }
    else if (data.liquidityUSD > 5000) { score += 10; checks.push('min_liq'); }
    else if (data.liquidityUSD > 1000) { score += 5; checks.push('low_liq'); }
    
    if (data.volume24h > 100000) { score += 25; checks.push('high_vol'); }
    else if (data.volume24h > 50000) { score += 20; checks.push('good_vol'); }
    else if (data.volume24h > 10000) { score += 10; checks.push('min_vol'); }
    else if (data.volume24h > 1000) { score += 5; checks.push('low_vol'); }
    
    if (data.marketCap > 1000000) { score += 15; checks.push('high_mcap'); }
    else if (data.marketCap > 100000) { score += 10; checks.push('med_mcap'); }
    
    const totalTxns = (data.txns24h?.buys || 0) + (data.txns24h?.sells || 0);
    if (totalTxns > 1000) { score += 15; checks.push('high_txn'); }
    else if (totalTxns > 100) { score += 10; checks.push('good_txn'); }
    else if (totalTxns > 10) { score += 5; checks.push('some_txn'); }
    
    const hourlyVolume = data.volume1h || 0;
    if (hourlyVolume > (data.volume24h / 12)) { score += 10; checks.push('vol_spike'); }
    
    return { score: Math.min(100, score), checks };
}

function getEmoji(score) {
    if (score >= 80) return '🟢';
    if (score >= 60) return '🟠';
    if (score >= 40) return '⚪';
    return '🔴';
}

function getRisk(score) {
    if (score >= 80) return 'LOW';
    if (score >= 60) return 'MEDIUM';
    if (score >= 40) return 'HIGH';
    return 'VERY HIGH';
}

function formatNumber(num) {
    if (num >= 1e9) return (num / 1e9).toFixed(2) + 'B';
    if (num >= 1e6) return (num / 1e6).toFixed(2) + 'M';
    if (num >= 1e3) return (num / 1e3).toFixed(2) + 'K';
    return num.toFixed(2);
}

// Main scan
async function scan() {
    console.log('[LIVE] Scanning with DIRECT SUBGRAPHS...');
    console.log('[LIVE] Clanker + Uniswap + DexScreener fallback');
    
    let newSignals = 0;
    const checked = new Set();
    
    // Fetch from all sources
    const [clankerTokens, uniswapTokens] = await Promise.all([
        fetchClankerTokens(),
        fetchUniswapTokens()
    ]);
    
    // Merge and dedupe
    const allTokens = new Map();
    
    for (const token of [...clankerTokens, ...uniswapTokens]) {
        if (!allTokens.has(token.address)) {
            allTokens.set(token.address, token);
        }
    }
    
    console.log(`[LIVE] Total unique tokens: ${allTokens.size}`);
    
    // Check each token
    for (const [address, token] of allTokens) {
        if (checked.has(address)) continue;
        if (signals.some(s => s.address === address)) continue;
        if (CONFIG.blacklist.includes(address.toLowerCase())) continue;
        checked.add(address);
        
        // Calculate age
        const ageHours = (Date.now() - token.createdAt) / (1000 * 60 * 60);
        
        // Age filter
        if (ageHours > CONFIG.maxAgeHours) {
            console.log(`[LIVE] ⏭️  Too old: ${token.symbol} (${Math.floor(ageHours)}h)`);
            continue;
        }
        if (ageHours < CONFIG.minAgeHours) {
            console.log(`[LIVE] ⏭️  Too fresh: ${token.symbol} (${Math.floor(ageHours * 60)}min)`);
            continue;
        }
        
        // Fetch full data from DexScreener
        const dexData = await fetchDexScreenerData(address);
        if (!dexData) {
            console.log(`[LIVE] ⏭️  No DexScreener data: ${token.symbol}`);
            continue;
        }
        
        // Liquidity filter
        if (dexData.liquidityUSD < CONFIG.minLiquidityUSD) {
            console.log(`[LIVE] ⏭️  Low liq: ${token.symbol} ($${formatNumber(dexData.liquidityUSD)})`);
            continue;
        }
        
        // Merge data
        const data = {
            ...token,
            ...dexData,
            ageHours,
            source: token.source || dexData.dex || 'unknown'
        };
        
        const { score, checks } = calculateScore(data);
        
        if (score >= 40) {
            const signal = {
                id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
                type: 'new_token',
                emoji: getEmoji(score),
                score,
                risk: getRisk(score),
                checks,
                ...data,
                detectedAt: Date.now(),
                timestamp: new Date().toISOString()
            };
            
            signals.unshift(signal);
            if (signals.length > 50) signals.pop();
            
            console.log(`[LIVE] 🎯 NEW SIGNAL: ${token.symbol} (Score: ${score}, Age: ${Math.floor(ageHours * 60)}min)`);
            newSignals++;
        } else {
            console.log(`[LIVE] ⏭️  Low score: ${token.symbol} (${score})`);
        }
    }
    
    // Save
    fs.writeFileSync(CONFIG.dataFile, JSON.stringify(signals, null, 2));
    console.log(`[LIVE] Complete. New: ${newSignals}, Total: ${signals.length}`);
    
    return newSignals;
}

// Run
console.log('[LIVE] =========================================');
console.log('[LIVE] LURKER v2 — Multi-Source Scanner');
console.log('[LIVE] Clanker Subgraph + Uniswap Subgraph + DexScreener');
console.log('[LIVE] =========================================');

scan();
setInterval(scan, CONFIG.scanInterval);

console.log(`[LIVE] Scanner active — checking every ${CONFIG.scanInterval/1000}s`);
