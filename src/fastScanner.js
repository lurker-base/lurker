const axios = require('axios');
const fs = require('fs');
const path = require('path');

// Load .env.local
function loadEnv(filepath) {
    const env = {};
    try {
        const content = fs.readFileSync(filepath, 'utf8');
        for (const line of content.split('\n')) {
            const trimmed = line.trim();
            if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
                const [key, ...valueParts] = trimmed.split('=');
                env[key] = valueParts.join('=');
            }
        }
    } catch (e) {}
    return env;
}

const ENV = loadEnv(path.join(__dirname, '../.env.local'));

// Configuration aggressive
const CONFIG = {
    rpcUrls: [
        ENV.RPC_URL || 'https://base.llamarpc.com',
        'https://base.drpc.org',
        'https://base.meowrpc.com',
        'https://base.publicnode.com'
    ],
    
    // Factory contracts
    factories: {
        uniswapV3: '0x33128a8fC17869897dcE68Ed026d694621f6FDfD',
        aerodrome: '0x420DD381b31aEf6683db6B902084cB0FFECe40Da',
        baseswap: '0xB5F4706Eb76C13C0B043A70574958Cd89A0CDCB6',
        sushiswap: '0xc35DADB65012eC5796536bD9864eD8773aBc74C4'
    },
    
    dataFile: path.join(__dirname, '../data/realtimeSignals.json'),
    pollInterval: 15000,  // 15 secondes — évite rate limit
    blocksToScan: 5,     // Scan les 5 derniers blocs (réduit pour éviter rate limit)
    
    // Tokens à ignorer
    ignoreTokens: [
        '0x4200000000000000000000000000000000000006', // WETH
        '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', // USDC
        '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb', // DAI
        '0x2ae3f1ec7f1f5012cfeab0185bfc7aa3cf0dec22', // cbETH
        '0x4158734D47Bc9694570F8E8eD8DcF2CCd60b55F2', // USDbC
        '0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA', // USDCb
        '0xEB466342C4d449BC9f53A865D5Cb90586f405215', // axlUSDC
    ]
};

let lastBlock = 0;
let signals = [];

// Load existing
const dataDir = path.dirname(CONFIG.dataFile);
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
try {
    if (fs.existsSync(CONFIG.dataFile)) {
        signals = JSON.parse(fs.readFileSync(CONFIG.dataFile, 'utf8'));
        if (!Array.isArray(signals)) signals = [];
    }
} catch(e) { signals = []; }

// Silent RPC call with rotation
async function rpcCall(method, params = [], urlIndex = 0) {
    if (urlIndex >= CONFIG.rpcUrls.length) {
        throw new Error('All RPCs failed');
    }
    
    const url = CONFIG.rpcUrls[urlIndex];
    try {
        const res = await axios.post(url, {
            jsonrpc: '2.0',
            id: Date.now(),
            method,
            params
        }, { timeout: 10000 });
        
        if (res.data?.error) {
            throw new Error(res.data.error.message);
        }
        
        return res.data?.result;
    } catch(e) {
        // Silently try next RPC - errors logged to file only
        return rpcCall(method, params, urlIndex + 1);
    }
}

// Get latest block
async function getLatestBlock() {
    const hex = await rpcCall('eth_blockNumber');
    return parseInt(hex, 16);
}

// Get block data
async function getBlock(blockNumber) {
    const hex = '0x' + blockNumber.toString(16);
    return await rpcCall('eth_getBlockByNumber', [hex, true]);
}

// Get logs for factory
async function getFactoryLogs(fromBlock, toBlock, factoryAddress) {
    const topics = [
        // PoolCreated event signature
        '0x783cca1c0412dd0d695e784568c96da2e9c22ff989357a2e8b1d9b2b4e6b7118', // Uniswap V3
        null,
        null
    ];
    
    try {
        const logs = await rpcCall('eth_getLogs', [{
            fromBlock: '0x' + fromBlock.toString(16),
            toBlock: '0x' + toBlock.toString(16),
            address: factoryAddress,
            topics: [topics[0]]
        }]);
        return logs || [];
    } catch(e) {
        return [];
    }
}

