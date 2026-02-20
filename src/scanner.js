const { ethers } = require('ethers');
const axios = require('axios');
const { sendSignal } = require('./alerts');

// Configuration
const CONFIG = {
    // Clanker V2 TokenFactory on Base
    clankerFactory: '0x92D3445d484aA60127146cE25E5783B86c1Db0B6',
    
    // Uniswap V3 Factory
    uniswapFactory: '0x33128a8fC17869897dcE68Ed026d694621f6FDfD',
    
    // RPC
    rpcUrl: process.env.RPC_URL || 'https://mainnet.base.org',
    
    // Thresholds
    minLiquidityUSD: 1000,
    minVolume24h: 5000,
    scanInterval: 300000, // 5 minutes
};

// Provider
const provider = new ethers.JsonRpcProvider(CONFIG.rpcUrl);

// ABIs
const FACTORY_ABI = [
    'event TokenCreated(address indexed token, address indexed deployer, string name, string symbol, uint256 totalSupply)',
    'event PoolCreated(address indexed token0, address indexed token1, uint24 fee, int24 tickSpacing, address pool)'
];

// Recent tokens tracked (memory)
const trackedTokens = new Map();

// Fetch token data from DexScreener
async function getTokenData(tokenAddress) {
    try {
        const response = await axios.get(
            `https://api.dexscreener.com/latest/dex/tokens/${tokenAddress}`,
            { timeout: 10000 }
        );
        
        if (!response.data?.pairs?.length) return null;
        
        const pair = response.data.pairs[0];
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
            fdv: parseFloat(pair.fdv) || 0,
            pairAddress: pair.pairAddress,
            dex: pair.dexId,
            createdAt: pair.pairCreatedAt,
            ageHours: (Date.now() - pair.pairCreatedAt) / (1000 * 60 * 60),
            txns24h: pair.txns?.h24 || { buys: 0, sells: 0 }
        };
    } catch (error) {
        console.error(`[LURKER] DexScreener error: ${error.message}`);
        return null;
    }
}

// Calculate confidence score
function calculateScore(data) {
    let score = 0;
    const checks = [];
    
    // Liquidity (30 pts)
    if (data.liquidityUSD > 50000) {
        score += 30;
        checks.push('high_liquidity');
    } else if (data.liquidityUSD > 10000) {
        score += 20;
        checks.push('good_liquidity');
    } else if (data.liquidityUSD > 1000) {
        score += 10;
        checks.push('min_liquidity');
    }
    
    // Volume (25 pts)
    if (data.volume24h > 100000) {
        score += 25;
        checks.push('high_volume');
    } else if (data.volume24h > 50000) {
        score += 20;
        checks.push('good_volume');
    } else if (data.volume24h > 5000) {
        score += 10;
        checks.push('min_volume');
    }
    
    // Market cap (15 pts)
    if (data.marketCap > 1000000) {
        score += 15;
        checks.push('high_mcap');
    } else if (data.marketCap > 100000) {
        score += 10;
        checks.push('medium_mcap');
    }
    
    // Transaction activity (15 pts)
    const totalTxns = (data.txns24h?.buys || 0) + (data.txns24h?.sells || 0);
    if (totalTxns > 1000) {
        score += 15;
        checks.push('high_activity');
    } else if (totalTxns > 100) {
        score += 10;
        checks.push('good_activity');
    }
    
    // Age (10 pts) - older is more trustworthy
    if (data.ageHours > 24) {
        score += 10;
        checks.push('established');
    } else if (data.ageHours > 6) {
        score += 5;
        checks.push('not_new');
    }
    
    // Volume momentum (bonus up to 10 pts)
    const hourlyVolume = data.volume1h || 0;
    if (hourlyVolume > data.volume24h / 12) {
        score += 10;
        checks.push('volume_spike');
    }
    
    return { score: Math.min(100, score), checks };
}

// Check if token passes filters
function passesFilters(data, score) {
    return (
        data.liquidityUSD >= CONFIG.minLiquidityUSD &&
        data.volume24h >= CONFIG.minVolume24h &&
        score >= 50
    );
}

