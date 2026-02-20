const axios = require('axios');
const fs = require('fs');
const path = require('path');

// Config ultra-aggressive pour early detection
const CONFIG = {
    minLiquidityUSD: 500,         // Plus bas = plus de chances
    minVolume5m: 100,             // Volume sur 5min (early signal)
    maxAgeHours: 12,              // Jusqu'à 12h (extended detection)
    minAgeHours: 0.016,           // 1 minute (tout de suite après création)
    scanInterval: 15000,          // 15 secondes (ultra rapide)
    dataFile: path.join(__dirname, '../data/signals.json'),
    
    // Surveiller ces sources spécifiquement
    targetSources: ['clanker', 'bankr', 'uniswap', 'aerodrome', 'baseswap'],
    
    // Mots-clés pour détecter les hyped launches
    hypeKeywords: ['launch', 'fair', 'moon', 'pump', 'base', 'alpha'],
    
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

// Multi-strategy fetch - aggressive early detection
async function fetchEarlyTokens() {
    const tokens = new Map();
    const now = Date.now();
    
    // Strategy 1: Search for trending on Base chain
    try {
        const res = await axios.get(
            'https://api.dexscreener.com/latest/dex/search?q=base&chainId=base',
            { timeout: 15000 }
        );
        if (res.data?.pairs) {
            for (const pair of res.data.pairs) {
                if (pair.chainId === 'base' && pair.baseToken) {
                    const age = pair.pairCreatedAt ? (now - pair.pairCreatedAt) / (1000 * 60 * 60) : 999;
                    // RELAXED: accept up to 3 hours old
                    if (age < CONFIG.maxAgeHours) {
                        const source = detectSource(pair);
                        const key = pair.baseToken.address;
                        
                        // Keep the newest if duplicate
                        if (!tokens.has(key) || tokens.get(key).ageHours > age) {
                            tokens.set(key, {
                                address: key,
                                symbol: pair.baseToken.symbol,
                                name: pair.baseToken.name,
                                source: source,
                                createdAt: pair.pairCreatedAt,
                                pairAddress: pair.pairAddress,
                                ageHours: age,
                                initialData: {
                                    liquidityUSD: parseFloat(pair.liquidity?.usd || 0),
                                    volume5m: parseFloat(pair.volume?.m5 || 0),
                                    volume1h: parseFloat(pair.volume?.h1 || 0),
                                    priceUSD: parseFloat(pair.priceUsd || 0)
                                }
                            });
                        }
                    }
                }
            }
        }
    } catch(e) {
        console.log('[DEX] Error fetching trending:', e.message);
    }
    
    // Strategy 2: Search for fresh tokens with volume spikes
    const searchTerms = ['clanker', 'bankr', 'base', 'new', 'fair', 'launch'];
    for (const term of searchTerms) {
        try {
            const res = await axios.get(
                `https://api.dexscreener.com/latest/dex/search?q=${term}`,
                { timeout: 10000 }
            );
            if (res.data?.pairs) {
                for (const pair of res.data.pairs) {
                    if (pair.chainId === 'base' && pair.baseToken) {
                        const age = pair.pairCreatedAt ? (now - pair.pairCreatedAt) / (1000 * 60 * 60) : 999;
                        // KEY: Look for volume spikes in new tokens
                        const vol5m = parseFloat(pair.volume?.m5 || 0);
                        const vol1h = parseFloat(pair.volume?.h1 || 0);
                        const liq = parseFloat(pair.liquidity?.usd || 0);
                        
                        // Detect: new token + early volume = potential pump
                        if (age < CONFIG.maxAgeHours && (vol5m > 500 || vol1h > 1000)) {
                            const source = detectSource(pair);
                            const key = pair.baseToken.address;
                            
                            if (!tokens.has(key) || tokens.get(key).ageHours > age) {
                                tokens.set(key, {
                                    address: key,
                                    symbol: pair.baseToken.symbol,
                                    name: pair.baseToken.name,
                                    source: source,
                                    createdAt: pair.pairCreatedAt,
                                    pairAddress: pair.pairAddress,
                                    ageHours: age,
                                    initialData: {
                                        liquidityUSD: liq,
                                        volume5m: vol5m,
                                        volume1h: vol1h,
                                        priceUSD: parseFloat(pair.priceUsd || 0)
                                    },
                                    earlySignal: vol5m > 1000 ? 'HIGH_5M_VOL' : 'EARLY_VOL'
                                });
                            }
                        }
                    }
                }
            }
        } catch(e) {}
    }
    
    console.log(`[DEX] Found ${tokens.size} tokens (< ${CONFIG.maxAgeHours}h)`);
    return [...tokens.values()];
}

function detectSource(pair) {
    const dex = (pair.dexId || '').toLowerCase();
    const url = (pair.url || '').toLowerCase();
    const name = (pair.baseToken?.name || '').toLowerCase();
    const symbol = (pair.baseToken?.symbol || '').toLowerCase();
    
    if (url.includes('clanker') || name.includes('clanker')) return 'clanker';
    if (url.includes('bankr') || name.includes('bankr') || symbol.includes('bankr')) return 'bankr';
    if (dex.includes('aerodrome')) return 'aerodrome';
    if (dex.includes('uniswap')) return 'uniswap';
    if (dex.includes('baseswap')) return 'baseswap';
    return dex || 'unknown';
}

// Fetch full data from DexScreener
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
            liquidityUSD: parseFloat(pair.liquidity?.usd || 0),
            volume24h: parseFloat(pair.volume?.h24) || 0,
            volume6h: parseFloat(pair.volume?.h6) || 0,
            volume1h: parseFloat(pair.volume?.h1 || 0),
            volume5m: parseFloat(pair.volume?.m5 || 0),
            marketCap: parseFloat(pair.marketCap) || 0,
            txns24h: pair.txns?.h24 || { buys: 0, sells: 0 },
            dex: pair.dexId
        };
    } catch(e) {
        return null;
    }
}

