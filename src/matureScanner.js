#!/usr/bin/env node
// LURKER Mature Token Scanner
// Ne scanne que les tokens de 1h-6h avec liquidité ET volume confirmés

const fs = require('fs');
const https = require('https');

const DATA_FILE = 'data/allClankerSignals.json';
const ALERTS_FILE = 'data/alerts.json';
const PULSE_FILE = 'data/pulseSignals.json';
const now = Date.now();

// CRITÈRES STRICTS
const CONFIG = {
  minAgeMinutes: 30,         // 30min minimum
  maxAgeHours: 12,           // 12h max
  minLiquidity: 5000,        // $5k minimum
  minVolume5m: 500,          // $500 volume
  hotScore: 70,
  warmScore: 50,
  maxPulseSignals: 20
};

console.log('[MATURE-SCAN] LURKER Mature Token Scanner');
console.log('[MATURE-SCAN] Criteria:');
console.log(`  Age: ${CONFIG.minAgeMinutes}min - ${CONFIG.maxAgeHours}h`);
console.log(`  Min Liquidity: $${CONFIG.minLiquidity}`);
console.log(`  Min Volume 5m: $${CONFIG.minVolume5m}`);

let existing = [], alerts = [], pulse = [];
try { existing = JSON.parse(fs.readFileSync(DATA_FILE)); } catch(e) {}
try { alerts = JSON.parse(fs.readFileSync(ALERTS_FILE)); } catch(e) {}
try { pulse = JSON.parse(fs.readFileSync(PULSE_FILE)); } catch(e) {}

const existingMap = new Map(existing.map(t => [(t.contract_address || t.address)?.toLowerCase(), t]));

