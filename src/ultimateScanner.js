#!/usr/bin/env node
/**
 * LURKER Ultimate Scanner
 * Combine plusieurs sources pour trouver des signaux de pump
 * - DexScreener (gratuit)
 * - Base RPC (gratuit)
 * - BaseScan API (si clé disponible)
 * - Uniswap Subgraph (si accessible)
 */

const https = require('https');
const fs = require('fs');

const CONFIG = {
  // API Keys (optionnel mais recommandé)
  basescanApiKey: process.env.BASESCAN_API_KEY || null,
  
  // Critères pour les signaux
  minLiquidity: 1000,        // $1k minimum
  minVolume1h: 500,          // $500 volume 1h
  minPriceChange5m: 5,       // +5% sur 5min
  minPriceChange1h: 10,      // +10% sur 1h
  maxAgeHours: 24,           // Tokens de moins de 24h
  
  // Scoring
  hotThreshold: 70,
  warmThreshold: 50,
};

const DATA_FILE = 'data/allClankerSignals.json';
const ALERTS_FILE = 'data/alerts.json';
const PULSE_FILE = 'data/pulseSignals.json';
const now = Date.now();

function log(msg) {
  console.log(`[ULTIMATE] ${msg}`);
}

// ======= SOURCE 1: DexScreener Search (gratuit) =======
async function fetchDexScreenerSearch(terms) {
  const results = [];
  
  for (const term of terms) {
    try {
      const pairs = await new Promise((resolve) => {
        const options = {
          hostname: 'api.dexscreener.com',
          path: `/latest/dex/search?q=${term}`,
          headers: { 'User-Agent': 'Mozilla/5.0' },
          timeout: 15000
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
        req.setTimeout(15000, () => { req.destroy(); resolve([]); });
      });
      
      results.push(...pairs);
    } catch(e) {}
  }
  
  // Dédupliquer
  const seen = new Set();
  return results.filter(p => {
    if (seen.has(p.pairAddress)) return false;
    seen.add(p.pairAddress);
    return p.chainId === 'base';
  });
}

// ======= SOURCE 2: DexScreener Token Profiles (gratuit) =======
async function fetchTokenProfiles() {
  return new Promise((resolve) => {
    const options = {
      hostname: 'api.dexscreener.com',
      path: '/token-profiles/latest/v1',
      headers: { 'User-Agent': 'Mozilla/5.0' },
      timeout: 15000
    };
    
    const req = https.get(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve(json || []);
        } catch(e) { resolve([]); }
      });
    });
    
    req.on('error', () => resolve([]));
    req.setTimeout(15000, () => { req.destroy(); resolve([]); });
  });
}

// ======= SOURCE 3: BaseScan API (si clé disponible) =======
async function fetchBaseScanPools(apiKey) {
  if (!apiKey || apiKey === 'YourApiKeyToken') {
    log('BaseScan API key not configured, skipping...');
    return [];
  }
  
  // Uniswap V3 Factory
  const factory = '0x33128a8fC17869897dcE68Ed026d694621f6FDfD';
  
  return new Promise((resolve) => {
    const url = `/api?module=account&action=tokentx&contractaddress=${factory}&sort=desc&apikey=${apiKey}`;
    
    const req = https.get({ 
      hostname: 'api.basescan.org', 
      path: url,
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
            log(`BaseScan error: ${json.message || 'Unknown'}`);
            resolve([]);
          }
        } catch(e) { resolve([]); }
      });
    });
    
    req.on('error', (err) => {
      log(`BaseScan error: ${err.message}`);
      resolve([]);
    });
    req.setTimeout(15000, () => { req.destroy(); resolve([]); });
  });
}

// ======= ANALYSE DES TOKENS =======
function isViableToken(pair) {
  const token = pair.baseToken;
  if (!token) return false;
  
  // Ignorer les stables et tokens connus
  const ignoreSymbols = ['USDC', 'USDT', 'DAI', 'USDC.E', 'USDT.E'];
  if (ignoreSymbols.includes(token.symbol?.toUpperCase())) return false;
  
  // WETH est souvent le quote token, pas le base
  if (token.symbol === 'WETH' || token.address?.toLowerCase() === '0x4200000000000000000000000000000000000006') {
    return false;
  }
  
  return true;
}