// Generate alert message
function generateAlert(data, score, checks) {
    const emoji = score >= 80 ? '🟢' : score >= 60 ? '🟠' : '⚪';
    const risk = score >= 80 ? 'LOW' : score >= 60 ? 'MEDIUM' : 'HIGH';
    
    return {
        type: 'new_token',
        confidence: score,
        message: `${emoji} **NEW TOKEN — ${data.symbol}**

**${data.name}**
\`${data.address}\`

**Price:** $${data.priceUSD.toFixed(6)}
**Market Cap:** $${data.marketCap.toLocaleString()}
**Liquidity:** $${data.liquidityUSD.toLocaleString()}

**Volume:**
• 5m: $${(data.volume5m || 0).toLocaleString()}
• 1h: $${(data.volume1h || 0).toLocaleString()}
• 24h: $${data.volume24h.toLocaleString()}

**Activity:** ${(data.txns24h?.buys || 0) + (data.txns24h?.sells || 0)} txns (24h)
**Age:** ${Math.floor(data.ageHours)}h

**Score:** ${score}/100 (${risk} RISK)
✓ ${checks.join(' ✓ ')}

🔗 [DexScreener](https://dexscreener.com/base/${data.address})
🔗 [BaseScan](https://basescan.org/address/${data.address})

—
*pulse scanner // ${new Date().toLocaleTimeString()}*`,
        data
    };
}

// Main scan function
async function scanNewTokens() {
    console.log('[PULSE] Scanning for new tokens...');
    
    // In production, this listens to Clanker events
    // For now, we'll scan top movers on Base
    
    try {
        // Get trending pairs from DexScreener
        const response = await axios.get(
            'https://api.dexscreener.com/latest/dex/pairs/base',
            { timeout: 15000 }
        );
        
        if (!response.data?.pairs) {
            console.log('[PULSE] No pairs found');
            return;
        }
        
        // Filter for new/high activity pairs
        const candidates = response.data.pairs
            .filter(pair => {
                const age = (Date.now() - pair.pairCreatedAt) / (1000 * 60 * 60);
                return age < 48; // Less than 48h old
            })
            .slice(0, 10); // Top 10
        
        for (const pair of candidates) {
            const tokenAddress = pair.baseToken.address;
            
            // Skip if already tracked
            if (trackedTokens.has(tokenAddress)) continue;
            
            // Get full data
            const data = await getTokenData(tokenAddress);
            if (!data) continue;
            
            // Calculate score
            const { score, checks } = calculateScore(data);
            
            // Check filters
            if (passesFilters(data, score)) {
                console.log(`[PULSE] HIGH SIGNAL: ${data.symbol} (score: ${score})`);
                
                // Generate alert
                const alert = generateAlert(data, score, checks);
                
                // Send to Telegram
                await sendSignal({
                    type: 'new_token',
                    confidence: score,
                    wallet: data.address,
                    pattern: `${data.symbol} - ${checks.join(', ')}`,
                    timeframe: `${Math.floor(data.ageHours)}h`,
                    previousActivity: 'New token',
                    currentHoldings: `$${data.marketCap.toLocaleString()} mcap`,
                    explorerLink: `https://dexscreener.com/base/${data.address}`,
                    block: 0,
                    timestamp: new Date().toISOString(),
                    message: alert.message
                });
                
                // Mark as tracked
                trackedTokens.set(tokenAddress, {
                    ...data,
                    detectedAt: Date.now(),
                    score
                });
            } else {
                console.log(`[PULSE] ${data.symbol} filtered (score: ${score}, liq: $${data.liquidityUSD})`);
            }
        }
        
        console.log(`[PULSE] Scan complete. Tracked: ${trackedTokens.size}`);
        
    } catch (error) {
        console.error('[PULSE] Scan error:', error.message);
    }
}

// Start scanning
function startScanner() {
    console.log('[PULSE] Scanner started');
    console.log('[PULSE] Config:', CONFIG);
    
    // Initial scan
    scanNewTokens();
    
    // Schedule scans
    setInterval(scanNewTokens, CONFIG.scanInterval);
}

// Export
module.exports = { startScanner, scanNewTokens };

// Run if called directly
if (require.main === module) {
    startScanner();
}
