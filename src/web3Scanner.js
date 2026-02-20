#!/usr/bin/env node
/**
 * LURKER Web3 Event Scanner
 * Écoute les events PoolCreated directement sur Base via RPC WebSocket
 * PAS BESOIN D'API KEY
 */

const WebSocket = require('ws');
const fs = require('fs');

const CONFIG = {
  // RPC publics Base (gratuits)
  rpcs: [
    'wss://base.drpc.org',
    'wss://base-rpc.publicnode.com',
    'wss://base.llamarpc.com'
  ],
  
  // Uniswap V3 Factory
  uniswapFactory: '0x33128a8fC17869897dcE68Ed026d694621f6FDfD',
  
  // Aerodrome Factory
  aerodromeFactory: '0x420DD381b31aEf6683db6b902084cB0FFECe40Da',
  
  // Event signature PoolCreated
  poolCreatedTopic: '0x783cca1c0412dd0d695e784568c96da2e9c22ff989357a2e8b1d9b2b4e6b7118',
  
  reconnectDelay: 5000,
  maxReconnects: 10
};

const DATA_FILE = 'data/allClankerSignals.json';
const PENDING_FILE = 'data/pendingTokens.json';

let reconnectCount = 0;
let detectedCount = 0;

// ABI minimal pour decoder PoolCreated
function decodePoolCreated(data, topics) {
  // PoolCreated(address token0, address token1, uint24 fee, int24 tickSpacing, address pool)
  // topics[1] = token0, topics[2] = token1
  // data contient fee, tickSpacing, pool
  
  const token0 = '0x' + topics[1].slice(26);
  const token1 = '0x' + topics[2].slice(26);
  
  // Fee est dans les 3 premiers bytes de data
  const fee = parseInt(data.slice(2, 10), 16);
  
  // Pool address est les 20 derniers bytes de data
  const pool = '0x' + data.slice(-40);
  
  return { token0, token1, fee, pool };
}

// Vérifier si c'est un token intéressant (pas WETH/USDC etc.)
function isInterestingToken(address) {
  const ignore = [
    '0x4200000000000000000000000000000000000006', // WETH
    '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', // USDC
    '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb', // DAI
    '0x2Ae3F1Ec7F1F5012CFEab0185bfc7aa3cf0DEc22', // cbETH
    '0x0000000000000000000000000000000000000000', // Zero
  ].map(a => a.toLowerCase());
  
  return !ignore.includes(address.toLowerCase());
}

// Sauvegarder un nouveau token
function saveToken(poolData, source) {
  const now = Date.now();
  
  // Déterminer quel token est le "nouveau" (habituellement pas WETH)
  const isToken0New = isInterestingToken(poolData.token0);
  const isToken1New = isInterestingToken(poolData.token1);
  
  const tokens = [];
  if (isToken0New) tokens.push(poolData.token0);
  if (isToken1New) tokens.push(poolData.token1);
  
  let pending = [];
  try { pending = JSON.parse(fs.readFileSync(PENDING_FILE)); } catch(e) {}
  
  for (const token of tokens) {
    const exists = pending.find(t => t.address.toLowerCase() === token.toLowerCase());
    if (!exists) {
      pending.push({
        address: token,
        pairPool: poolData.pool,
        otherToken: token === poolData.token0 ? poolData.token1 : poolData.token0,
        fee: poolData.fee,
        source: source,
        detectedAt: now,
        status: 'PENDING' // Sera enrichi plus tard
      });
      detectedCount++;
      console.log(`[WEB3] 🆕 New token detected: ${token}`);
      console.log(`[WEB3]    Pool: ${poolData.pool}`);
      console.log(`[WEB3]    Source: ${source}`);
    }
  }
  
  fs.writeFileSync(PENDING_FILE, JSON.stringify(pending, null, 2));
}

// Connecter au WebSocket
function connect(rpcUrl) {
  console.log(`[WEB3] Connecting to ${rpcUrl}...`);
  
  const ws = new WebSocket(rpcUrl);
  
  ws.on('open', () => {
    console.log(`[WEB3] ✅ Connected to ${rpcUrl}`);
    reconnectCount = 0;
    
    // Souscrire aux logs du factory Uniswap
    const subscribeMsg = {
      jsonrpc: '2.0',
      id: 1,
      method: 'eth_subscribe',
      params: [
        'logs',
        {
          address: CONFIG.uniswapFactory,
          topics: [CONFIG.poolCreatedTopic]
        }
      ]
    };
    
    ws.send(JSON.stringify(subscribeMsg));
    console.log(`[WEB3] Subscribed to Uniswap V3 PoolCreated events`);
  });
  
  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data);
      
      if (msg.method === 'eth_subscription') {
        const log = msg.params.result;
        const decoded = decodePoolCreated(log.data, log.topics);
        
        console.log(`[WEB3] 📡 PoolCreated event!`);
        console.log(`[WEB3]    Token0: ${decoded.token0}`);
        console.log(`[WEB3]    Token1: ${decoded.token1}`);
        console.log(`[WEB3]    Fee: ${decoded.fee}`);
        console.log(`[WEB3]    Pool: ${decoded.pool}`);
        
        saveToken(decoded, 'uniswap-v3');
      }
    } catch(e) {
      // Ignore non-subscription messages
    }
  });
  
  ws.on('error', (err) => {
    console.log(`[WEB3] ❌ Error: ${err.message}`);
  });
  
  ws.on('close', () => {
    console.log(`[WEB3] ⚠️  Connection closed`);
    
    if (reconnectCount < CONFIG.maxReconnects) {
      reconnectCount++;
      console.log(`[WEB3] Reconnecting... (${reconnectCount}/${CONFIG.maxReconnects})`);
      setTimeout(() => connect(rpcUrl), CONFIG.reconnectDelay);
    } else {
      console.log(`[WEB3] Max reconnects reached. Try another RPC.`);
      // Essayer le prochain RPC
      const nextIndex = (CONFIG.rpcs.indexOf(rpcUrl) + 1) % CONFIG.rpcs.length;
      connect(CONFIG.rpcs[nextIndex]);
    }
  });
}

// Mode polling si WebSocket échoue
async function pollMode() {
  console.log('[WEB3] WebSocket mode failed, switching to HTTP polling...');
  console.log('[WEB3] Using Base RPC endpoints...');
  
  // Fallback: utiliser les scanners existants mais plus agressifs
  console.log('[WEB3] Please run: node src/aggressiveScanner.js');
  console.log('[WEB3] Or get a BaseScan API key for real-time scanning');
}

async function main() {
  console.log('[WEB3] LURKER Web3 Real-Time Scanner');
  console.log('[WEB3] Listening for new Uniswap V3 pools on Base...');
  console.log('[WEB3] No API key needed!\n');
  
  // Essayer le premier RPC
  try {
    connect(CONFIG.rpcs[0]);
  } catch(e) {
    pollMode();
  }
  
  // Stats toutes les 30s
  setInterval(() => {
    console.log(`[WEB3] Stats: ${detectedCount} new tokens detected`);
  }, 30000);
}

// Check si ws module existe
try {
  require('ws');
  main();
} catch(e) {
  console.log('[WEB3] WebSocket module not found. Installing...');
  console.log('[WEB3] Run: npm install ws');
  process.exit(1);
}
