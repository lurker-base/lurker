#!/usr/bin/env node
/**
 * LURKER Uniswap Subgraph Scanner
 * Utilise le subgraph officiel Uniswap V3 sur Base (gratuit)
 */

const https = require('https');
const fs = require('fs');

const CONFIG = {
  subgraphUrl: 'https://api.thegraph.com/subgraphs/name/ianlapham/uniswap-v3-base',
  pollIntervalMs: 60000, // 1 min
  minLiquidity: 1000,    // $1k minimum
};

const DATA_FILE = 'data/allClankerSignals.json';
const PENDING_FILE = 'data/pendingTokens.json';

// Requête GraphQL pour les pools récents
const RECENT_POOLS_QUERY = `
  query RecentPools($timestamp: Int!) {
    pools(
      where: { createdAtTimestamp_gt: $timestamp }
      orderBy: createdAtTimestamp
      orderDirection: desc
      first: 50
    ) {
      id
      token0 {
        id
        symbol
        name
        decimals
      }
      token1 {
        id
        symbol
        name
        decimals
      }
      feeTier
      liquidity
      totalValueLockedUSD
      volumeUSD
      createdAtTimestamp
      txCount
    }
  }
`;

// Requête pour les pools populaires (par volume)
const TOP_POOLS_QUERY = `
  query TopPools {
    pools(
      where: { totalValueLockedUSD_gt: 1000 }
      orderBy: volumeUSD
      orderDirection: desc
      first: 100
    ) {
      id
      token0 {
        id
        symbol
        name
      }
      token1 {
        id
        symbol
        name
      }
      feeTier
      totalValueLockedUSD
      volumeUSD
      volume24h: volumeUSD
      createdAtTimestamp
    }
  }
`;

function querySubgraph(query, variables = {}) {
  return new Promise((resolve) => {
    const data = JSON.stringify({ query, variables });
    
    const options = {
      hostname: 'api.thegraph.com',
      path: '/subgraphs/name/ianlapham/uniswap-v3-base',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length,
        'User-Agent': 'Mozilla/5.0'
      },
      timeout: 15000
    };
    
    const req = https.request(options, (res) => {
      let responseData = '';
      res.on('data', chunk => responseData += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(responseData);
          resolve(json.data || {});
        } catch(e) { 
          console.log('[SUBGRAPH] Parse error:', e.message);
          resolve({}); 
        }
      });
    });
    
    req.on('error', (err) => {
      console.log('[SUBGRAPH] Error:', err.message);
      resolve({});
    });
    
    req.setTimeout(15000, () => {
      req.destroy();
      resolve({});
    });
    
    req.write(data);
    req.end();
  });
}

function isNewToken(symbol, name) {
  // Ignorer les tokens connus
  const ignoreSymbols = ['WETH', 'USDC', 'USDT', 'DAI', 'WBTC', 'cbETH', 'rETH', 'weETH'];
  if (ignoreSymbols.includes(symbol)) return false;
  
  // Token est nouveau si pas dans la liste d'ignore
  return true;
}

async function scanRecentPools() {
  console.log('[SUBGRAPH] Scanning recent pools...');
  
  const since = Math.floor(Date.now() / 1000) - 86400; // 24h
  const data = await querySubgraph(RECENT_POOLS_QUERY, { timestamp: since });
  
  if (!data.pools) {
    console.log('[SUBGRAPH] No data returned');
    return [];
  }
  
  console.log(`[SUBGRAPH] Found ${data.pools.length} recent pools`);
  
  const newTokens = [];
  
  for (const pool of data.pools) {
    const liq = parseFloat(pool.totalValueLockedUSD || 0);
    
    if (liq >= CONFIG.minLiquidity) {
      // Vérifier les deux tokens
      for (const token of [pool.token0, pool.token1]) {
        if (isNewToken(token.symbol, token.name)) {
          const age = Math.floor(Date.now() / 1000) - pool.createdAtTimestamp;
          
          newTokens.push({
            address: token.id,
            symbol: token.symbol,
            name: token.name,
            decimals: parseInt(token.decimals || 18),
            poolAddress: pool.id,
            pairToken: token.id === pool.token0.id ? pool.token1.symbol : pool.token0.symbol,
            liquidityUsd: Math.round(liq * 100) / 100,
            volume24h: Math.round(parseFloat(pool.volumeUSD || 0) * 100) / 100,
            feeTier: pool.feeTier,
            ageSeconds: age,
            ageMinutes: Math.floor(age / 60),
            ageHours: Math.floor(age / 3600),
            source: 'uniswap-v3-subgraph',
            detectedAt: Date.now()
          });
        }
      }
    }
  }
  
  return newTokens;
}

