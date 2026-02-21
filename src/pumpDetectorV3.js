#!/usr/bin/env node
/**
 * LURKER Pump Detector v3
 * Score "Pump Potential" multi-critères
 * Hard filters + scoring probabiliste
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

// Load env
const envPath = path.join(__dirname, '..', '.env.local');
if (fs.existsSync(envPath)) {
  const env = fs.readFileSync(envPath, 'utf8');
  env.split('\n').forEach(line => {
    const m = line.match(/^([A-Z_]+)=(.+)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, '');
  });
}

const BASESCAN_KEY = process.env.BASESCAN_API_KEY;
const DATA_FILE = path.join(__dirname, '..', 'data', 'allClankerSignals.json');
const PULSE_FILE = path.join(__dirname, '..', 'data', 'pulseSignals.json');
const ALERTS_FILE = path.join(__dirname, '..', 'data', 'alerts.json');

const now = Date.now();

// ============ HARD FILTERS ============
const HARD_FILTERS = {
  minLiquidity: 15000,      // $15k minimum
  minAgeMinutes: 3,         // 3 min minimum (anti-piège)
  maxAgeHours: 72,          // 72h maximum
  requireVerified: true,    // Contrat vérifié obligatoire
  minTransfers: 1           // Au moins 1 transfer
};

// ============ SCORING CONFIG ============
const SCORING = {
  // Liquidité (0-25 pts)
  liquidity: {
    tiers: [
      { min: 75000, pts: 25 },
      { min: 30000, pts: 18 },
      { min: 15000, pts: 10 }
    ]
  },
  // Activité transfers (0-25 pts)
  activity: {
    tiers: [
      { min: 150, pts: 25 },
      { min: 50, pts: 18 },
      { min: 10, pts: 10 }
    ]
  },
  // Structure contrat (0-20 pts)
  structure: {
    verified: 10,
    supplyLt1B: 5,
    noMint: 5
  },
  // Timing (0-15 pts)
  timing: {
    '10-60min': 15,
    '1-6h': 10,
    '6-24h': 5
  },
  // Momentum (0-15 pts) - transfers récents
  momentum: {
    recentTransfers: 15  // Dans les 10 dernières minutes
  }
};

// Seuils de classification
const THRESHOLDS = {
  alpha: 70,   // Telegram + priorité max
  hot: 50,     // pulse.html
  warm: 35     // live.html uniquement
};

function log(msg) {
  console.log(`[PUMP] ${msg}`);
}

async function baseScanCall(module, action, params = {}) {
  return new Promise((resolve) => {
    if (!BASESCAN_KEY || BASESCAN_KEY === 'YourApiKeyToken') {
      resolve(null);
      return;
    }
    
    const query = Object.entries({ ...params, module, action, apikey: BASESCAN_KEY })
      .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
      .join('&');
    
    const req = https.get({
      hostname: 'api.basescan.org',
      path: `/api?${query}`,
      timeout: 10000,
      headers: { 'User-Agent': 'Mozilla/5.0' }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve(json.status === '1' ? json.result : null);
        } catch(e) { resolve(null); }
      });
    });
    
    req.on('error', () => resolve(null));
    req.setTimeout(10000, () => { req.destroy(); resolve(null); });
  });
}

async function fetchDexScreener() {
  return new Promise((resolve) => {
    const req = https.get({
      hostname: 'api.dexscreener.com',
      path: '/latest/dex/search?q=WETH',
      headers: { 'User-Agent': 'Mozilla/5.0' },
      timeout: 15000
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve((json.pairs || []).filter(p => p.chainId === 'base'));
        } catch(e) { resolve([]); }
      });
    });
    req.on('error', () => resolve([]));
    req.setTimeout(15000, () => { req.destroy(); resolve([]); });
  });
}

async function getTokenOnChainData(address) {
  const [txList, abi, supply] = await Promise.all([
    baseScanCall('account', 'tokentx', { contractaddress: address, page: 1, offset: 100 }),
    baseScanCall('contract', 'getabi', { address }),
    baseScanCall('stats', 'tokensupply', { contractaddress: address })
  ]);
  
  const transfers = Array.isArray(txList) ? txList : [];
  const uniqueWallets = new Set(transfers.map(t => t.from)).size;
  
  // Transfers récents (< 10 min)
  const recentTransfers = transfers.filter(t => {
    const txTime = parseInt(t.timeStamp) * 1000;
    return (now - txTime) < 600000; // 10 min
  }).length;
  
  return {
    transfers: transfers.length,
    uniqueWallets,
    recentTransfers,
    verified: abi !== null && abi !== 'Contract source code not verified',
    totalSupply: supply ? parseFloat(supply) : null,
    hasMintFunction: abi && abi.includes('mint')
  };
}

function calculatePumpScore(token, onChain) {
  let score = 0;
  let reasons = [];
  
  const liq = parseFloat(token.liquidityUsd || token.liquidity || 0);
  const ageMinutes = token.ageMinutes || (token.ageHours * 60) || 
    (token.detectedAt ? (now - token.detectedAt) / 60000 : 999);
  
  // 1. Liquidité (0-25)
  for (const tier of SCORING.liquidity.tiers) {
    if (liq >= tier.min) { score += tier.pts; reasons.push(`💰 Liq $${tier.min/1000}k+`); break; }
  }
  
  // 2. Activité (0-25)
  const transfers = onChain?.transfers || 0;
  for (const tier of SCORING.activity.tiers) {
    if (transfers >= tier.min) { score += tier.pts; reasons.push(`🔥 ${tier.min}+ transfers`); break; }
  }
  
  // 3. Structure (0-20)
  if (onChain?.verified) { score += 10; reasons.push('✓ Vérifié'); }
  if (onChain?.totalSupply && onChain.totalSupply < 1e9) { score += 5; reasons.push('✓ Supply saine'); }
  if (onChain?.hasMintFunction === false) { score += 5; reasons.push('✓ No mint'); }
  
  // 4. Timing (0-15)
  if (ageMinutes >= 10 && ageMinutes <= 60) { score += 15; reasons.push('⏱️ Timing optimal'); }
  else if (ageMinutes > 60 && ageMinutes <= 360) { score += 10; reasons.push('⏱️ Bon timing'); }
  else if (ageMinutes > 360 && ageMinutes <= 1440) { score += 5; reasons.push('⏱️ Timing OK'); }
  
  // 5. Momentum (0-15)
  if (onChain?.recentTransfers >= 5) { score += 15; reasons.push('🚀 Momentum'); }
  else if (onChain?.recentTransfers > 0) { score += 5; reasons.push('📈 Activité récente'); }
  
  // Classification
  let tier = 'DEAD';
  if (score >= THRESHOLDS.alpha) tier = 'ALPHA';
  else if (score >= THRESHOLDS.hot) tier = 'HOT';
  else if (score >= THRESHOLDS.warm) tier = 'WARM';
  
  return { score, tier, reasons, details: { liq, transfers, ageMinutes, ...onChain } };
}

function passesHardFilter(token, onChain) {
  const liq = parseFloat(token.liquidityUsd || token.liquidity || 0);
  const ageMinutes = token.ageMinutes || (token.detectedAt ? (now - token.detectedAt) / 60000 : 999);
  const ageHours = ageMinutes / 60;
  
  if (liq < HARD_FILTERS.minLiquidity) return { pass: false, reason: `Liq $${Math.floor(liq)} < $15k` };
  if (ageMinutes < HARD_FILTERS.minAgeMinutes) return { pass: false, reason: 'Trop jeune (< 3min)' };
  if (ageHours > HARD_FILTERS.maxAgeHours) return { pass: false, reason: 'Trop vieux (> 72h)' };
  if (HARD_FILTERS.requireVerified && !onChain?.verified) return { pass: false, reason: 'Non vérifié' };
  if ((onChain?.transfers || 0) < HARD_FILTERS.minTransfers) return { pass: false, reason: '0 transfers' };
  
  return { pass: true };
}

async function main() {
  log('LURKER Pump Detector v3');
  log(new Date().toISOString());
  
  // Charger données
  let existing = [], pulse = [], alerts = [];
  try { existing = JSON.parse(fs.readFileSync(DATA_FILE)); } catch(e) {}
  try { pulse = JSON.parse(fs.readFileSync(PULSE_FILE)); } catch(e) {}
  try { alerts = JSON.parse(fs.readFileSync(ALERTS_FILE)); } catch(e) {}
  
  // Récupérer tokens depuis DexScreener
  log('Fetching fresh data...');
  const pairs = await fetchDexScreener();
  log(`Found ${pairs.length} Base pairs`);
  
  let processed = 0;
  let hardFiltered = 0;
  let newSignals = 0;
  
  for (const pair of pairs.slice(0, 20)) {
    const token = pair.baseToken;
    const addr = token.address;
    if (!addr) continue;
    
    // On-chain data
    const onChain = await getTokenOnChainData(addr);
    
    // Hard filter
    const hardCheck = passesHardFilter(pair, onChain);
    if (!hardCheck.pass) {
      hardFiltered++;
      continue;
    }
    
    // Calculate pump score
    const { score, tier, reasons, details } = calculatePumpScore(pair, onChain);
    
    processed++;
    
    // Skip DEAD
    if (tier === 'DEAD') continue;
    
    // Build signal
    const signal = {
      symbol: token.symbol,
      name: token.name,
      contract_address: addr,
      pairAddress: pair.pairAddress,
      priceUsd: pair.priceUsd,
      marketCap: pair.fdv || pair.marketCap,
      liquidityUsd: parseFloat(pair.liquidity?.usd || 0),
      volume24h: parseFloat(pair.volume?.h24 || 0),
      pumpScore: score,
      tier,
      reasons,
      onChain: details,
      detectedAt: now,
      url: `https://dexscreener.com/base/${addr}`
    };
    
    // Check if new
    const exists = existing.find(e => e.contract_address?.toLowerCase() === addr.toLowerCase());
    if (!exists) {
      existing.push(signal);
      newSignals++;
    } else {
      // Update score if better
      if (score > (exists.pumpScore || 0)) {
        Object.assign(exists, signal);
      }
    }
    
    // Promote to pulse if HOT/ALPHA
    if (tier !== 'WARM' && !pulse.find(p => p.contract_address?.toLowerCase() === addr.toLowerCase())) {
      pulse.unshift(signal);
      log(`🚨 ${tier}: $${token.symbol} | Score: ${score} | ${reasons.slice(0, 3).join(', ')}`);
    }
    
    // Alert if ALPHA
    if (tier === 'ALPHA' && !alerts.find(a => a.contract_address?.toLowerCase() === addr.toLowerCase())) {
      alerts.unshift({
        ...signal,
        alertType: 'ALPHA',
        message: `🚨🚨🚨 ALPHA: $${token.symbol} | Score: ${score}/100`,
        sentAt: now
      });
    }
  }
  
  // Save
  fs.writeFileSync(DATA_FILE, JSON.stringify(existing, null, 2));
  fs.writeFileSync(PULSE_FILE, JSON.stringify(pulse.slice(0, 20), null, 2));
  fs.writeFileSync(ALERTS_FILE, JSON.stringify(alerts.slice(0, 50), null, 2));
  
  log('');
  log('=== SUMMARY ===');
  log(`Total pairs: ${pairs.length}`);
  log(`Hard filtered: ${hardFiltered}`);
  log(`Processed: ${processed}`);
  log(`New signals: ${newSignals}`);
  log(`Pulse size: ${pulse.length}`);
  log(`Alerts: ${alerts.length}`);
  
  // Count by tier
  const tiers = existing.reduce((acc, s) => {
    acc[s.tier || 'UNRANKED'] = (acc[s.tier || 'UNRANKED'] || 0) + 1;
    return acc;
  }, {});
  log(`Tiers: ${JSON.stringify(tiers)}`);
}

main().catch(err => {
  log(`Fatal: ${err.message}`);
  process.exit(1);
});
