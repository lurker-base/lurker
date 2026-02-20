const { ethers } = require('ethers');
const axios = require('axios');

// Clanker TokenFactory address on Base
const CLANKER_FACTORY = '0x65d17d117d3c5c7d7f94c8b6d3c47e1f6c5e3a2b'; // Placeholder - need real address

// Bankr contracts (if applicable)
const BANKR_ROUTER = '0x...'; // Placeholder

// Uniswap V3 Factory on Base
const UNISWAP_FACTORY = '0x33128a8fC17869897dcE68Ed026d694621f6FDfD';

// Filters configuration
const FILTERS = {
    minLiquidityUSD: 1000,        // Minimum $1k liquidity
    minVolume24h: 5000,           // Minimum $5k volume
    minHolders: 10,               // Minimum 10 holders
    maxTax: 10,                   // Maximum 10% buy/sell tax
    requireVerified: false,       // Require verified contract
    minConfidenceScore: 50        // Minimum confidence to alert
};

// Provider
const provider = new ethers.JsonRpcProvider(process.env.RPC_URL || 'https://mainnet.base.org');

// Confidence scoring
function calculateConfidence(tokenData) {
    let score = 0;
    let checks = [];
    
    // Liquidity check (30 points)
    if (tokenData.liquidityUSD > 10000) {
        score += 30;
        checks.push('high_liquidity');
    } else if (tokenData.liquidityUSD > 1000) {
        score += 15;
        checks.push('medium_liquidity');
    }
    
    // Volume check (25 points)
    if (tokenData.volume24h > 50000) {
        score += 25;
        checks.push('high_volume');
    } else if (tokenData.volume24h > 5000) {
        score += 15;
        checks.push('medium_volume');
    }
    
    // Holder check (20 points)
    if (tokenData.holders > 100) {
        score += 20;
        checks.push('many_holders');
    } else if (tokenData.holders > 10) {
        score += 10;
        checks.push('some_holders');
    }
    
    // Contract verification (15 points)
    if (tokenData.verified) {
        score += 15;
        checks.push('verified');
    }
    
    // Age check (10 points) - older = more trustworthy
    if (tokenData.ageHours > 24) {
        score += 10;
        checks.push('not_new');
    }
    
    // Red flags reduce score
    if (tokenData.hasMintFunction) {
        score -= 20;
        checks.push('mint_function');
    }
    if (tokenData.hasHoneypotRisk) {
        score -= 50;
        checks.push('honeypot_risk');
    }
    if (tokenData.tax > 10) {
        score -= 15;
        checks.push('high_tax');
    }
    
    return { score: Math.max(0, score), checks };
}

// Fetch token data from DexScreener
async function fetchTokenData(tokenAddress) {
    try {
        const response = await axios.get(
            `https://api.dexscreener.com/latest/dex/tokens/${tokenAddress}`,
            { timeout: 10000 }
        );
        
        if (!response.data || !response.data.pairs || response.data.pairs.length === 0) {
            return null;
        }
        
        const pair = response.data.pairs[0]; // Take highest liquidity pair
        
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
            ageHours: (Date.now() - pair.pairCreatedAt) / (1000 * 60 * 60)
        };
    } catch (error) {
        console.error(`[LURKER] Failed to fetch data for ${tokenAddress}:`, error.message);
        return null;
    }
}

// Fetch additional data from basescan
async function fetchContractData(tokenAddress) {
    try {
        const apiKey = process.env.BASESCAN_API_KEY;
        if (!apiKey) {
            return { verified: false, holders: 0 };
        }
        
        // Check if contract is verified
        const verifyResponse = await axios.get(
            `https://api.basescan.org/api?module=contract&action=getabi&address=${tokenAddress}&apikey=${apiKey}`,
            { timeout: 10000 }
        );
        
        const verified = verifyResponse.data.status === '1';
        
        // Get holder count (if available)
        // Note: This requires token tracker API which may not be available on all explorers
        
        return {
            verified,
            holders: 0 // Will be populated from DexScreener or other source
        };
    } catch (error) {
        return { verified: false, holders: 0 };
    }
}

