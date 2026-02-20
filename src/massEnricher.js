#!/usr/bin/env node
/**
 * LURKER Mass Enricher
 * Enrichit TOUS les tokens détectés via DexScreener pour trouver la liquidité
 */

const https = require('https');
const fs = require('fs');

const CONFIG = {
  batchSize: 20,      // 20 tokens par batch
  delayMs: 1000,      // 1s entre batches
  minLiquidity: 1000, // $1k minimum pour signal (plus permissif)
  minVolume5m: 100,   // $100 volume 5min
};

const LIVE_FILE = 'data/clankerLiveSignals.json';
const DATA_FILE = 'data/allClankerSignals.json';
const ALERTS_FILE = 'data/alerts.json';
const PULSE_FILE = 'data/pulseSignals.json';

const now = Date.now();

function log(msg) {
  console.log(`[ENRICH] ${msg}`);
}

async function lookupToken(address) {
  return new Promise((resolve) => {
    const options = {
      hostname: 'api.dexscreener.com',
      path: `/latest/dex/tokens/${address}`,
      headers: { 'User-Agent': 'Mozilla/5.0' },
      timeout: 10000
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

async function main() {
  log('LURKER Mass Enricher');
  log(new Date().toISOString());
  
  // Charger les tokens live
  let liveTokens = [];
  try { 
    liveTokens = JSON.parse(fs.readFileSync(LIVE_FILE)); 
    log(`Loaded ${liveTokens.length} live tokens`);
  } catch(e) {
    log('No live tokens file');
    return;
  }
  
  // Charger existants
  let existing = [], alerts = [], pulse = [];
  try { existing = JSON.parse(fs.readFileSync(DATA_FILE)); } catch(e) {}
  try { alerts = JSON.parse(fs.readFileSync(ALERTS_FILE)); } catch(e) {}
  try { pulse = JSON.parse(fs.readFileSync(PULSE_FILE)); } catch(e) {}
  
  const existingMap = new Map(existing.map(t => [(t.contract_address || t.address)?.toLowerCase(), t]));
  
  // Trier par plus récent
  const sorted = liveTokens
    .filter(t => t.address && t.address.length === 42)
    .sort((a, b) => (b.detectedAt || 0) - (a.detectedAt || 0));
  
  // Prendre les 200 plus récents
  const toCheck = sorted.slice(0, 200);
  log(`Will check ${toCheck.length} most recent tokens`);
  
  let checked = 0;
  let found = 0;
  let newHot = 0;
  
  // Traiter par batches
  for (let i = 0; i < toCheck.length; i += CONFIG.batchSize) {
    const batch = toCheck.slice(i, i + CONFIG.batchSize);
    
    log(`Batch ${Math.floor(i/CONFIG.batchSize) + 1}/${Math.ceil(toCheck.length/CONFIG.batchSize)}...`);
    
    const results = await Promise.all(batch.map(async (token) => {
      const pairs = await lookupToken(token.address);
      const basePairs = pairs.filter(p => p.chainId === 'base');
      
      if (basePairs.length === 0) return null;
      
      // Prendre la meilleure paire
      const best = basePairs.sort((a, b) => 
        parseFloat(b.liquidity?.usd || 0) - parseFloat(a.liquidity?.usd || 0)
      )[0];
      
      const liq = parseFloat(best.liquidity?.usd || 0);
      const vol5m = parseFloat(best.volume?.m5 || 0);
      const mcap = parseFloat(best.fdv || best.marketCap || 0);
      
      if (liq >= CONFIG.minLiquidity && vol5m >= CONFIG.minVolume5m) {
        return {
          token,
          pair: best,
          liq,
          vol5m,
          mcap,
          score: calculateScore(liq, vol5m, mcap, best.txns?.m5)
        };
      }
      
      return null;
    }));
    
    for (const result of results) {
      checked++;
      if (!result) continue;
      
      found++;
      const { token, pair, liq, vol5m, mcap, score } = result;
      const addr = token.address.toLowerCase();
      
      const tokenData = {
        symbol: token.symbol,
        name: token.name,
        contract_address: token.address,
        pairAddress: pair.pairAddress,
        dexId: pair.dexId,
        liquidityUsd: Math.round(liq * 100) / 100,
        marketCap: Math.round(mcap * 100) / 100,
        volume5m: Math.round(vol5m * 100) / 100,
        volume24h: Math.round(parseFloat(pair.volume?.h24 || 0) * 100) / 100,
        priceUsd: pair.priceUsd,
        priceChange24h: pair.priceChange?.h24,
        enrichedAt: now,
        url: `https://dexscreener.com/base/${pair.pairAddress}`,
        score: score,
        status: score >= 70 ? 'HOT' : score >= 50 ? 'WARM' : 'COLD',
        source: 'mass-enrich'
      };
      
      const isNew = !existingMap.has(addr);
      
      if (isNew) {
        tokenData.detectedAt = now;
        existing.push(tokenData);
        log(`🆕 ${token.symbol}: $${Math.round(liq/1000)}k liq, $${Math.round(vol5m)} vol5m, Score: ${score}`);
      } else {
        Object.assign(existingMap.get(addr), tokenData);
      }
      
      existingMap.set(addr, tokenData);
      
      // Alertes
      if (score >= 50) {
        const alert = score >= 70
          ? `🔥🔥🔥 HOT: $${token.symbol} | $${Math.round(liq/1000)}k liq | Score: ${score}`
          : `⚡⚡ WARM: $${token.symbol} | $${Math.round(liq/1000)}k liq | Score: ${score}`;
        
        alerts.unshift({
          tokenAddress: token.address,
          symbol: token.symbol,
          status: tokenData.status,
          score: score,
          message: alert,
          sentAt: now
        });
        
        if (score >= 70) newHot++;
        
        if (score >= 70 && pulse.length < 20) {
          pulse.unshift({ ...tokenData, promotedAt: now });
        }
      }
    }
    
    // Attendre entre batches
    if (i + CONFIG.batchSize < toCheck.length) {
      await new Promise(r => setTimeout(r, CONFIG.delayMs));
    }
  }
  
  // Sauvegarder
  fs.writeFileSync(DATA_FILE, JSON.stringify(existing, null, 2));
  fs.writeFileSync(ALERTS_FILE, JSON.stringify(alerts.slice(0, 50), null, 2));
  fs.writeFileSync(PULSE_FILE, JSON.stringify(pulse.slice(0, 20), null, 2));
  
  log('');
  log('=== RESULTS ===');
  log(`Checked: ${checked}/${toCheck.length}`);
  log(`Found with liq: ${found}`);
  log(`New HOT: ${newHot}`);
  log(`Total DB: ${existing.length}`);
  log(`Alerts: ${alerts.length}`);
}

function calculateScore(liq, vol5m, mcap, txns) {
  let score = 0;
  
  // Liquidité (40 pts max)
  if (liq >= 100000) score += 40;
  else if (liq >= 50000) score += 35;
  else if (liq >= 20000) score += 30;
  else if (liq >= 10000) score += 25;
  else score += 20;
  
  // Volume 5m (30 pts max)
  if (vol5m >= 10000) score += 30;
  else if (vol5m >= 5000) score += 25;
  else if (vol5m >= 2000) score += 20;
  else score += 15;
  
  // Market cap ratio (20 pts max)
  if (mcap > 0 && liq > 0) {
    const ratio = liq / mcap;
    if (ratio > 0.5) score += 20;
    else if (ratio > 0.3) score += 15;
    else if (ratio > 0.1) score += 10;
    else score += 5;
  }
  
  // Transactions (10 pts max)
  const txnCount = (txns?.buys || 0) + (txns?.sells || 0);
  if (txnCount >= 50) score += 10;
  else if (txnCount >= 20) score += 7;
  else if (txnCount >= 10) score += 5;
  
  return score;
}

main().catch(err => {
  log(`Error: ${err.message}`);
  process.exit(1);
});