function calculateSignalScore(pair) {
  let score = 0;
  let reasons = [];
  
  const liq = parseFloat(pair.liquidity?.usd || 0);
  const vol1h = parseFloat(pair.volume?.h1 || 0);
  const vol24h = parseFloat(pair.volume?.h24 || 0);
  const priceChange5m = pair.priceChange?.m5 || 0;
  const priceChange1h = pair.priceChange?.h1 || 0;
  const priceChange24h = pair.priceChange?.h24 || 0;
  const txns1h = (pair.txns?.h1?.buys || 0) + (pair.txns?.h1?.sells || 0);
  const buys1h = pair.txns?.h1?.buys || 0;
  const sells1h = pair.txns?.h1?.sells || 0;
  
  // Liquidité (30 pts max)
  if (liq >= 100000) { score += 30; reasons.push('💰 $100k+ liq'); }
  else if (liq >= 50000) { score += 25; reasons.push('💰 $50k+ liq'); }
  else if (liq >= 20000) { score += 20; reasons.push('💰 $20k+ liq'); }
  else if (liq >= 10000) { score += 15; reasons.push('💰 $10k+ liq'); }
  else if (liq >= 5000) { score += 10; reasons.push('💰 $5k+ liq'); }
  else if (liq >= 1000) { score += 5; }
  
  // Volume (25 pts max)
  if (vol1h >= 50000) { score += 25; reasons.push('💧 $50k+ vol 1h'); }
  else if (vol1h >= 20000) { score += 20; reasons.push('💧 $20k+ vol 1h'); }
  else if (vol1h >= 10000) { score += 15; reasons.push('💧 $10k+ vol 1h'); }
  else if (vol1h >= 5000) { score += 10; reasons.push('💧 $5k+ vol 1h'); }
  else if (vol1h >= 1000) { score += 5; }
  
  // Gains récents (25 pts max)
  if (priceChange5m >= 100) { score += 25; reasons.push('🚀 +100% 5m'); }
  else if (priceChange5m >= 50) { score += 20; reasons.push('🚀 +50% 5m'); }
  else if (priceChange5m >= 20) { score += 15; reasons.push('📈 +20% 5m'); }
  else if (priceChange5m >= 10) { score += 10; reasons.push('📈 +10% 5m'); }
  else if (priceChange5m >= 5) { score += 5; }
  
  // Gains 1h (15 pts max)
  if (priceChange1h >= 100) { score += 15; reasons.push('🌙 +100% 1h'); }
  else if (priceChange1h >= 50) { score += 10; reasons.push('🌙 +50% 1h'); }
  else if (priceChange1h >= 20) { score += 5; reasons.push('+20% 1h'); }
  
  // Ratio buy/sell (5 pts max)
  if (sells1h > 0 && buys1h / sells1h > 3) { score += 5; reasons.push('🐂 3:1 buy/sell'); }
  else if (sells1h > 0 && buys1h / sells1h > 2) { score += 3; reasons.push('🐂 2:1 buy/sell'); }
  else if (buys1h > sells1h) { score += 1; }
  
  return { score, reasons, metrics: { liq, vol1h, vol24h, priceChange5m, priceChange1h, priceChange24h, txns1h, buys1h, sells1h } };
}