// Decode PoolCreated event
function decodePoolCreated(log) {
    // Uniswap V3: PoolCreated(token0, token1, fee, tickSpacing, pool)
    // Topics: [eventSig, token0, token1, fee]
    // Data: tickSpacing + pool
    
    if (!log.topics || log.topics.length < 4) return null;
    
    const token0 = '0x' + log.topics[1].slice(26);
    const token1 = '0x' + log.topics[2].slice(26);
    // fee is in topics[3]
    
    // Pool address is in data (last 40 chars of data)
    const pool = '0x' + log.data.slice(-40);
    
    return { token0, token1, pool };
}

// Decode Aerodrome PoolCreated
function decodeAerodromePoolCreated(log) {
    // Aerodrome: PoolCreated(token0, token1, stable, pool, uint256)
    // Topics: [eventSig, token0, token1, stable]
    
    if (!log.topics || log.topics.length < 4) return null;
    
    const token0 = '0x' + log.topics[1].slice(26);
    const token1 = '0x' + log.topics[2].slice(26);
    const stable = log.topics[3] !== '0x' + '0'.repeat(64);
    
    // Pool is in data
    const pool = '0x' + log.data.slice(26, 66);
    
    return { token0, token1, pool, stable };
}

// Check if token is interesting
function getInterestingToken(token0, token1) {
    const t0 = token0.toLowerCase();
    const t1 = token1.toLowerCase();
    const ignored = CONFIG.ignoreTokens.map(t => t.toLowerCase());
    
    const t0Ignored = ignored.includes(t0);
    const t1Ignored = ignored.includes(t1);
    
    if (t0Ignored && t1Ignored) return null;
    return t0Ignored ? token1 : token0;
}

// Get token info from DexScreener
async function getTokenInfo(tokenAddress) {
    try {
        const res = await axios.get(
            `https://api.dexscreener.com/latest/dex/tokens/${tokenAddress}`,
            { timeout: 10000 }
        );
        
        if (!res.data?.pairs?.length) return null;
        
        const pair = res.data.pairs[0];
        const token = pair.baseToken.address.toLowerCase() === tokenAddress.toLowerCase() 
            ? pair.baseToken 
            : pair.quoteToken;
        
        return {
            address: tokenAddress,
            symbol: token.symbol,
            name: token.name,
            priceUSD: parseFloat(pair.priceUsd) || 0,
            liquidityUSD: parseFloat(pair.liquidity?.usd || 0),
            volume24h: parseFloat(pair.volume?.h24 || 0),
            volume1h: parseFloat(pair.volume?.h1 || 0),
            volume5m: parseFloat(pair.volume?.m5 || 0),
            marketCap: parseFloat(pair.marketCap || 0),
            dex: pair.dexId,
            pairAddress: pair.pairAddress,
            url: pair.url,
            age: pair.pairCreatedAt ? (Date.now() - pair.pairCreatedAt) / 60000 : null
        };
    } catch(e) {
        return null;
    }
}

// Calculate score
function calculateScore(info) {
    let score = 0;
    
    // NEW token bonus
    if (info.age && info.age < 60) score += 25;      // < 1h
    else if (info.age && info.age < 180) score += 15; // < 3h
    
    // Liquidity
    if (info.liquidityUSD > 100000) score += 25;
    else if (info.liquidityUSD > 50000) score += 20;
    else if (info.liquidityUSD > 20000) score += 15;
    else if (info.liquidityUSD > 5000) score += 10;
    
    // Volume 5m (early indicator)
    if (info.volume5m > 10000) score += 25;
    else if (info.volume5m > 5000) score += 20;
    else if (info.volume5m > 1000) score += 10;
    
    // Volume 1h
    if (info.volume1h > 50000) score += 15;
    else if (info.volume1h > 20000) score += 10;
    
    // Market cap
    if (info.marketCap > 1000000) score += 10;
    else if (info.marketCap > 500000) score += 5;
    
    return Math.min(100, score);
}

