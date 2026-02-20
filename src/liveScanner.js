const fs = require('fs');
const path = require('path');
const axios = require('axios');

// Config
const CONFIG = {
    minLiquidityUSD: 5000,        // Augmenté pour éviter les tokens trop petits
    minVolume24h: 5000,
    maxAgeHours: 0.5,             // < 30min pour "new token" (pumps rapides!)
    minAgeHours: 0.05,            // Au moins 3 min
    scanInterval: 30000,          // 30 secondes entre scans
    dataFile: path.join(__dirname, '../data/signals.json'),
    // Sources
    sources: ['clanker', 'bankr', 'uniswap', 'aerodrome'],
    // BLACKLIST: Tokens établis à ignorer (pas des "new tokens")
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
        '0x0c55a9bC4843989238EaDA8E1c4235e9aCf1b3a5', // DAIMON (établi)
    ]
};

// Ensure data directory exists
const dataDir = path.dirname(CONFIG.dataFile);
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

// Load existing signals
let signals = [];
try {
    if (fs.existsSync(CONFIG.dataFile)) {
        signals = JSON.parse(fs.readFileSync(CONFIG.dataFile, 'utf8'));
        if (!Array.isArray(signals)) signals = [];
    }
} catch(e) { signals = []; }

// Calculate score
function calculateScore(data) {
    let score = 0;
    const checks = [];
    
    if (data.liquidityUSD > 50000) { score += 30; checks.push('high_liq'); }
    else if (data.liquidityUSD > 10000) { score += 20; checks.push('good_liq'); }
    else if (data.liquidityUSD > 5000) { score += 10; checks.push('min_liq'); }
    
    if (data.volume24h > 100000) { score += 25; checks.push('high_vol'); }
    else if (data.volume24h > 50000) { score += 20; checks.push('good_vol'); }
    else if (data.volume24h > 10000) { score += 10; checks.push('min_vol'); }
    
    if (data.marketCap > 1000000) { score += 15; checks.push('high_mcap'); }
    else if (data.marketCap > 100000) { score += 10; checks.push('med_mcap'); }
    
    const totalTxns = (data.txns24h?.buys || 0) + (data.txns24h?.sells || 0);
    if (totalTxns > 1000) { score += 15; checks.push('high_txn'); }
    else if (totalTxns > 100) { score += 10; checks.push('good_txn'); }
    
    if (data.ageHours > 24) { score += 10; checks.push('established'); }
    else if (data.ageHours > 6) { score += 5; checks.push('not_new'); }
    
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

// Fetch token data from DexScreener
async function getTokenData(tokenAddress) {
    try {
        const res = await axios.get(
            `https://api.dexscreener.com/latest/dex/tokens/${tokenAddress}`,
            { timeout: 10000 }
        );
        if (!res.data?.pairs?.length) return null;
        
        // Get best pair
        const pair = res.data.pairs.sort((a, b) => 
            parseFloat(b.liquidity?.usd || 0) - parseFloat(a.liquidity?.usd || 0)
        )[0];
        
        const age = pair.pairCreatedAt ? (Date.now() - pair.pairCreatedAt) / (1000 * 60 * 60) : 999;
        
        return {
            address: tokenAddress,
            symbol: pair.baseToken.symbol,
            name: pair.baseToken.name,
            priceUSD: parseFloat(pair.priceUsd) || 0,
            liquidityUSD: parseFloat(pair.liquidity?.usd) || 0,
            volume24h: parseFloat(pair.volume?.h24) || 0,
            volume6h: parseFloat(pair.volume?.h6) || 0,
            volume1h: parseFloat(pair.volume?.h1) || 0,
            volume5m: parseFloat(pair.volume?.m5) || 0,
            marketCap: parseFloat(pair.marketCap) || 0,
            ageHours: age,
            txns24h: pair.txns?.h24 || { buys: 0, sells: 0 },
            pairAddress: pair.pairAddress,
            dex: pair.dexId
        };
    } catch (e) {
        return null;
    }
}

// Detect launch platform from pair data
function detectSource(pair) {
    const dex = (pair.dexId || '').toLowerCase();
    const url = (pair.url || '').toLowerCase();
    
    if (url.includes('clanker') || dex.includes('clanker')) return 'clanker';
    if (url.includes('bankr') || pair.baseToken?.name?.toLowerCase().includes('bankr')) return 'bankr';
    if (dex.includes('aerodrome')) return 'aerodrome';
    if (dex.includes('uniswap')) return 'uniswap';
    if (dex.includes('baseswap')) return 'baseswap';
    return dex || 'unknown';
}

// Scan for new tokens on Base
async function scan() {
    console.log('[LIVE] Scanning Base for new tokens...');
    
    let newSignals = 0;
    const checked = new Set();
    const baseTokens = new Map(); // address -> source
    
    // Method 1: Get trending/latest pairs from Base
    try {
        const res = await axios.get(
            'https://api.dexscreener.com/latest/dex/pairs/base',
            { timeout: 15000 }
        );
        if (res.data?.pairs) {
            for (const pair of res.data.pairs) {
                if (pair.chainId === 'base' && pair.baseToken) {
                    const source = detectSource(pair);
                    baseTokens.set(pair.baseToken.address, source);
                }
            }
        }
    } catch(e) {
        console.log('[LIVE] Error fetching trending pairs:', e.message);
    }
    
    // Method 2: Search for specific quote tokens
    try {
        const searchQueries = ['WETH', 'USDC', 'CBETH', 'CLANKER', 'BANKR'];
        
        for (const quote of searchQueries) {
            try {
                const res = await axios.get(
                    `https://api.dexscreener.com/latest/dex/search?q=${quote}&chainId=base`,
                    { timeout: 10000 }
                );
                if (res.data?.pairs) {
                    for (const pair of res.data.pairs) {
                        if (pair.chainId === 'base' && pair.baseToken) {
                            const source = detectSource(pair);
                            baseTokens.set(pair.baseToken.address, source);
                        }
                    }
                }
            } catch(e) {}
        }
        
        console.log(`[LIVE] Found ${baseTokens.size} unique tokens on Base`);
        console.log(`[LIVE] Sources: ${[...new Set(baseTokens.values())].join(', ')}`);
        
        // Check each token
        for (const [tokenAddress, source] of baseTokens) {
            if (checked.has(tokenAddress)) continue;
            if (signals.some(s => s.address === tokenAddress)) continue;
            if (CONFIG.blacklist.includes(tokenAddress.toLowerCase())) {
                console.log(`[LIVE] ⏭️  Skipping blacklisted: ${tokenAddress}`);
                continue;
            }
            checked.add(tokenAddress);
            
            const data = await getTokenData(tokenAddress);
            if (!data) continue;
            
            // Add source info
            data.source = source;
            
            // STRICT Filter: must be NEW token (0.5h < age < 24h)
            if (!data.ageHours || data.ageHours > CONFIG.maxAgeHours) {
                console.log(`[LIVE] ⏭️  Too old: ${data.symbol} (${Math.floor(data.ageHours || 0)}h)`);
                continue;
            }
            if (data.ageHours < CONFIG.minAgeHours) {
                console.log(`[LIVE] ⏭️  Too fresh: ${data.symbol} (${Math.floor(data.ageHours * 60)}min)`);
                continue;
            }
            if (data.liquidityUSD < CONFIG.minLiquidityUSD) {
                console.log(`[LIVE] ⏭️  Low liq: ${data.symbol} ($${formatNumber(data.liquidityUSD)})`);
                continue;
            }
            
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
                newSignals++;
                
                console.log(`[LIVE] ✅ NEW: ${data.symbol} | Source: ${source} | Score: ${score} | Liq: $${formatNumber(data.liquidityUSD)} | Age: ${Math.floor(data.ageHours)}h`);
            }
        }
    } catch (error) {
        console.error('[LIVE] Scan error:', error.message);
    }
    
    // Save
    fs.writeFileSync(CONFIG.dataFile, JSON.stringify(signals, null, 2));
    console.log(`[LIVE] Complete. New: ${newSignals}, Total: ${signals.length}`);
}

// Run
scan();
setInterval(scan, CONFIG.scanInterval);

console.log('[LIVE] Scanner active — checking every 60s');
