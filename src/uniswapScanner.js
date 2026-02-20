#!/usr/bin/env node
// LURKER Uniswap Base Scanner
// Cherche directement sur Uniswap V3 Base

const fs = require('fs');
const https = require('https');

const DATA_FILE = 'data/allClankerSignals.json';
const ALERTS_FILE = 'data/alerts.json';
const now = Date.now();

// Adresse factory Uniswap V3 sur Base
const UNISWAP_V3_FACTORY = '0x33128a8fC17869897dcE68Ed026d694621f6FDfD';
const WETH_BASE = '0x4200000000000000000000000000000000000006';

console.log('[UNI-SCAN] LURKER Uniswap Base Scanner');
console.log('[UNI-SCAN]', new Date().toLocaleTimeString());

// On va chercher les pools récents via l'API Subgraph d'Uniswap
// Mais pour l'instant, utilisons une liste de tokens récents connus
// et cherchons leurs paires

const RECENT_TOKENS = [
  // Tokens récents à vérifier - on peut ajouter dynamiquement
];

let existing = [], alerts = [];
try { existing = JSON.parse(fs.readFileSync(DATA_FILE)); } catch(e) {}
try { alerts = JSON.parse(fs.readFileSync(ALERTS_FILE)); } catch(e) {}

const existingMap = new Map(existing.map(t => [(t.contract_address || t.address)?.toLowerCase(), t]));

// Fonction pour chercher un token spécifique
async function lookupToken(address) {
  return new Promise((resolve) => {
    const options = {
      hostname: 'api.dexscreener.com',
      path: `/latest/dex/tokens/${address}`,
      headers: { 'User-Agent': 'Mozilla/5.0' }
    };
    
    const req = https.get(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve(json.pairs || []);
        } catch(e) { resolve([]); }
      });
    });
    
    req.on('error', () => resolve([]));
    req.setTimeout(10000, () => { req.destroy(); resolve([]); });
  });
}

// Chercher tous les tokens du fichier clankerLiveSignals
async function scanLiveTokens() {
  let liveTokens = [];
  try {
    liveTokens = JSON.parse(fs.readFileSync('data/clankerLiveSignals.json'));
  } catch(e) { return; }
  
  console.log(`[UNI-SCAN] Checking ${liveTokens.length} live tokens for liquidity...`);
  
  let checked = 0;
  let foundWithLiq = 0;
  
  // Prendre les 20 plus récents
  const recentTokens = liveTokens
    .sort((a, b) => (b.detectedAt || 0) - (a.detectedAt || 0))
    .slice(0, 20);
  
  for (const token of recentTokens) {
    const addr = token.address;
    if (!addr || addr === WETH_BASE) continue;
    
    const pairs = await lookupToken(addr);
    const basePairs = pairs.filter(p => p.chainId === 'base');
    
    if (basePairs.length > 0) {
      const best = basePairs.sort((a, b) => 
        parseFloat(b.liquidity?.usd || 0) - parseFloat(a.liquidity?.usd || 0)
      )[0];
      
      const liq = parseFloat(best.liquidity?.usd || 0);
      const age = best.pairCreatedAt ? (now - best.pairCreatedAt) / (1000 * 60) : 9999;
      
      if (liq > 0) {
        foundWithLiq++;
        console.log(`[FOUND] ${token.symbol}: $${Math.round(liq).toLocaleString()} liq, ${Math.round(age)}min old`);
        
        // Mettre à jour ou créer
        const existingToken = existingMap.get(addr.toLowerCase());
        const tokenData = {
          symbol: token.symbol,
          name: token.name || token.symbol,
          contract_address: addr,
          pairAddress: best.pairAddress,
          dexId: best.dexId,
          ageMinutes: Math.round(age),
          liquidityUsd: Math.round(liq * 100) / 100,
          marketCap: Math.round(parseFloat(best.fdv || best.marketCap || 0) * 100) / 100,
          volume5m: Math.round(parseFloat(best.volume?.m5 || 0) * 100) / 100,
          volume24h: Math.round(parseFloat(best.volume?.h24 || 0) * 100) / 100,
          priceUsd: best.priceUsd,
          priceChange24h: best.priceChange?.h24,
          enrichedAt: now,
          url: `https://dexscreener.com/base/${best.pairAddress}`,
          source: 'uniswap-scan'
        };
        
        if (existingToken) {
          Object.assign(existingToken, tokenData);
        } else {
          tokenData.detectedAt = now;
          existing.push(tokenData);
        }
        existingMap.set(addr.toLowerCase(), tokenData);
      }
    }
    
    checked++;
    if (checked % 5 === 0) {
      await new Promise(r => setTimeout(r, 500)); // Rate limit
    }
  }
  
  console.log(`[UNI-SCAN] Checked: ${checked}, Found with liq: ${foundWithLiq}`);
}

async function main() {
  await scanLiveTokens();
  
  fs.writeFileSync(DATA_FILE, JSON.stringify(existing, null, 2));
  
  const withLiq = existing.filter(t => (t.liquidityUsd || 0) > 0);
  console.log(`[UNI-SCAN] Total DB: ${existing.length}, With liq: ${withLiq.length}`);
}

main().catch(err => {
  console.error('[UNI-SCAN] Error:', err.message);
});
