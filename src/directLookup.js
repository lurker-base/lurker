#!/usr/bin/env node
// LURKER Token Direct Lookup
// Recherche directe par adresse pour DAIMON et autres tokens importants

const fs = require('fs');
const https = require('https');

const DATA_FILE = 'data/allClankerSignals.json';
const now = Date.now();

// Liste des tokens à surveiller
const WATCHLIST = [
  '0x98c51C8E958ccCD37F798b2B9332d148E2c05D57', // DAIMON
];

console.log('[DIRECT-LOOKUP] LURKER Direct Token Lookup');

// Charger données existantes
let existing = [];
try {
  existing = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
} catch(e) {
  existing = [];
}

const existingMap = new Map(existing.map(t => [t.contract_address?.toLowerCase() || t.address?.toLowerCase(), t]));

function fetchTokenData(address) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.dexscreener.com',
      path: `/latest/dex/tokens/${address}`,
      headers: {
        'User-Agent': 'Mozilla/5.0'
      }
    };
    
    const req = https.get(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve(json.pairs || []);
        } catch(e) {
          reject(e);
        }
      });
    });
    
    req.on('error', reject);
    req.setTimeout(10000, () => {
      req.destroy();
      reject(new Error('Timeout'));
    });
  });
}

async function main() {
  let updatedCount = 0;
  
  for (const addr of WATCHLIST) {
    try {
      console.log(`[DIRECT-LOOKUP] Fetching ${addr}...`);
      const pairs = await fetchTokenData(addr);
      
      // Filtrer pour Base uniquement
      const basePairs = pairs.filter(p => p.chainId === 'base');
      
      if (basePairs.length === 0) {
        console.log(`[DIRECT-LOOKUP] No Base pairs found for ${addr}`);
        continue;
      }
      
      // Prendre la paire avec la meilleure liquidité
      const bestPair = basePairs.sort((a, b) => 
        parseFloat(b.liquidity?.usd || 0) - parseFloat(a.liquidity?.usd || 0)
      )[0];
      
      const token = bestPair.baseToken;
      const pairCreated = bestPair.pairCreatedAt || now;
      const ageHours = (now - pairCreated) / (1000 * 60 * 60);
      const liq = parseFloat(bestPair.liquidity?.usd || 0);
      const mcap = parseFloat(bestPair.fdv || bestPair.marketCap || 0);
      
      const vol5m = parseFloat(bestPair.volume?.m5 || 0);
      const vol1h = parseFloat(bestPair.volume?.h1 || 0);
      const vol24h = parseFloat(bestPair.volume?.h24 || 0);
      const txns5m = (bestPair.txns?.m5?.buys || 0) + (bestPair.txns?.m5?.sells || 0);
      const txns1h = (bestPair.txns?.h1?.buys || 0) + (bestPair.txns?.h1?.sells || 0);
      const txns24h = (bestPair.txns?.h24?.buys || 0) + (bestPair.txns?.h24?.sells || 0);
      
      const tokenData = {
        symbol: token.symbol,
        name: token.name,
        contract_address: addr,
        pairAddress: bestPair.pairAddress,
        dexId: bestPair.dexId,
        ageHours: Math.round(ageHours * 100) / 100,
        liquidityUsd: Math.round(liq * 100) / 100,
        marketCap: Math.round(mcap * 100) / 100,
        volume5m: Math.round(vol5m * 100) / 100,
        volume1h: Math.round(vol1h * 100) / 100,
        volume24h: Math.round(vol24h * 100) / 100,
        txns5m: txns5m,
        txns1h: txns1h,
        txns24h: txns24h,
        priceUsd: bestPair.priceUsd,
        priceChange5m: bestPair.priceChange?.m5,
        priceChange1h: bestPair.priceChange?.h1,
        priceChange24h: bestPair.priceChange?.h24,
        enrichedAt: now,
        url: `https://dexscreener.com/base/${bestPair.pairAddress}`
      };
      
      // Calculer score
      let score = 0;
      if (liq >= 500000) score += 50;
      else if (liq >= 100000) score += 40;
      else if (liq >= 50000) score += 30;
      else if (liq >= 20000) score += 20;
      else score += 10;
      
      if (vol24h >= 100000) score += 30;
      else if (vol24h >= 50000) score += 20;
      else if (vol24h >= 10000) score += 10;
      
      if (txns24h >= 1000) score += 20;
      else if (txns24h >= 500) score += 15;
      else if (txns24h >= 100) score += 10;
      
      tokenData.score = score;
      tokenData.status = score >= 70 ? 'HOT' : score >= 40 ? 'WARM' : 'COLD';
      
      // Mettre à jour ou ajouter
      const existingToken = existingMap.get(addr.toLowerCase());
      if (existingToken) {
        Object.assign(existingToken, tokenData);
        console.log(`[DAIMON-UPDATE] ${token.symbol}:`);
        console.log(`  Liq: $${Math.round(liq).toLocaleString()}`);
        console.log(`  MCap: $${Math.round(mcap/1000000*100)/100}M`);
        console.log(`  24h Vol: $${Math.round(vol24h).toLocaleString()}`);
        console.log(`  24h Change: ${bestPair.priceChange?.h24}%`);
        console.log(`  24h Txns: ${txns24h}`);
        console.log(`  Score: ${score} (${tokenData.status})`);
      } else {
        tokenData.detectedAt = now;
        tokenData.source = 'direct-lookup';
        existing.push(tokenData);
        console.log(`[NEW] ${token.symbol} added`);
      }
      
      existingMap.set(addr.toLowerCase(), tokenData);
      updatedCount++;
      
    } catch (err) {
      console.error(`[DIRECT-LOOKUP] Error fetching ${addr}:`, err.message);
    }
  }
  
  // Sauvegarder
  fs.writeFileSync(DATA_FILE, JSON.stringify(existing, null, 2));
  console.log(`[DIRECT-LOOKUP] Updated ${updatedCount} tokens`);
  console.log('[DIRECT-LOOKUP] Done');
}

main();