// Delay helper
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

// Silent logger
const logFile = path.join(__dirname, '../logs/scanner.log');
function log(msg) {
    const line = `[${new Date().toISOString()}] ${msg}\n`;
    try {
        fs.appendFileSync(logFile, line);
    } catch(e) {}
}

// Ensure logs directory
const logsDir = path.join(__dirname, '../logs');
if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });

// Scan blocks
async function scanBlocks() {
    try {
        const currentBlock = await getLatestBlock();
        
        if (lastBlock === 0) {
            lastBlock = currentBlock - 3;
            console.log(`[LURKER] Watching Base from block ${lastBlock.toLocaleString()}`);
            log(`Started from block ${lastBlock}`);
        }
        
        if (currentBlock <= lastBlock) return;
        
        const fromBlock = lastBlock + 1;
        const toBlock = Math.min(currentBlock, fromBlock + CONFIG.blocksToScan);
        
        let newPools = 0;
        let factoryIndex = 0;
        let highScoreSignals = [];
        
        // Scan each factory with delay
        for (const [name, address] of Object.entries(CONFIG.factories)) {
            if (factoryIndex > 0) await delay(3000);
            factoryIndex++;
            
            const logs = await getFactoryLogs(fromBlock, toBlock, address);
            
            for (const entry of logs) {
                let decoded;
                if (name === 'aerodrome') {
                    decoded = decodeAerodromePoolCreated(entry);
                } else {
                    decoded = decodePoolCreated(entry);
                }
                
                if (!decoded) continue;
                
                const interestingToken = getInterestingToken(decoded.token0, decoded.token1);
                if (!interestingToken) continue;
                
                const info = await getTokenInfo(interestingToken);
                const score = info ? calculateScore(info) : 0;
                
                const signal = {
                    id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
                    factory: name,
                    blockNumber: parseInt(entry.blockNumber, 16),
                    transactionHash: entry.transactionHash,
                    pool: decoded.pool,
                    token0: decoded.token0,
                    token1: decoded.token1,
                    token: info,
                    score,
                    detectedAt: Date.now(),
                    timestamp: new Date().toISOString()
                };
                
                signals.unshift(signal);
                if (signals.length > 200) signals.pop();
                
                fs.writeFileSync(CONFIG.dataFile, JSON.stringify(signals, null, 2));
                newPools++;
                
                // Only log high scores publicly
                if (score >= 50) {
                    highScoreSignals.push({ name: info?.symbol || '???', score, liq: info?.liquidityUSD });
                    console.log(`🚨 $${info?.symbol} | Score: ${score} | Liq: $${((info?.liquidityUSD || 0)/1000).toFixed(1)}k`);
                    log(`HIGH SIGNAL: ${info?.symbol} score=${score}`);
                } else {
                    log(`Signal: ${info?.symbol || '???'} score=${score}`);
                }
            }
        }
        
        lastBlock = toBlock;
        
        if (highScoreSignals.length > 0) {
            console.log(`✅ Found ${highScoreSignals.length} high-score signal(s)`);
        }
        
    } catch(e) {
        log(`Error: ${e.message}`);
    }
}

// Stats (silent)
function logStats() {
    const last1h = signals.filter(s => Date.now() - s.detectedAt < 3600000).length;
    log(`Stats — 1h: ${last1h} | Total: ${signals.length}`);
}

// Main
console.log('[LURKER] Factory scanner active');

scanBlocks();
setInterval(scanBlocks, CONFIG.pollInterval);
setInterval(logStats, 60000);

console.log('[LURKER] Watching Base chain for new tokens...');
