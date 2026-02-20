#!/usr/bin/env node
/**
 * LURKER Pump Detector
 * Détecte les tokens en train de pumper (momentum trading)
 * Critères: +gains récents, liquidité confirmée, volume croissant
 */

const https = require('https');
const fs = require('fs');

const CONFIG = {
  minPriceChange1h: 5,      // +5% minimum sur 1h
  minPriceChange5m: 1,      // +1% sur 5min
  minLiquidity: 1000,       // $1k minimum
  minVolume1h: 500,         // $500 volume 1h
  maxAgeHours: 48,
  scanLimit: 100
};

const DATA_FILE = 'data/allClankerSignals.json';
const ALERTS_FILE = 'data/alerts.json';
const PULSE_FILE = 'data/pulseSignals.json';
const now = Date.now();

function log(msg) {
  console.log(`[PUMP] ${msg}`);
}

// Chercher les tokens sur Base avec bonne volatilité
async function fetchTrendingTokens() {
  const pairs = [];
  
  // Plusieurs recherches pour couvrir le marché
  const searches = ['WETH', 'USDC', 'ETH', 'BASE'];
  
  for (const term of searches) {
    try {
      const result = await new Promise((resolve) => {
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
      
      pairs.push(...result);
    } catch(e) {}
  }
  
  // Dédupliquer
  const seen = new Set();
  return pairs.filter(p => {
    if (seen.has(p.pairAddress)) return false;
    seen.add(p.pairAddress);
    return p.chainId === 'base';
  });
}

// Vérifier si token est "viable" (pas un scam évident)
function isViableToken(pair) {
  const token = pair.baseToken;
  const quote = pair.quoteToken;
  
  // Ignorer les stables uniquement
  const ignoreSymbols = ['USDC', 'USDT', 'DAI', 'USDC.E'];
  if (ignoreSymbols.includes(token.symbol)) return false;
  
  // Le token doit avoir une vraie liquidité
  const liq = parseFloat(pair.liquidity?.usd || 0);
  if (liq < CONFIG.minLiquidity) return false;
  
  // Doit avoir du volume
  const vol1h = parseFloat(pair.volume?.h1 || 0);
  if (vol1h < CONFIG.minVolume1h) return false;
  
  return true;
}

// Calculer le score de pump
function calculatePumpScore(pair) {
  let score = 0;
  let reasons = [];
  
  const priceChange5m = pair.priceChange?.m5 || 0;
  const priceChange1h = pair.priceChange?.h1 || 0;
  const priceChange24h = pair.priceChange?.h24 || 0;
  const liq = parseFloat(pair.liquidity?.usd || 0);
  const vol1h = parseFloat(pair.volume?.h1 || 0);
  const vol5m = parseFloat(pair.volume?.m5 || 0);
  const txns1h = (pair.txns?.h1?.buys || 0) + (pair.txns?.h1?.sells || 0);
  const buys1h = pair.txns?.h1?.buys || 0;
  const sells1h = pair.txns?.h1?.sells || 0;
  
  // Gains récents (40 pts)
  if (priceChange5m >= 100) { score += 40; reasons.push('🚀 +100% 5m'); }
  else if (priceChange5m >= 50) { score += 35; reasons.push('🚀 +50% 5m'); }
  else if (priceChange5m >= 20) { score += 30; reasons.push('📈 +20% 5m'); }
  else if (priceChange5m >= 10) { score += 20; reasons.push('📈 +10% 5m'); }
  else if (priceChange5m >= 5) { score += 15; reasons.push('+5% 5m'); }
  
  // Gains 1h (20 pts) - momentum
  if (priceChange1h >= 100) { score += 20; reasons.push('🌙 +100% 1h'); }
  else if (priceChange1h >= 50) { score += 15; reasons.push('🌙 +50% 1h'); }
  else if (priceChange1h >= 20) { score += 10; reasons.push('+20% 1h'); }
  
  // Volume intense (20 pts)
  if (vol1h >= 100000) { score += 20; reasons.push('💧 $100k+ vol 1h'); }
  else if (vol1h >= 50000) { score += 15; reasons.push('💧 $50k+ vol 1h'); }
  else if (vol1h >= 20000) { score += 10; reasons.push('💧 $20k+ vol 1h'); }
  
  // Liquidité saine (10 pts)
  if (liq >= 100000) { score += 10; reasons.push('💰 $100k+ liq'); }
  else if (liq >= 50000) { score += 8; reasons.push('💰 $50k+ liq'); }
  else if (liq >= 20000) { score += 5; reasons.push('💰 $20k+ liq'); }
  
  // Ratio buy/sell favorable (10 pts)
  if (sells1h > 0 && buys1h / sells1h > 3) { score += 10; reasons.push('🐂 3:1 buy/sell'); }
  else if (sells1h > 0 && buys1h / sells1h > 2) { score += 7; reasons.push('🐂 2:1 buy/sell'); }
  else if (buys1h > sells1h) { score += 5; reasons.push('🐂 More buys'); }
  
  return { score, reasons, metrics: { priceChange5m, priceChange1h, priceChange24h, liq, vol1h, txns1h, buys1h, sells1h } };
}

async function main() {
  log('LURKER Pump Detector');
  log(new Date().toISOString());
  log('Looking for tokens with MOMENTUM...\n');
  
  // Charger existants
  let existing = [], alerts = [], pulse = [];
  try { existing = JSON.parse(fs.readFileSync(DATA_FILE)); } catch(e) {}
  try { alerts = JSON.parse(fs.readFileSync(ALERTS_FILE)); } catch(e) {}
  try { pulse = JSON.parse(fs.readFileSync(PULSE_FILE)); } catch(e) {}
  
  const existingMap = new Map(existing.map(t => [(t.contract_address || t.address)?.toLowerCase(), t]));
  
  // Fetch trending
  log('Fetching trending tokens...');
  const pairs = await fetchTrendingTokens();
  log(`Found ${pairs.length} pairs on Base`);
  
  // Filtrer les viables
  log('Checking all pairs...');
  for (const p of pairs.slice(0, 5)) {
    const liq = parseFloat(p.liquidity?.usd || 0);
    const vol1h = parseFloat(p.volume?.h1 || 0);
    const change5m = p.priceChange?.m5 || 0;
    log(`  ${p.baseToken?.symbol}: $${Math.round(liq)} liq, $${Math.round(vol1h)} vol1h, ${change5m.toFixed(1)}% 5m`);
  }
  
  const viable = pairs.filter(isViableToken);
  log(`${viable.length} viable tokens (>$1k liq, >$500 vol)`);
  
  // Analyser chaque token
  const pumpSignals = [];
  
  for (const pair of viable) {
    const { score, reasons, metrics } = calculatePumpScore(pair);
    
    if (score >= 40) { // Minimum 40 pour signal
      const age = pair.pairCreatedAt ? (now - pair.pairCreatedAt) / (1000 * 60 * 60) : 999;
      
      pumpSignals.push({
        pair,
        score,
        reasons,
        metrics,
        ageHours: age
      });
    }
  }
  
  // Trier par score
  pumpSignals.sort((a, b) => b.score - a.score);
  
  log(`\n=== PUMP SIGNALS: ${pumpSignals.length} ===`);
  
  let newSignals = 0;
  let newAlerts = 0;
  
  for (const signal of pumpSignals.slice(0, 20)) {
    const pair = signal.pair;
    const token = pair.baseToken;
    const addr = token.id || token.address;
    
    const tokenData = {
      symbol: token.symbol,
      name: token.name,
      contract_address: addr,
      pairAddress: pair.pairAddress,
      dexId: pair.dexId,
      liquidityUsd: Math.round(signal.metrics.liq * 100) / 100,
      marketCap: Math.round(parseFloat(pair.fdv || pair.marketCap || 0) * 100) / 100,
      volume5m: Math.round(signal.metrics.vol1h / 12 * 100) / 100, // Approx
      volume1h: Math.round(signal.metrics.vol1h * 100) / 100,
      volume24h: Math.round(parseFloat(pair.volume?.h24 || 0) * 100) / 100,
      priceUsd: pair.priceUsd,
      priceChange5m: signal.metrics.priceChange5m,
      priceChange1h: signal.metrics.priceChange1h,
      priceChange24h: signal.metrics.priceChange24h,
      txns1h: signal.metrics.txns1h,
      score: signal.score,
      reasons: signal.reasons,
      status: signal.score >= 70 ? 'HOT' : signal.score >= 50 ? 'WARM' : 'COLD',
      source: 'pump-detector',
      detectedAt: now,
      url: `https://dexscreener.com/base/${pair.pairAddress}`
    };
    
    const isNew = !existingMap.has(addr.toLowerCase());
    
    if (isNew) {
      existing.push(tokenData);
      newSignals++;
    } else {
      Object.assign(existingMap.get(addr.toLowerCase()), tokenData);
    }
    
    existingMap.set(addr.toLowerCase(), tokenData);
    
    // Log
    const emoji = signal.score >= 70 ? '🚨' : signal.score >= 50 ? '🔥' : '⚡';
    log(`${emoji} $${token.symbol} | Score: ${signal.score} | +${signal.metrics.priceChange5m.toFixed(1)}% 5m`);
    log(`   ${signal.reasons.join(' | ')}`);
    
    // Alertes pour les meilleurs
    if (signal.score >= 50) {
      const alertMsg = signal.score >= 70
        ? `🚨🚨🚨 PUMP ALERT: $${token.symbol} | +${signal.metrics.priceChange5m.toFixed(0)}% | Score: ${signal.score}`
        : `🔥 PUMP: $${token.symbol} | +${signal.metrics.priceChange5m.toFixed(0)}% 5m | Score: ${signal.score}`;
      
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
      
      if (signal.score >= 70 && pulse.length < 20) {
        pulse.unshift({ ...tokenData, promotedAt: now });
      }
    }
  }
  
  // Sauvegarder
  fs.writeFileSync(DATA_FILE, JSON.stringify(existing, null, 2));
  fs.writeFileSync(ALERTS_FILE, JSON.stringify(alerts.slice(0, 50), null, 2));
  fs.writeFileSync(PULSE_FILE, JSON.stringify(pulse.slice(0, 20), null, 2));
  
  log('');
  log('=== RESULTS ===');
  log(`New pump signals: ${newSignals}`);
  log(`New alerts: ${newAlerts}`);
  log(`Total DB: ${existing.length}`);
  log(`Current alerts: ${alerts.length}`);
  
  if (pumpSignals.length === 0) {
    log('');
    log('⚠️  No pumps detected right now.');
    log('Market might be quiet or criteria too strict.');
  }
}

main().catch(err => {
  log(`Error: ${err.message}`);
  process.exit(1);
});
