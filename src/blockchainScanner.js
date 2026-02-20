#!/usr/bin/env node
/**
 * LURKER Blockchain Scanner
 * Scanne directement Base via BaseScan API pour détecter les nouveaux tokens/pools
 */

const https = require('https');
const fs = require('fs');

const CONFIG = {
  // Get free API key from https://basescan.org/apis
  apiKey: process.env.BASESCAN_API_KEY || 'YourApiKeyToken',
  baseUrl: 'api.basescan.org',
  pollIntervalMs: 30000, // 30s
  
  // Factory contracts sur Base
  factories: {
    uniswapV3: '0x33128a8fC17869897dcE68Ed026d694621f6FDfD',
    aerodrome: '0x420DD381b31aEf6683db6b902084cB0FFECe40Da',
    bancor: '0x5C0D0e800e0C42Ea4E5a51E65B3C456e25f693c5',
    clanker: '0xE85A59c628F7d27878ACeB4bf3b35733630083a9'
  },
  
  minBlockAge: 10,      // Attendre 10 blocs (~20s) pour confirmation
  maxBlockAge: 1000,    // Max 1000 blocs (~30min) de retard
};

const DATA_FILE = 'data/allClankerSignals.json';
const ALERTS_FILE = 'data/alerts.json';

let lastBlock = 0;
let processedTxs = new Set();

// Récupérer le dernier bloc
async function getLatestBlock() {
  return new Promise((resolve) => {
    const url = `/api?module=proxy&action=eth_blockNumber&apikey=${CONFIG.apiKey}`;
    const req = https.get({ hostname: CONFIG.baseUrl, path: url, timeout: 10000 }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          const block = parseInt(json.result, 16);
          resolve(block);
        } catch(e) { resolve(0); }
      });
    });
    req.on('error', () => resolve(0));
    req.setTimeout(10000, () => { req.destroy(); resolve(0); });
  });
}

// Récupérer les transactions vers une factory
async function getFactoryTxs(factory, startBlock, endBlock) {
  return new Promise((resolve) => {
    const url = `/api?module=account&action=txlist&address=${factory}&startblock=${startBlock}&endblock=${endBlock}&sort=desc&apikey=${CONFIG.apiKey}`;
    
    const req = https.get({ 
      hostname: CONFIG.baseUrl, 
      path: url,
      headers: { 'User-Agent': 'Mozilla/5.0' },
      timeout: 15000 
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.status === '1' && json.result) {
            resolve(json.result);
          } else {
            resolve([]);
          }
        } catch(e) { resolve([]); }
      });
    });
    
    req.on('error', (err) => {
      console.log(`[BASE] Error fetching ${factory}: ${err.message}`);
      resolve([]);
    });
    req.setTimeout(15000, () => { 
      req.destroy(); 
      resolve([]); 
    });
  });
}

// Analyser une transaction pour extraire le token
function parseTokenFromTx(tx) {
  // Simplifié : on récupère les créations de pool
  // Dans la vraie vie, il faudrait décoder l'input data
  
  // Pour l'instant, on logue les nouvelles txs
  if (!processedTxs.has(tx.hash)) {
    processedTxs.add(tx.hash);
    return {
      hash: tx.hash,
      block: parseInt(tx.blockNumber),
      timestamp: parseInt(tx.timeStamp) * 1000,
      from: tx.from,
      to: tx.to,
      gas: tx.gas,
      gasPrice: tx.gasPrice,
      isError: tx.isError === '1'
    };
  }
  return null;
}

// Scanner une factory
async function scanFactory(name, address, startBlock, endBlock) {
  console.log(`[BASE] Scanning ${name} (${address.slice(0, 8)}...) blocks ${startBlock}-${endBlock}`);
  
  const txs = await getFactoryTxs(address, startBlock, endBlock);
  console.log(`[BASE] ${name}: ${txs.length} transactions`);
  
  const newTxs = [];
  for (const tx of txs) {
    const parsed = parseTokenFromTx(tx);
    if (parsed) newTxs.push(parsed);
  }
  
  return newTxs;
}

async function main() {
  console.log('[BLOCKCHAIN] LURKER Base Scanner');
  console.log('[BLOCKCHAIN]', new Date().toISOString());
  
  if (CONFIG.apiKey === 'YourApiKeyToken') {
    console.log('[BLOCKCHAIN] ⚠️  WARNING: Using demo API key');
    console.log('[BLOCKCHAIN] Get free key at: https://basescan.org/apis');
  }
  
  const latest = await getLatestBlock();
  if (latest === 0) {
    console.log('[BLOCKCHAIN] ❌ Cannot reach BaseScan');
    process.exit(1);
  }
  
  console.log(`[BLOCKCHAIN] Latest block: ${latest}`);
  
  if (lastBlock === 0) {
    lastBlock = latest - CONFIG.minBlockAge;
  }
  
  const startBlock = lastBlock;
  const endBlock = Math.min(latest - CONFIG.minBlockAge, lastBlock + CONFIG.maxBlockAge);
  
  if (startBlock >= endBlock) {
    console.log('[BLOCKCHAIN] No new blocks to scan');
    return;
  }
  
  console.log(`[BLOCKCHAIN] Scanning range: ${startBlock} - ${endBlock}`);
  
  const allNewTxs = [];
  
  // Scanner chaque factory
  for (const [name, address] of Object.entries(CONFIG.factories)) {
    try {
      const txs = await scanFactory(name, address, startBlock, endBlock);
      allNewTxs.push(...txs);
      
      // Rate limit respect
      await new Promise(r => setTimeout(r, 200));
    } catch(e) {
      console.log(`[BASE] Error with ${name}: ${e.message}`);
    }
  }
  
  console.log(`[BLOCKCHAIN] Total new transactions: ${allNewTxs.length}`);
  
  if (allNewTxs.length > 0) {
    // Sauvegarder pour analyse
    const logFile = `data/basescan_txs_${Date.now()}.json`;
    fs.writeFileSync(logFile, JSON.stringify(allNewTxs, null, 2));
    console.log(`[BLOCKCHAIN] Saved to ${logFile}`);
    
    // TODO: Analyser les input data pour extraire les tokens
    console.log('[BLOCKCHAIN] Next: Decode input data to extract token addresses');
  }
  
  lastBlock = endBlock + 1;
  
  console.log('[BLOCKCHAIN] Done');
}

// Mode test
if (require.main === module) {
  main().catch(console.error);
}

module.exports = { main, getLatestBlock, scanFactory };