// ======= MAIN =======
async function main() {
  log('LURKER Ultimate Scanner');
  log(new Date().toISOString());
  log('Fetching signals from multiple sources...\n');
  
  // Charger existants
  let existing = [], alerts = [], pulse = [];
  try { existing = JSON.parse(fs.readFileSync(DATA_FILE)); } catch(e) {}
  try { alerts = JSON.parse(fs.readFileSync(ALERTS_FILE)); } catch(e) {}
  try { pulse = JSON.parse(fs.readFileSync(PULSE_FILE)); } catch(e) {}
  
  const existingMap = new Map(existing.map(t => [(t.contract_address || t.address)?.toLowerCase(), t]));
  
  // ===== SOURCE 1: DexScreener Search =====
  log('[1/3] DexScreener Search...');
  const searchTerms = ['WETH', 'USDC', 'ETH', 'BASE', 'CLANKER'];
  const dexPairs = await fetchDexScreenerSearch(searchTerms);
  log(`  Found ${dexPairs.length} pairs on Base`);
  
  // ===== SOURCE 2: Token Profiles =====
  log('[2/3] Token Profiles...');
  const profiles = await fetchTokenProfiles();
  const baseProfiles = profiles.filter(p => p.chainId === 'base');
  log(`  Found ${baseProfiles.length} Base profiles`);
  
  // ===== SOURCE 3: BaseScan (si clé) =====
  log('[3/3] BaseScan API...');
  const baseScanTxs = await fetchBaseScanPools(CONFIG.basescanApiKey);
  log(`  Found ${baseScanTxs.length} transactions`);
  
  // ===== ANALYSE =====
  log('\n[ANALYSIS] Processing tokens...');
  
  // Combiner toutes les sources
  const allPairs = [...dexPairs];
  
  // Ajouter les profiles comme pairs si pas déjà présents
  for (const profile of baseProfiles) {
    if (!allPairs.find(p => p.baseToken?.address === profile.tokenAddress)) {
      allPairs.push({
        baseToken: { symbol: profile.symbol, name: profile.name, address: profile.tokenAddress },
        chainId: 'base',
        profile: true
      });
    }
  }
  
  // Filtrer et scorer
  const viablePairs = allPairs.filter(isViableToken);
  log(`  ${viablePairs.length} viable tokens`);
  
  const signals = [];
  
  for (const pair of viablePairs) {
    const { score, reasons, metrics } = calculateSignalScore(pair);
    
    if (score >= CONFIG.warmThreshold) {
      const age = pair.pairCreatedAt ? (now - pair.pairCreatedAt) / (1000 * 60 * 60) : 999;
      
      signals.push({
        pair,
        score,
        reasons,
        metrics,
        ageHours: age
      });
    }
  }
  
  // Trier par score
  signals.sort((a, b) => b.score - a.score);
  
  log(`\n[RESULTS] Found ${signals.length} signals`);
  
  // Traiter les signaux
  let newSignals = 0;
  let newAlerts = 0;
  let hotCount = 0;
  let warmCount = 0;
  
  for (const signal of signals) {
    const pair = signal.pair;
    const token = pair.baseToken;
    const addr = token.id || token.address;
    
    if (!addr) continue;
    
    const tokenData = {
      symbol: token.symbol,
      name: token.name,
      contract_address: addr,
      pairAddress: pair.pairAddress,
      dexId: pair.dexId,
      liquidityUsd: Math.round(signal.metrics.liq * 100) / 100,
      marketCap: Math.round(parseFloat(pair.fdv || pair.marketCap || 0) * 100) / 100,
      volume5m: Math.round(parseFloat(pair.volume?.m5 || 0) * 100) / 100,
      volume1h: Math.round(signal.metrics.vol1h * 100) / 100,
      volume24h: Math.round(signal.metrics.vol24h * 100) / 100,
      priceUsd: pair.priceUsd,
      priceChange5m: signal.metrics.priceChange5m,
      priceChange1h: signal.metrics.priceChange1h,
      priceChange24h: signal.metrics.priceChange24h,
      txns1h: signal.metrics.txns1h,
      score: signal.score,
      reasons: signal.reasons,
      status: signal.score >= CONFIG.hotThreshold ? 'HOT' : 'WARM',
      source: 'ultimate-scanner',
      detectedAt: now,
      url: `https://dexscreener.com/base/${pair.pairAddress || addr}`
    };
    
    const isNew = !existingMap.has(addr.toLowerCase());
    
    if (isNew) {
      existing.push(tokenData);
      newSignals++;
    } else {
      Object.assign(existingMap.get(addr.toLowerCase()), tokenData);
    }
    
    existingMap.set(addr.toLowerCase(), tokenData);
    
    // Compter
    if (tokenData.status === 'HOT') hotCount++;
    else warmCount++;
    
    // Log
    const emoji = signal.score >= CONFIG.hotThreshold ? '🚨' : '🔥';
    log(`${emoji} $${token.symbol} | Score: ${signal.score} | ${signal.reasons.join(', ')}`);
    
    // Alertes
    const alertMsg = signal.score >= CONFIG.hotThreshold
      ? `🚨🚨🚨 HOT SIGNAL: $${token.symbol} | Score: ${signal.score} | ${signal.reasons.slice(0, 2).join(', ')}`
      : `🔥 WARM SIGNAL: $${token.symbol} | Score: ${signal.score}`;
    
    // Éviter les doublons d'alertes
    const alreadyAlerted = alerts.find(a => a.tokenAddress?.toLowerCase() === addr.toLowerCase() && a.score === signal.score);
    
    if (!alreadyAlerted) {
      alerts.unshift({
        tokenAddress: addr,
        symbol: token.symbol,
        status: tokenData.status,
        score: signal.score,
        message: alertMsg,
        reasons: signal.reasons,
        sentAt: now
      });
      newAlerts++;
      
      if (signal.score >= CONFIG.hotThreshold && pulse.length < 20) {
        pulse.unshift({ ...tokenData, promotedAt: now });
      }
    }
  }
  
  // Sauvegarder
  fs.writeFileSync(DATA_FILE, JSON.stringify(existing, null, 2));
  fs.writeFileSync(ALERTS_FILE, JSON.stringify(alerts.slice(0, 50), null, 2));
  fs.writeFileSync(PULSE_FILE, JSON.stringify(pulse.slice(0, 20), null, 2));
  
  log('');
  log('=== SUMMARY ===');
  log(`New signals: ${newSignals}`);
  log(`New alerts: ${newAlerts}`);
  log(`HOT: ${hotCount} | WARM: ${warmCount}`);
  log(`Total DB: ${existing.length}`);
  log(`Total alerts: ${alerts.length}`);
  
  if (signals.length === 0) {
    log('');
    log('⚠️  No pump signals detected.');
    log('Market might be quiet or criteria too strict.');
    log('');
    log('To improve detection:');
    log('1. Add BaseScan API key: export BASESCAN_API_KEY=your_key');
    log('2. Lower criteria in CONFIG');
    log('3. Wait for market activity');
  }
}

main().catch(err => {
  log(`Fatal error: ${err.message}`);
  process.exit(1);
});
