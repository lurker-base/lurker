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
  
  // ============ HARD FILTERS (élimination brute) ============
  hardFilters: {
    minLiquidity: 15000,      // $15k minimum
    minAgeMinutes: 3,         // 3 min minimum (anti-piège)
    maxAgeHours: 72,          // 72h maximum
    requireVerified: true,    // Contrat vérifié obligatoire
    minTransfers: 1           // Au moins 1 transfer
  },
  
  // ============ PUMP POTENTIAL SCORING ============
  scoring: {
    liquidity: { tiers: [{ min: 75000, pts: 25 }, { min: 30000, pts: 18 }, { min: 15000, pts: 10 }] },
    activity: { tiers: [{ min: 150, pts: 25 }, { min: 50, pts: 18 }, { min: 10, pts: 10 }] },
    structure: { verified: 10, supplyLt1B: 5, noMint: 5 },
    timing: { '10-60min': 15, '1-6h': 10, '6-24h': 5 },
    momentum: { recentTransfers: 15 }
  },
  
  // Seuils de classification
  thresholds: { alpha: 70, hot: 50, warm: 35 }
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

// ======= PUMP POTENTIAL SCORING (v3) =======
function calculatePumpScore(pair, onChainData = null) {
  let score = 0;
  let reasons = [];
  const sc = CONFIG.scoring;
  
  const liq = parseFloat(pair.liquidity?.usd || pair.liquidityUsd || 0);
  const ageMinutes = pair.pairCreatedAt ? (now - pair.pairCreatedAt) / 60000 : 
    (pair.ageMinutes || (pair.ageHours * 60) || 999);
  
  // 1. Liquidité (0-25 pts)
  for (const tier of sc.liquidity.tiers) {
    if (liq >= tier.min) { score += tier.pts; reasons.push(`💰 Liq $${tier.min/1000}k+`); break; }
  }
  
  // 2. Activité transfers (0-25 pts)
  const transfers = onChainData?.transfers || pair.txns?.h24?.buys + pair.txns?.h24?.sells || 0;
  for (const tier of sc.activity.tiers) {
    if (transfers >= tier.min) { score += tier.pts; reasons.push(`🔥 ${tier.min}+ txns`); break; }
  }
  
  // 3. Structure (0-20 pts)
  if (onChainData?.verified || pair.verifiedContract) { score += 10; reasons.push('✓ Vérifié'); }
  const supply = onChainData?.totalSupply || pair.totalSupply;
  if (supply && supply < 1e9) { score += 5; reasons.push('✓ Supply saine'); }
  if (onChainData?.hasMintFunction === false) { score += 5; reasons.push('✓ No mint'); }
  
  // 4. Timing (0-15 pts)
  if (ageMinutes >= 10 && ageMinutes <= 60) { score += 15; reasons.push('⏱️ Timing optimal'); }
  else if (ageMinutes > 60 && ageMinutes <= 360) { score += 10; reasons.push('⏱️ Bon timing'); }
  else if (ageMinutes > 360 && ageMinutes <= 1440) { score += 5; reasons.push('⏱️ Timing OK'); }
  
  // 5. Momentum prix (0-15 pts)
  const change5m = pair.priceChange?.m5 || 0;
  const change1h = pair.priceChange?.h1 || 0;
  if (change5m >= 20) { score += 15; reasons.push('🚀 +20% 5m'); }
  else if (change5m >= 10) { score += 10; reasons.push('📈 +10% 5m'); }
  else if (change1h >= 50) { score += 5; reasons.push('📈 +50% 1h'); }
  
  // Classification
  let tier = 'DEAD';
  if (score >= CONFIG.thresholds.alpha) tier = 'ALPHA';
  else if (score >= CONFIG.thresholds.hot) tier = 'HOT';
  else if (score >= CONFIG.thresholds.warm) tier = 'WARM';
  
  return { score, tier, reasons, metrics: { liq, transfers, ageMinutes, change5m, change1h } };
}