// Main detection logic
async function detectNewTokens() {
    console.log('[LURKER] Scanning for new token launches...');
    
    // In production, this would:
    // 1. Listen to Clanker TokenCreated events
    // 2. Listen to Uniswap PairCreated events
    // 3. Check Bankr activity
    // 4. Process all new tokens through filters
    
    // For now, return demo data
    return [];
}

// Process a single token
async function processToken(tokenAddress, source = 'unknown') {
    console.log(`[LURKER] Processing ${tokenAddress} from ${source}`);
    
    // Fetch all data
    const [tokenData, contractData] = await Promise.all([
        fetchTokenData(tokenAddress),
        fetchContractData(tokenAddress)
    ]);
    
    if (!tokenData) {
        return null;
    }
    
    // Merge data
    const fullData = {
        ...tokenData,
        ...contractData,
        source,
        detectedAt: new Date().toISOString()
    };
    
    // Calculate confidence
    const { score, checks } = calculateConfidence(fullData);
    fullData.confidence = score;
    fullData.checks = checks;
    
    // Apply filters
    const passesFilters = 
        fullData.liquidityUSD >= FILTERS.minLiquidityUSD &&
        fullData.volume24h >= FILTERS.minVolume24h &&
        fullData.holders >= FILTERS.minHolders &&
        fullData.confidence >= FILTERS.minConfidenceScore;
    
    fullData.passesFilters = passesFilters;
    
    return fullData;
}

// Generate signal message
function generateSignal(token) {
    const emoji = token.confidence >= 80 ? '🟢' : 
                  token.confidence >= 60 ? '🟠' : '⚪';
    
    const riskLevel = token.confidence >= 80 ? 'LOW' : 
                      token.confidence >= 60 ? 'MEDIUM' : 'HIGH';
    
    return {
        type: 'new_token',
        confidence: token.confidence,
        message: `${emoji} **NEW TOKEN DETECTED — ${token.symbol}**

**Name:** ${token.name}
**Address:** \`${token.address}\`

**Metrics:**
• Price: $${token.priceUSD.toFixed(6)}
• Liquidity: $${token.liquidityUSD.toLocaleString()}
• Market Cap: $${token.marketCap.toLocaleString()}

**Volume:**
• 5m: $${token.volume5m?.toLocaleString() || 0}
• 1h: $${token.volume1h?.toLocaleString() || 0}
• 6h: $${token.volume6h?.toLocaleString() || 0}
• 24h: $${token.volume24h?.toLocaleString() || 0}

**Confidence:** ${token.confidence}/100 (${riskLevel} RISK)
**Checks:** ${token.checks.join(', ')}

**Source:** ${token.source}
**Age:** ${Math.floor(token.ageHours)}h

🔗 [DexScreener](https://dexscreener.com/base/${token.address})
🔗 [BaseScan](https://basescan.org/address/${token.address})

---
*lurker // new token scanner*
*detected ${new Date(token.detectedAt).toLocaleTimeString()}*`,
        data: token
    };
}

// Export functions
module.exports = {
    detectNewTokens,
    processToken,
    calculateConfidence,
    generateSignal,
    FILTERS
};

// Demo run
if (require.main === module) {
    console.log('[LURKER] Token scanner initialized');
    console.log('[LURKER] Filters:', FILTERS);
    
    // Demo: Process a sample token
    const demoToken = '0x4200000000000000000000000000000000000006'; // WETH on Base
    
    processToken(demoToken, 'demo').then(result => {
        if (result) {
            console.log('[LURKER] Processed token:', result.symbol);
            console.log('[LURKER] Confidence:', result.confidence);
            console.log('[LURKER] Passes filters:', result.passesFilters);
            
            if (result.passesFilters) {
                const signal = generateSignal(result);
                console.log('[LURKER] Generated signal:\n', signal.message);
            }
        }
        process.exit(0);
    });
}