async function scanTopPools() {
  console.log('[SUBGRAPH] Scanning top volume pools...');
  
  const data = await querySubgraph(TOP_POOLS_QUERY);
  
  if (!data.pools) {
    console.log('[SUBGRAPH] No data returned');
    return [];
  }
  
  console.log(`[SUBGRAPH] Found ${data.pools.length} top pools`);
  
  const tokens = [];
  
  for (const pool of data.pools) {
    const liq = parseFloat(pool.totalValueLockedUSD || 0);
    const vol = parseFloat(pool.volumeUSD || 0);
    
    if (liq >= 10000 && vol >= 1000) { // Au moins $10k liq et $1k volume
      for (const token of [pool.token0, pool.token1]) {
        if (isNewToken(token.symbol, token.name)) {
          const age = Math.floor(Date.now() / 1000) - pool.createdAtTimestamp;
          
          tokens.push({
            address: token.id,
            symbol: token.symbol,
            name: token.name,
            poolAddress: pool.id,
            liquidityUsd: Math.round(liq * 100) / 100,
            volume24h: Math.round(vol * 100) / 100,
            ageMinutes: Math.floor(age / 60),
            source: 'uniswap-top-subgraph',
            detectedAt: Date.now()
          });
        }
      }
    }
  }
  
  return tokens;
}

async function main() {
  console.log('[SUBGRAPH] LURKER Uniswap Subgraph Scanner');
  console.log('[SUBGRAPH]', new Date().toISOString());
  console.log('[SUBGRAPH] API: Free, no key needed\n');
  
  // Charger existants
  let existing = [];
  try { existing = JSON.parse(fs.readFileSync(DATA_FILE)); } catch(e) {}
  const existingMap = new Map(existing.map(t => [t.contract_address?.toLowerCase() || t.address?.toLowerCase(), t]));
  
  // Scanner
  const recent = await scanRecentPools();
  const top = await scanTopPools();
  
  const allNew = [...recent, ...top];
  
  // Deduplicate
  const seen = new Set();
  const unique = [];
  
  for (const token of allNew) {
    const key = token.address.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(token);
    }
  }
  
  console.log(`[SUBGRAPH] Total unique new tokens: ${unique.length}`);
  
  // Ajouter à la DB
  let added = 0;
  for (const token of unique) {
    const key = token.address.toLowerCase();
    if (!existingMap.has(key)) {
      existing.push(token);
      existingMap.set(key, token);
      added++;
      console.log(`[SUBGRAPH] + ${token.symbol}: $${Math.round(token.liquidityUsd).toLocaleString()} liq, ${token.ageMinutes}min old`);
    }
  }
  
  fs.writeFileSync(DATA_FILE, JSON.stringify(existing, null, 2));
  
  console.log(`\n[SUBGRAPH] Results:`);
  console.log(`  New tokens added: ${added}`);
  console.log(`  Total DB: ${existing.length}`);
  
  // Stats
  const withLiq = existing.filter(t => (t.liquidityUsd || 0) > 0).length;
  const recentTokens = existing.filter(t => (t.ageMinutes || 999) < 60).length;
  
  console.log(`  With liquidity: ${withLiq}`);
  console.log(`  < 1h old: ${recentTokens}`);
}

main().catch(err => {
  console.error('[SUBGRAPH] Fatal error:', err.message);
  process.exit(1);
});
