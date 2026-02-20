const { Web3 } = require('web3');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

// Configuration
const CONFIG = {
    // RPC Base — utilisons plusieurs pour redondance
    rpcUrls: [
        'wss://base-mainnet.g.alchemy.com/v2/demo',  // Public demo
        'wss://base-rpc.publicnode.com',              // Public node
        'wss://mainnet.base.org'                       // Base officiel
    ],
    
    // Factory contracts sur Base
    factories: {
        uniswapV3: {
            address: '0x33128a8fC17869897dcE68Ed026d694621f6FDfD',
            abi: ['event PoolCreated(address indexed token0, address indexed token1, uint24 indexed fee, int24 tickSpacing, address pool)']
        },
        aerodrome: {
            address: '0x420DD381b31aEf6683db6B902084cB0FFECe40Da',
            abi: ['event PoolCreated(address indexed token0, address indexed token1, bool indexed stable, address pool, uint256)']
        },
        sushiswapV3: {
            address: '0xc35DADB65012eC5796536bD9864eD8773aBc74C4',
            abi: ['event PoolCreated(address indexed token0, address indexed token1, uint24 indexed fee, address pool)']
        }
    },
    
    dataFile: path.join(__dirname, '../data/realtimeSignals.json'),
    minLiquidityETH: 0.1,  // ~$250 minimum
    
    // Tokens à ignorer (stables, wrapped)
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

// Web3 instance
let web3;
let subscriptions = [];

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

// ABI minimal pour ERC20
const ERC20_ABI = [
    'function name() view returns (string)',
    'function symbol() view returns (string)',
    'function decimals() view returns (uint8)',
    'function totalSupply() view returns (uint256)'
];

// Connect to Base
async function connectWeb3() {
    for (const url of CONFIG.rpcUrls) {
        try {
            console.log(`[WS] Trying ${url.split('/')[2]}...`);
            web3 = new Web3(new Web3.providers.WebsocketProvider(url));
            
            // Test connection
            const block = await web3.eth.getBlockNumber();
            console.log(`[WS] ✅ Connected to Base — Block ${block.toLocaleString()}`);
            return true;
        } catch(e) {
            console.log(`[WS] ❌ Failed: ${e.message}`);
        }
    }
    throw new Error('All RPCs failed');
}

// Get token info
async function getTokenInfo(tokenAddress) {
    try {
        const contract = new web3.eth.Contract(ERC20_ABI, tokenAddress);
        const [name, symbol, decimals, totalSupply] = await Promise.all([
            contract.methods.name().call().catch(() => 'Unknown'),
            contract.methods.symbol().call().catch(() => '???'),
            contract.methods.decimals().call().catch(() => 18),
            contract.methods.totalSupply().call().catch(() => '0')
        ]);
        
        return {
            address: tokenAddress,
            name: String(name).slice(0, 50),
            symbol: String(symbol).slice(0, 10).toUpperCase(),
            decimals: parseInt(decimals),
            totalSupply: totalSupply.toString()
        };
    } catch(e) {
        return {
            address: tokenAddress,
            name: 'Unknown',
            symbol: '???',
            decimals: 18,
            totalSupply: '0'
        };
    }
}

// Check if token is new/interesting
function isInterestingToken(token0, token1) {
    const t0 = token0.toLowerCase();
    const t1 = token1.toLowerCase();
    
    // Ignore if both are stables/wrapped
    const t0Ignored = CONFIG.ignoreTokens.some(t => t.toLowerCase() === t0);
    const t1Ignored = CONFIG.ignoreTokens.some(t => t.toLowerCase() === t1);
    
    // On veut au moins un token qui n'est pas dans la liste
    if (t0Ignored && t1Ignored) return null;
    
    // Retourne le token qui n'est pas ignoré (celui qui nous intéresse)
    return t0Ignored ? token1 : token0;
}

// Fetch DexScreener pour le prix/liquidity
async function fetchDexData(tokenAddress) {
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
            marketCap: parseFloat(pair.marketCap) || 0,
            dex: pair.dexId,
            pairAddress: pair.pairAddress,
            url: pair.url
        };
    } catch(e) {
        return null;
    }
}

