const axios = require('axios');
const fs = require('fs');
const path = require('path');

/**
 * LURKER Wildcard Scanner
 * Capture ALL token creation events on Base
 */

const CONFIG = {
    dataFile: path.join(__dirname, '../data/wildcardSignals.json'),
    rpcUrl: process.env.RPC_URL || 'https://base.llamarpc.com',
    pollInterval: 5000
};

let lastBlock = 0;
let signals = [];

// Event signatures
const EVENTS = {
    // ERC20 Transfer (first mint indicates new token)
    transfer: '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',
    // PairCreated (Uniswap V2 style)
    pairCreated: '0x0d3648bd0f6ba80134a33ba9275ac585d9d315f0ad8355cddefde31afa28d0e9',
    // PoolCreated (Uniswap V3 style)
    poolCreated: '0x783cca1c0412dd0d695e784568c96da2e9c22ff989357a2e8b1d9b2b4e6b7118',
};

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

async function getLogs(fromBlock, toBlock, topic) {
    try {
        return await rpcCall('eth_getLogs', [{
            fromBlock: '0x' + fromBlock.toString(16),
            toBlock: '0x' + toBlock.toString(16),
            topics: [topic]
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
            liquidityUSD: parseFloat(pair.liquidity?.usd || 0),
            url: pair.url
        };
    } catch(e) { return null; }
}

async function scan() {
    try {
        const currentBlock = await getBlockNumber();
        
        if (lastBlock === 0) {
            lastBlock = currentBlock - 5;
            console.log(`[WILDCARD] From block ${lastBlock}`);
        }
        
        if (currentBlock <= lastBlock) return;
        
        const fromBlock = lastBlock + 1;
        const toBlock = Math.min(currentBlock, fromBlock + 3);
        
        // Get ALL PoolCreated events (any contract)
        const logs = await getLogs(fromBlock, toBlock, EVENTS.poolCreated);
        
        for (const log of logs) {
            if (!log.topics || log.topics.length < 4) continue;
            
            const token0 = '0x' + log.topics[1].slice(26);
            const token1 = '0x' + log.topics[2].slice(26);
            
            // Skip WETH pairs
            const weth = '0x4200000000000000000000000000000000000006'.toLowerCase();
            if (token0.toLowerCase() === weth && token1.toLowerCase() === weth) continue;
            
            const tokenAddress = token0.toLowerCase() === weth ? token1 : token0;
            
            // Skip if seen
            if (signals.some(s => s.tokenAddress === tokenAddress)) continue;
            
            const info = await getTokenInfo(tokenAddress);
            if (!info || info.age > 60) continue; // Only < 1h
            
            const signal = {
                tokenAddress,
                factory: log.address,
                block: parseInt(log.blockNumber, 16),
                tx: log.transactionHash,
                ...info,
                detectedAt: Date.now()
            };
            
            signals.unshift(signal);
            if (signals.length > 300) signals.pop();
            
            console.log(`🚨 $${info.symbol} | ${info.age}min | Factory: ${log.address.slice(0,20)}...`);
        }
        
        lastBlock = toBlock;
        
        fs.writeFileSync(CONFIG.dataFile, JSON.stringify(signals, null, 2));
        
    } catch(e) {}
}

console.log('[WILDCARD] Scanning all Base events...');
scan();
setInterval(scan, CONFIG.pollInterval);