// Récupérer les paires récentes sur Base
async function fetchRecentPairs() {
  const searches = ['WETH', 'USDC', 'DAI', 'CBETH'];
  const allPairs = [];
  
  for (const term of searches) {
    try {
      const pairs = await new Promise((resolve, reject) => {
        const options = {
          hostname: 'api.dexscreener.com',
          path: `/latest/dex/search?q=${term}`,
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
        req.setTimeout(15000, () => { req.destroy(); resolve([]); });
      });
      
      allPairs.push(...pairs);
    } catch(e) {}
  }
  
  // Dédupliquer
  const seen = new Set();
  return allPairs.filter(p => {
    if (seen.has(p.pairAddress)) return false;
    seen.add(p.pairAddress);
    return p.chainId === 'base';
  });
}

async function main() {
  console.log('[MATURE-SCAN] Fetching pairs...');
  const pairs = await fetchRecentPairs();
  console.log(`[MATURE-SCAN] Found ${pairs.length} unique Base pairs`);
  
  let newTokens = 0;
  let newAlerts = 0;
  
  for (const pair of pairs) {
    const token = pair.baseToken;
    if (!token || token.address === '0x4200000000000000000000000000000000000006') continue;
    
    const liq = parseFloat(pair.liquidity?.usd || 0);
    const vol5m = parseFloat(pair.volume?.m5 || 0);
    const pairCreated = pair.pairCreatedAt || now;
    const ageMinutes = (now - pairCreated) / (1000 * 60);
    const ageHours = ageMinutes / 60;
    
    // CRITÈRES STRICTS
    const isMature = ageMinutes >= CONFIG.minAgeMinutes && ageHours <= CONFIG.maxAgeHours;
    const hasLiquidity = liq >= CONFIG.minLiquidity;
    const hasVolume = vol5m >= CONFIG.minVolume5m;
    
    if (isMature && hasLiquidity && hasVolume) {
      const addr = token.address.toLowerCase();
      const existingToken = existingMap.get(addr);
      
      const mcap = parseFloat(pair.fdv || pair.marketCap || 0);
      const txns5m = (pair.txns?.m5?.buys || 0) + (pair.txns?.m5?.sells || 0);
      const priceChange5m = pair.priceChange?.m5 || 0;
      
      const tokenData = {
        symbol: token.symbol,
        name: token.name,
        contract_address: token.address,
        pairAddress: pair.pairAddress,
        dexId: pair.dexId,
        ageMinutes: Math.round(ageMinutes),
        ageHours: Math.round(ageHours * 100) / 100,
        liquidityUsd: Math.round(liq * 100) / 100,
        marketCap: Math.round(mcap * 100) / 100,
        volume5m: Math.round(vol5m * 100) / 100,
        volume1h: Math.round(parseFloat(pair.volume?.h1 || 0) * 100) / 100,
        volume24h: Math.round(parseFloat(pair.volume?.h24 || 0) * 100) / 100,
        txns5m: txns5m,
        priceUsd: pair.priceUsd,
        priceChange5m: priceChange5m,
        priceChange1h: pair.priceChange?.h1,
        priceChange24h: pair.priceChange?.h24,
        detectedAt: existingToken?.detectedAt || now,
        enrichedAt: now,
        url: `https://dexscreener.com/base/${pair.pairAddress}`,
        source: 'mature-scan',
        hasLiquidity: true,
        hasVolume: true,
        mature: true
      };
      
      // SCORE BASÉ SUR MATURITÉ + PERFORMANCE
      let score = 40; // Base pour passer le filtre
      
      if (liq >= 100000) score += 30;
      else if (liq >= 50000) score += 25;
      else if (liq >= 20000) score += 20;
      else score += 10;
      
      if (vol5m >= 10000) score += 20;
      else if (vol5m >= 5000) score += 15;
      else score += 10;
      
      if (txns5m >= 50) score += 15;
      else if (txns5m >= 20) score += 10;
      else score += 5;
      
      if (priceChange5m > 50) score += 10;
      else if (priceChange5m > 10) score += 5;
      
      if (ageMinutes < 120) score += 5; // Bonus jeune
      
      tokenData.score = score;
      tokenData.status = score >= CONFIG.hotScore ? 'HOT' : 
                        score >= CONFIG.warmScore ? 'WARM' : 'COLD';
      
      const isNew = !existingToken;
      
      if (isNew) {
        existing.push(tokenData);
        newTokens++;
        console.log(`\n[NEW MATURE] $${token.symbol}`);
        console.log(`  Age: ${Math.round(ageMinutes)}min (${Math.round(ageHours*10)/10}h)`);
        console.log(`  Liq: $${Math.round(liq).toLocaleString()}`);
        console.log(`  Vol5m: $${Math.round(vol5m).toLocaleString()}`);
        console.log(`  Txns5m: ${txns5m}`);
        console.log(`  Score: ${score} | ${tokenData.status}`);
        
        if (score >= CONFIG.warmScore) {
          const alert = score >= CONFIG.hotScore
            ? `🔥🔥🔥 HOT MATURE: $${token.symbol} | ${Math.round(ageHours*10)/10}h old | $${Math.round(liq/1000)}k liq | $${Math.round(vol5m/1000)}k vol5m`
            : `⚡⚡ WARM MATURE: $${token.symbol} | ${Math.round(ageHours*10)/10}h old | Score: ${score}`;
          
          alerts.unshift({
            tokenAddress: token.address,
            symbol: token.symbol,
            status: tokenData.status,
            score: score,
            message: alert,
            sentAt: now,
            liquidityUsd: liq,
            mature: true
          });
          newAlerts++;
          
          if (score >= CONFIG.hotScore && pulse.length < CONFIG.maxPulseSignals) {
            pulse.unshift({ ...tokenData, promotedAt: now, reasons: ['Mature + High volume', 'Proven liquidity'] });
          }
        }
      } else {
        Object.assign(existingToken, tokenData);
      }
      
      existingMap.set(addr, tokenData);
    }
  }
  
  fs.writeFileSync(DATA_FILE, JSON.stringify(existing, null, 2));
  fs.writeFileSync(ALERTS_FILE, JSON.stringify(alerts.slice(0, 50), null, 2));
  fs.writeFileSync(PULSE_FILE, JSON.stringify(pulse.slice(0, CONFIG.maxPulseSignals), null, 2));
  
  console.log(`\n[MATURE-SCAN] Results:`);
  console.log(`  New mature tokens: ${newTokens}`);
  console.log(`  New alerts: ${newAlerts}`);
  console.log(`  Total DB: ${existing.length}`);
  console.log(`  Pulse HOT: ${pulse.filter(p => p.status === 'HOT').length}`);
  console.log(`  Pulse WARM: ${pulse.filter(p => p.status === 'WARM').length}`);
  console.log('[MATURE-SCAN] Done');
}

main().catch(err => {
  console.error('[MATURE-SCAN] Error:', err.message);
  process.exit(1);
});
