const axios = require('axios');
const fs = require('fs');
const path = require('path');

/**
 * LURKER Clanker Scanner
 * Surveille les factories Clanker sur Base
 */

const CONFIG = {
    dataFile: path.join(__dirname, '../data/clankerSignals.json'),
    pollInterval: 3000, // 3 secondes
    
    // Clanker factories (from BaseScan)
    factories: {
        v3_0: '0x375c15db32d28cecdcab5c03ab889bf15cbd2c5e',
        v3_1: '0x2a787b2362021cc3eea3c24c4748a6cd5b687382',
        v4_0: '0x34a45c6b61876d739400bd71228cbcbd4f53e8cc',
        socialDex: '0x250c9fb2b411b48273f69879007803790a6aea47'
    },
    
    // Event: TokenCreated(address indexed token, address indexed creator, string name, string symbol)
    // ou Transfer event du token
    
    rpcUrl: process.env.RPC_URL || 'https://base-mainnet.g.alchemy.com/v2/demo'
};

let lastBlock = 0;
let signals = [];

async function rpcCall(method, params) {
    const res = await axios.post(CONFIG.rpcUrl, {
        jsonrpc: '2.0',
        id: Date.now(),
        method,
        params
    }, { timeout: 10000 });
    return res.data?.result;
}

async function getBlockNumber() {
    const hex = await rpcCall('eth_blockNumber', []);
    return parseInt(hex, 16);
}

// Get ALL logs from a factory
async function getFactoryLogs(fromBlock, toBlock, factory) {
    try {
        return await rpcCall('eth_getLogs', [{
            fromBlock: '0x' + fromBlock.toString(16),
            toBlock: '0x' + toBlock.toString(16),
            address: factory
        }]) || [];
    } catch(e) { return []; }
}

async function getTokenInfo(address) {
    try {
        const res = await axios.get(
            `https://api.dexscreener.com/latest/dex/tokens/${address}`,
            { timeout: 10000 }
        );
        if (!res.data?.pairs?.length) return null;
        
        const pair = res.data.pairs[0];
        const age = pair.pairCreatedAt ? (Date.now() - pair.pairCreatedAt) / 60000 : 999;
        
        return {
            symbol: pair.baseToken.symbol,
            name: pair.baseToken.name,
            age: Math.floor(age),
            ageSeconds: Math.floor(age * 60),
            liquidityUSD: parseFloat(pair.liquidity?.usd || 0),
            volume5m: parseFloat(pair.volume?.m5 || 0),
            marketCap: parseFloat(pair.marketCap || 0),
            url: pair.url,
            pairAddress: pair.pairAddress
        };
    } catch(e) { return null; }
}

async function scan() {
    try {
        const currentBlock = await getBlockNumber();
        
        if (lastBlock === 0) {
            lastBlock = currentBlock - 3;
            console.log(`[CLANKER] Watching from block ${lastBlock}`);
        }
        
        if (currentBlock <= lastBlock) return;
        
        const fromBlock = lastBlock + 1;
        const toBlock = Math.min(currentBlock, fromBlock + 2);
        
        let newTokens = 0;
        
        for (const [version, factory] of Object.entries(CONFIG.factories)) {
            const logs = await getFactoryLogs(fromBlock, toBlock, factory);
            
            for (const log of logs) {
                // Try to extract token address from log data
                // Clanker crée un token et émet un event avec l'adresse
                
                if (!log.data || log.data.length < 66) continue;
                
                // Le token est souvent dans les topics ou data
                let tokenAddress = null;
                
                if (log.topics && log.topics.length > 1) {
                    tokenAddress = '0x' + log.topics[1].slice(26);
                }
                
                if (!tokenAddress || tokenAddress.length !== 42) continue;
                
                // Skip if already seen
                if (signals.some(s => s.tokenAddress === tokenAddress)) continue;
                
                // Get token info
                const info = await getTokenInfo(tokenAddress);
                
                // Only very fresh tokens
                if (info && info.age > 10) continue; // < 10 minutes
                
                const signal = {
                    id: Date.now().toString(36),
                    clankerVersion: version,
                    factory,
                    tokenAddress,
                    block: parseInt(log.blockNumber, 16),
                    tx: log.transactionHash,
                    ...info,
                    detectedAt: Date.now()
                };
                
                signals.unshift(signal);
                if (signals.length > 500) signals.pop();
                
                newTokens++;
                
                if (info) {
                    console.log(`🚨 [CLANKER ${version}] $${info.symbol} | ${info.age}min | ${info.liquidityUSD > 0 ? '$' + (info.liquidityUSD/1000).toFixed(1) + 'k' : 'no liq'}`);
                } else {
                    console.log(`🚨 [CLANKER ${version}] New token: ${tokenAddress.slice(0,20)}... (too fresh for DexScreener)`);
                }
            }
        }
        
        lastBlock = toBlock;
        
        if (newTokens > 0) {
            fs.writeFileSync(CONFIG.dataFile, JSON.stringify(signals, null, 2));
            console.log(`[CLANKER] +${newTokens} | Total: ${signals.length}`);
        }
        
    } catch(e) {
        // Silent
    }
}

console.log('[CLANKER] LURKER Clanker Scanner v1');
console.log('[CLANKER] Factories:', Object.keys(CONFIG.factories).join(', '));
console.log('[CLANKER] Checking every 3s...\n');

scan();
setInterval(scan, CONFIG.pollInterval);