// Calculate score - EARLY PUMP DETECTION
function calculateScore(data) {
    let score = 0;
    const checks = [];
    
    // EARLY DETECTION BONUS
    if (data.ageHours < 0.5) { score += 20; checks.push('very_new'); }
    else if (data.ageHours < 1) { score += 15; checks.push('new'); }
    else if (data.ageHours < 2) { score += 10; checks.push('fresh'); }
    
    // VOLUME MOMENTUM (key for early pumps)
    if (data.volume5m > 5000) { score += 25; checks.push('vol_5m_spike'); }
    else if (data.volume5m > 1000) { score += 20; checks.push('vol_5m_high'); }
    else if (data.volume5m > 500) { score += 15; checks.push('vol_5m_good'); }
    else if (data.volume5m > 100) { score += 10; checks.push('vol_5m_early'); }
    
    // Volume 1h vs 5m ratio (acceleration)
    if (data.volume1h > 0 && data.volume5m > (data.volume1h / 12)) {
        score += 15;
        checks.push('vol_acceleration');
    }
    
    // LIQUIDITY
    if (data.liquidityUSD > 50000) { score += 15; checks.push('high_liq'); }
    else if (data.liquidityUSD > 10000) { score += 10; checks.push('good_liq'); }
    else if (data.liquidityUSD > 5000) { score += 5; checks.push('min_liq'); }
    else if (data.liquidityUSD > 1000) { score += 3; checks.push('low_liq'); }
    
    // MARKET CAP
    if (data.marketCap > 500000) { score += 10; checks.push('high_mcap'); }
    else if (data.marketCap > 100000) { score += 5; checks.push('med_mcap'); }
    
    // TRANSACTIONS (activity = interest)
    const totalTxns = (data.txns24h?.buys || 0) + (data.txns24h?.sells || 0);
    if (totalTxns > 500) { score += 10; checks.push('high_txn'); }
    else if (totalTxns > 100) { score += 5; checks.push('good_txn'); }
    else if (totalTxns > 20) { score += 3; checks.push('early_txn'); }
    
    // BUY PRESSURE
    const buys = data.txns24h?.buys || 0;
    const sells = data.txns24h?.sells || 0;
    if (buys > sells * 2) { score += 10; checks.push('buy_pressure'); }
    else if (buys > sells) { score += 5; checks.push('more_buys'); }
    
    return { score: Math.min(100, score), checks };
}

function getEmoji(score) {
    if (score >= 80) return '🚨';  // PUMP ALERT
    if (score >= 60) return '🔥';  // HOT
    if (score >= 40) return '⚡';  // WATCH
    return '👁️';                   // OBSERVE
}

