const axios = require('axios');
const fs = require('fs');
const path = require('path');

// Config
const CONFIG = {
    minLiquidityUSD: 1000,
    minVolume24h: 1000,
    maxAgeHours: 1.0,
    minAgeHours: 0.05,
    scanInterval: 30000,
    dataFile: path.join(__dirname, '../data/signals.json'),
    
    // BaseScan API (Etherscan API V2)
    basescanApiKey: 'BT9GEVYNT7P3IH5ZNQVXAM131YC6Q5DRGH',
    basescanUrl: 'https://api.basescan.org/api',
    baseRpcUrl: 'https://mainnet.base.org',
    
    // Token Factory addresses on Base
    factories: {
        clanker: '0x28bE1a58BF350F5b1E7A1cEb4a496071Ca8D0E20',
        // Bankr factory à trouver
    },
    
    blacklist: [
        '0x4200000000000000000000000000000000000006', // WETH
        '0x2ae3f1ec7f1f5012cfeab0185bfc7aa3cf0dec22', // cbETH
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
        const beforeCount = signals.length;
        signals = signals.filter(s => !CONFIG.blacklist.includes(s.address?.toLowerCase()));
        if (signals.length < beforeCount) {
            console.log(`[INIT] Removed ${beforeCount - signals.length} blacklisted token(s)`);
        }
    }
} catch(e) { signals = []; }

// Fetch recent token creations from BaseScan
async function fetchRecentTokenCreations() {
    const tokens = new Map();
    
    try {
        // Method 1: Get logs for token creation events from Clanker factory
        // Clanker emits an event when a token is created
        const logsUrl = `${CONFIG.basescanUrl}?module=logs&action=getLogs&fromBlock=latest&toBlock=latest&address=${CONFIG.factories.clanker}&apikey=${CONFIG.basescanApiKey}`;
        
        const res = await axios.get(logsUrl, { timeout: 15000 });
        
        if (res.data?.status === '1' && res.data?.result) {
            console.log(`[BASESCAN] Found ${res.data.result.length} logs from Clanker factory`);
            
            for (const log of res.data.result) {
                // Token address is usually in the log data or topics
                if (log.address && !tokens.has(log.address)) {
                    const blockTime = parseInt(log.timeStamp) * 1000;
                    const ageHours = (Date.now() - blockTime) / (1000 * 60 * 60);
                    
                    if (ageHours < 2) {
                        tokens.set(log.address, {
                            address: log.address,
                            symbol: 'UNKNOWN',
                            name: 'Unknown Token',
                            source: 'clanker',
                            createdAt: blockTime,
                            ageHours: ageHours,
                            txHash: log.transactionHash
                        });
                    }
                }
            }
        } else {
            console.log('[BASESCAN] Logs response:', res.data?.message || 'No data');
        }
        
        // Method 2: Get recent contract creations (alternative)
        const blockUrl = `${CONFIG.basescanUrl}?module=proxy&action=eth_getBlockByNumber&tag=latest&boolean=true&apikey=${CONFIG.basescanApiKey}`;
        
        const blockRes = await axios.get(blockUrl, { timeout: 15000 });
        if (blockRes.data?.result) {
            console.log(`[BASESCAN] Current block: ${blockRes.data.result.number}`);
        }
        
    } catch(e) {
        console.log('[BASESCAN] Error:', e.message);
    }
    
    console.log(`[BASESCAN] Found ${tokens.size} recent tokens (< 2h)`);
    return [...tokens.values()];
}

// Fetch from DexScreener as fallback
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
            dex: pair.dexId,
            pairAddress: pair.pairAddress
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
    console.log('[LIVE] =========================================');
    console.log('[LIVE] Scanning with BASESCAN API + DexScreener...');
    console.log('[LIVE] =========================================');
    
    let newSignals = 0;
    const checked = new Set();
    
    // Fetch recent token creations from BaseScan
    const recentTokens = await fetchRecentTokenCreations();
    
    // Check each token
    for (const token of recentTokens) {
        if (checked.has(token.address)) continue;
        if (signals.some(s => s.address === token.address)) continue;
        if (CONFIG.blacklist.includes(token.address.toLowerCase())) {
            console.log(`[LIVE] ⏭️  Skipping blacklisted: ${token.symbol}`);
            continue;
        }
        checked.add(token.address);
        
        // Age filter
        const ageHours = token.ageHours || 999;
        if (ageHours > CONFIG.maxAgeHours) {
            console.log(`[LIVE] ⏭️  Too old: ${token.symbol} (${Math.floor(ageHours)}h)`);
            continue;
        }
        if (ageHours < CONFIG.minAgeHours) {
            console.log(`[LIVE] ⏭️  Too fresh: ${token.symbol} (${Math.floor(ageHours * 60)}min)`);
            continue;
        }
        
        // Fetch full data from DexScreener
        const dexData = await fetchDexScreenerData(token.address);
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
console.log('[LIVE] LURKER Scanner v4 — BaseScan API Edition');
console.log('[LIVE] Using Etherscan API V2 for Base chain');

scan();
setInterval(scan, CONFIG.scanInterval);

console.log(`[LIVE] Scanner active — checking every ${CONFIG.scanInterval/1000}s`);