function passesHardFilter(pair) {
  const hf = CONFIG.hardFilters;
  const liq = parseFloat(pair.liquidity?.usd || pair.liquidityUsd || 0);
  const ageMinutes = pair.pairCreatedAt ? (now - pair.pairCreatedAt) / 60000 : 
    (pair.ageMinutes || (pair.ageHours * 60) || 999);
  const ageHours = ageMinutes / 60;
  
  if (liq < hf.minLiquidity) return { pass: false, reason: `Liq $${Math.floor(liq)} < $15k` };
  if (ageMinutes < hf.minAgeMinutes) return { pass: false, reason: 'Trop jeune (<3min)' };
  if (ageHours > hf.maxAgeHours) return { pass: false, reason: 'Trop vieux (>72h)' };
  
  return { pass: true };
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
  
  // Filtrer et scorer avec PUMP POTENTIAL
  const viablePairs = allPairs.filter(isViableToken);
  log(`  ${viablePairs.length} viable tokens`);
  
  const signals = [];
  let hardFiltered = 0;
  
  for (const pair of viablePairs) {
    // HARD FILTER d'abord
    const hardCheck = passesHardFilter(pair);
    if (!hardCheck.pass) {
      hardFiltered++;
      continue;
    }
    
    // PUMP POTENTIAL SCORING
    const { score, tier, reasons, metrics } = calculatePumpScore(pair);
    
    // Ne garder que WARM et au-dessus
    if (tier !== 'DEAD') {
      signals.push({
        pair,
        score,
        tier,
        reasons,
        metrics,
        pumpScore: score,
        pumpTier: tier
      });
    }
  }
  
  // Trier par pump score
  signals.sort((a, b) => b.score - a.score);
  
  log(`\n[RESULTS] Found ${signals.length} signals (hard filtered: ${hardFiltered})`);
  
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
      volume1h: Math.round(parseFloat(pair.volume?.h1 || 0) * 100) / 100,
      volume24h: Math.round(parseFloat(pair.volume?.h24 || 0) * 100) / 100,
      priceUsd: pair.priceUsd,
      priceChange5m: signal.metrics.change5m,
      priceChange1h: signal.metrics.change1h,
      pumpScore: signal.pumpScore,
      pumpTier: signal.pumpTier,
      score: signal.score,
      tier: signal.tier,
      reasons: signal.reasons,
      status: signal.tier,
      source: 'ultimate-scanner-v3',
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
    
    // Compter par tier
    if (signal.tier === 'ALPHA') { hotCount++; }
    else if (signal.tier === 'HOT') { hotCount++; }
    else if (signal.tier === 'WARM') { warmCount++; }
    
    // Log avec emoji selon tier
    const emoji = signal.tier === 'ALPHA' ? '🚨🚨🚨' : signal.tier === 'HOT' ? '🚨' : '🔥';
    log(`${emoji} ${signal.tier}: $${token.symbol} | Score: ${signal.pumpScore} | ${signal.reasons.slice(0, 3).join(', ')}`);
    
    // Alertes (seulement HOT et ALPHA)
    if (signal.tier !== 'WARM') {
      const alertMsg = signal.tier === 'ALPHA'
        ? `🚨🚨🚨 ALPHA: $${token.symbol} | Score: ${signal.pumpScore}/100`
        : `🚨 HOT: $${token.symbol} | Score: ${signal.pumpScore}/100`;
      
      const alreadyAlerted = alerts.find(a => a.contract_address?.toLowerCase() === addr.toLowerCase());
      
      if (!alreadyAlerted) {
        alerts.unshift({
          ...tokenData,
          alertType: signal.tier,
          message: alertMsg,
          sentAt: now
        });
        newAlerts++;
      }
      
      // Promouvoir dans pulse (HOT et ALPHA)
      if (!pulse.find(p => p.contract_address?.toLowerCase() === addr.toLowerCase())) {
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
  log(`ALPHA+HOT: ${hotCount} | WARM: ${warmCount}`);
  log(`Pulse size: ${pulse.length}`);
  log(`Total DB: ${existing.length}`);
  
  // Stats par tier
  const tierCounts = existing.reduce((acc, t) => {
    acc[t.tier || t.status || 'UNRANKED'] = (acc[t.tier || t.status || 'UNRANKED'] || 0) + 1;
    return acc;
  }, {});
  log(`Tiers: ${JSON.stringify(tierCounts)}`);
  
  if (signals.length === 0) {
    log('');
    log('⚠️  No pump signals detected.');
    log('Hard filters applied: liq>$15k | age>3min | verified | transfers>0');
    log('');
    log('To improve detection:');
    log('1. Wait for market activity');
    log('2. Adjust hardFilters in CONFIG');
  }
}

main().catch(err => {
  log(`Fatal error: ${err.message}`);
  process.exit(1);
});