function getRisk(score) {
    if (score >= 80) return 'PUMP IMMINENT';
    if (score >= 60) return 'HIGH POTENTIAL';
    if (score >= 40) return 'WATCH CLOSELY';
    return 'EARLY';
}

function formatNumber(num) {
    if (num >= 1e9) return (num / 1e9).toFixed(2) + 'B';
    if (num >= 1e6) return (num / 1e6).toFixed(2) + 'M';
    if (num >= 1e3) return (num / 1e3).toFixed(2) + 'K';
    return num.toFixed(2);
}

function formatAge(ageHours) {
    if (ageHours < 1) return `${Math.floor(ageHours * 60)}m`;
    return `${Math.floor(ageHours)}h`;
}

// Main scan
async function scan() {
    console.log('[EARLY] =========================================');
    console.log('[EARLY] AGGRESSIVE SCAN — Looking for EARLY pumps');
    console.log('[EARLY] Age: <3h | Vol 5m: key metric');
    console.log('[EARLY] =========================================');
    
    let newSignals = 0;
    const checked = new Set();
    
    // Fetch early tokens
    const earlyTokens = await fetchEarlyTokens();
    
    // Check each token
    for (const token of earlyTokens) {
        if (checked.has(token.address)) continue;
        if (signals.some(s => s.address === token.address)) continue;
        if (CONFIG.blacklist.includes(token.address.toLowerCase())) {
            console.log(`[EARLY] ⏭️  Skipping blacklisted: ${token.symbol}`);
            continue;
        }
        checked.add(token.address);
        
        const ageHours = token.ageHours || 999;
        
        // Skip if too old
        if (ageHours > CONFIG.maxAgeHours) {
            console.log(`[EARLY] ⏭️  Too old: ${token.symbol} (${formatAge(ageHours)})`);
            continue;
        }
        
        // Get full data
        let dexData = await fetchDexScreenerData(token.address);
        if (!dexData && token.initialData) {
            dexData = token.initialData;
        }
        if (!dexData) {
            console.log(`[EARLY] ⏭️  No data: ${token.symbol}`);
            continue;
        }
        
        // RELAXED liquidity filter
        if (dexData.liquidityUSD < CONFIG.minLiquidityUSD) {
            console.log(`[EARLY] ⏭️  Low liq: ${token.symbol} ($${formatNumber(dexData.liquidityUSD)})`);
            continue;
        }
        
        // EARLY VOLUME CHECK — the key signal!
        const vol5m = dexData.volume5m || 0;
        if (vol5m < CONFIG.minVolume5m && !token.earlySignal) {
            console.log(`[EARLY] ⏭️  No early vol: ${token.symbol} ($${formatNumber(vol5m)} 5m)`);
            continue;
        }
        
        // Merge data
        const data = {
            ...token,
            ...dexData,
            source: token.source || dexData.dex || 'unknown'
        };
        
        const { score, checks } = calculateScore(data);
        
        // LOWERED threshold for early detection
        if (score >= 30) {
            const signal = {
                id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
                type: 'early_pump',
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
            
            console.log(`[EARLY] ${getEmoji(score)} NEW: ${token.symbol} | Score: ${score} | Age: ${formatAge(ageHours)} | Vol 5m: $${formatNumber(vol5m)}`);
            newSignals++;
            
            // TODO: Auto-tweet if score >= 60
            if (score >= 60) {
                console.log(`[EARLY] 🚨 HIGH SIGNAL — Should tweet!`);
            }
        } else {
            console.log(`[EARLY] ⏭️  Low score: ${token.symbol} (${score})`);
        }
    }
    
    // Save
    fs.writeFileSync(CONFIG.dataFile, JSON.stringify(signals, null, 2));
    console.log(`[EARLY] Complete. New: ${newSignals}, Total: ${signals.length}`);
    
    return newSignals;
}

// Run
console.log('[EARLY] LURKER Early Detection v5');
console.log('[EARLY] Looking for tokens BEFORE they pump');

scan();
setInterval(scan, CONFIG.scanInterval);

console.log(`[EARLY] Scanner active — checking every ${CONFIG.scanInterval/1000}s`);