// Subscribe to factory events
async function subscribeToFactories() {
    console.log('[WS] Subscribing to factory events...\n');
    
    for (const [name, factory] of Object.entries(CONFIG.factories)) {
        try {
            const contract = new web3.eth.Contract(factory.abi, factory.address);
            
            const subscription = contract.events.allEvents({
                fromBlock: 'latest'
            });
            
            subscription.on('data', async (event) => {
                const eventName = event.event || 'PoolCreated';
                const returnValues = event.returnValues;
                
                if (!returnValues) return;
                
                const token0 = returnValues.token0 || returnValues._token0;
                const token1 = returnValues.token1 || returnValues._token1;
                const pool = returnValues.pool || returnValues._pool;
                
                if (!token0 || !token1) return;
                
                // Vérifie si c'est un token intéressant
                const interestingToken = isInterestingToken(token0, token1);
                if (!interestingToken) return; // Les deux sont ignorés (WETH/USDC etc)
                
                console.log(`\n🚨 [${name.toUpperCase()}] New pool detected!`);
                console.log(`   Pool: ${pool}`);
                console.log(`   Token0: ${token0}`);
                console.log(`   Token1: ${token1}`);
                console.log(`   Block: ${event.blockNumber}`);
                console.log(`   Tx: ${event.transactionHash}`);
                
                // Récupère les infos du token
                const tokenInfo = await getTokenInfo(interestingToken);
                console.log(`   Token: ${tokenInfo.symbol} — ${tokenInfo.name}`);
                
                // Récupère les données DexScreener
                const dexData = await fetchDexData(interestingToken);
                
                const signal = {
                    id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
                    type: 'new_pool',
                    factory: name,
                    detectedAt: Date.now(),
                    timestamp: new Date().toISOString(),
                    blockNumber: event.blockNumber,
                    transactionHash: event.transactionHash,
                    poolAddress: pool,
                    token: tokenInfo,
                    pair: {
                        token0,
                        token1
                    },
                    dexData: dexData || null,
                    score: dexData ? calculateEarlyScore(dexData) : 0
                };
                
                // Sauvegarde
                signals.unshift(signal);
                if (signals.length > 100) signals.pop();
                fs.writeFileSync(CONFIG.dataFile, JSON.stringify(signals, null, 2));
                
                console.log(`   ✅ Signal saved! Score: ${signal.score}`);
                
                // Auto-tweet si score élevé
                if (signal.score >= 60) {
                    console.log(`   🚀 HIGH SCORE — Should alert!`);
                    // TODO: Send Telegram alert
                }
            });
            
            subscription.on('error', (err) => {
                console.log(`[WS] ${name} error:`, err.message);
            });
            
            subscriptions.push(subscription);
            console.log(`[WS] ✅ Subscribed to ${name}`);
            
        } catch(e) {
            console.log(`[WS] ❌ Failed to subscribe to ${name}:`, e.message);
        }
    }
    
    console.log('\n[WS] Listening for new pools...\n');
}

// Score early detection
function calculateEarlyScore(dexData) {
    let score = 0;
    
    // Nouveau + liquidité = bon signe
    if (dexData.liquidityUSD > 50000) score += 30;
    else if (dexData.liquidityUSD > 10000) score += 20;
    else if (dexData.liquidityUSD > 5000) score += 10;
    
    // Volume early = hype
    if (dexData.volume24h > 100000) score += 30;
    else if (dexData.volume24h > 50000) score += 20;
    else if (dexData.volume24h > 10000) score += 10;
    
    // Market cap
    if (dexData.marketCap > 1000000) score += 20;
    else if (dexData.marketCap > 500000) score += 10;
    
    return Math.min(100, score);
}

// Stats
async function logStats() {
    console.log(`[WS] Stats: ${signals.length} signals total`);
    const last1h = signals.filter(s => Date.now() - s.detectedAt < 3600000).length;
    console.log(`[WS] Last hour: ${last1h} new pools\n`);
}

// Main
async function main() {
    console.log('[WS] ============================================');
    console.log('[WS] LURKER Real-Time Blockchain Scanner');
    console.log('[WS] Listening to Base chain events...');
    console.log('[WS] ============================================\n');
    
    try {
        await connectWeb3();
        await subscribeToFactories();
        
        // Stats every minute
        setInterval(logStats, 60000);
        
        // Keep alive
        setInterval(async () => {
            try {
                const block = await web3.eth.getBlockNumber();
                console.log(`[WS] Heartbeat — Block ${block.toLocaleString()}`);
            } catch(e) {
                console.log('[WS] Heartbeat failed, reconnecting...');
                await connectWeb3();
                await subscribeToFactories();
            }
        }, 30000);
        
    } catch(e) {
        console.error('[WS] Fatal error:', e);
        process.exit(1);
    }
}

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\n[WS] Shutting down...');
    subscriptions.forEach(sub => sub.unsubscribe?.());
    web3?.currentProvider?.disconnect?.();
    process.exit(0);
});

main();
