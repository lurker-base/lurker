const axios = require('axios');
const fs = require('fs');
const path = require('path');

/**
 * LURKER Multi-Factory Scanner
 * Surveille TOUS les launchpads Base
 */

const CONFIG = {
    dataFile: path.join(__dirname, '../data/allBaseSignals.json'),
    pollInterval: 5000, // 5 secondes
    maxAgeMinutes: 5,   // Dernières 5 minutes
    
    // Toutes les factories sur Base
    factories: {
        // DEXs standards
        uniswapV3: '0x33128a8fC17869897dcE68Ed026d694621f6FDfD',
        aerodrome: '0x420DD381b31aEf6683db6B902084cB0FFECe40Da',
        sushiswap: '0xc35DADB65012eC5796536bD9864eD8773aBc74C4',
        baseswap: '0xB5F4706Eb76C13C0B043A70574958Cd89A0CDCB6',
        
        // Launchpads
        clanker: '0x31830E2EffE2E46af487cA7E648B95FCb55D50f4', // Clanker factory
        // Note: Pump.fun sur Base utilise des proxies
    },
    
    // RPC Alchemy
    rpcUrl: process.env.RPC_URL || 'https://base-mainnet.g.alchemy.com/v2/demo'
};

let lastBlock = 0;
let signals = [];

// Load env
function loadEnv(filepath) {
    try {
        const content = fs.readFileSync(filepath, 'utf8');
        const env = {};
        for (const line of content.split('\n')) {
            if (line.includes('=') && !line.startsWith('#')) {
                const [k, ...v] = line.split('=');
                env[k] = v.join('=');
            }
        }
        return env;
    } catch(e) { return {}; }
}

const ENV = loadEnv(path.join(__dirname, '../.env.local'));
if (ENV.RPC_URL) CONFIG.rpcUrl = ENV.RPC_URL;

// Load existing
try {
    if (fs.existsSync(CONFIG.dataFile)) {
        signals = JSON.parse(fs.readFileSync(CONFIG.dataFile, 'utf8'));
    }
} catch(e) { signals = []; }

// RPC call
async function rpcCall(method, params) {
    const res = await axios.post(CONFIG.rpcUrl, {
        jsonrpc: '2.0',
        id: Date.now(),
        method,
        params
    }, { timeout: 10000 });
    return res.data?.result;
}

// Get latest block
async function getBlockNumber() {
    const hex = await rpcCall('eth_blockNumber', []);
    return parseInt(hex, 16);
}

// Get logs for factory (PoolCreated event)
async function getPoolLogs(fromBlock, toBlock, factory) {
    // PoolCreated event signature
    const topic = '0x783cca1c0412dd0d695e784568c96da2e9c22ff989357a2e8b1d9b2b4e6b7118';
    
    try {
        const logs = await rpcCall('eth_getLogs', [{
            fromBlock: '0x' + fromBlock.toString(16),
            toBlock: '0x' + toBlock.toString(16),
            address: factory,
            topics: [topic]
        }]);
        return logs || [];
    } catch(e) {
        return [];
    }
}

// Get token info from DexScreener
async function getTokenInfo(address) {
    try {
        const res = await axios.get(
            `https://api.dexscreener.com/latest/dex/tokens/${address}`,
            { timeout: 10000 }
        );
        if (!res.data?.pairs?.length) return null;
        
        const pair = res.data.pairs[0];
        return {
            symbol: pair.baseToken.symbol,
            name: pair.baseToken.name,
            priceUSD: parseFloat(pair.priceUsd),
            liquidityUSD: parseFloat(pair.liquidity?.usd || 0),
            volume5m: parseFloat(pair.volume?.m5 || 0),
            age: pair.pairCreatedAt ? (Date.now() - pair.pairCreatedAt) / 60000 : 0,
            url: pair.url
        };
    } catch(e) { return null; }
}

// Main scan
async function scan() {
    try {
        const currentBlock = await getBlockNumber();
        
        if (lastBlock === 0) {
            lastBlock = currentBlock - 10;
            console.log(`[MULTI] Starting from block ${lastBlock}`);
        }
        
        if (currentBlock <= lastBlock) return;
        
        const fromBlock = lastBlock + 1;
        const toBlock = Math.min(currentBlock, fromBlock + 5);
        
        let newPools = 0;
        
        // Check ALL factories
        for (const [name, address] of Object.entries(CONFIG.factories)) {
            const logs = await getPoolLogs(fromBlock, toBlock, address);
            
            for (const log of logs) {
                // Decode PoolCreated
                if (!log.topics || log.topics.length < 4) continue;
                
                const token0 = '0x' + log.topics[1].slice(26);
                const token1 = '0x' + log.topics[2].slice(26);
                const pool = '0x' + log.data.slice(-40);
                
                // Skip if already seen
                if (signals.some(s => s.pool === pool)) continue;
                
                // Get info
                const isWETH = token0.toLowerCase() === '0x4200000000000000000000000000000000000006'.toLowerCase();
                const tokenAddress = isWETH ? token1 : token0;
                
                const info = await getTokenInfo(tokenAddress);
                const ageMinutes = info?.age || 0;
                
                // Very fresh only
                if (ageMinutes > CONFIG.maxAgeMinutes) continue;
                
                const signal = {
                    id: Date.now().toString(36),
                    factory: name,
                    block: parseInt(log.blockNumber, 16),
                    pool,
                    token0,
                    token1,
                    tokenAddress,
                    ...info,
                    detectedAt: Date.now()
                };
                
                signals.unshift(signal);
                if (signals.length > 500) signals.pop();
                
                newPools++;
                
                // Log IMMEDIATELY
                console.log(`🚨 [${name}] $${info?.symbol || '???'} | ${Math.floor(ageMinutes)}min | ${pool.slice(0,20)}...`);
            }
        }
        
        lastBlock = toBlock;
        
        // Save
        fs.writeFileSync(CONFIG.dataFile, JSON.stringify(signals, null, 2));
        
        if (newPools > 0) {
            console.log(`[MULTI] +${newPools} new | Total: ${signals.length}`);
        }
        
    } catch(e) {
        // Silent
    }
}

// Run
console.log('[MULTI] LURKER Multi-Factory Scanner');
console.log('[MULTI] All Base factories...');

scan();
setInterval(scan, CONFIG.pollInterval);
