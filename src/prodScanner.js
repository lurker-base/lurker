#!/usr/bin/env node
// LURKER Production Scanner v2
// Détecte les tokens VIABLES (liq > $5k) pas juste les fresh launches

const fs = require('fs');
const https = require('https');

const DATA_FILE = 'data/allClankerSignals.json';
const ALERTS_FILE = 'data/alerts.json';
const PULSE_FILE = 'data/pulseSignals.json';
const now = Date.now();

// CONFIGURATION - Critères pour signaux de qualité
const CONFIG = {
  minLiquidity: 1000,        // $1k minimum (plus permissif)
  maxAgeHours: 12,           // Jusqu'à 12h (les tokens mettent du temps)
  hotScore: 70,              // Score pour HOT
  warmScore: 40,             // Score pour WARM
  maxPulseSignals: 50        // Max dans pulse
};

console.log('[PROD-SCAN] LURKER Production Scanner v2');
console.log('[PROD-SCAN]', new Date().toLocaleTimeString());

// Charger données
let existing = [], alerts = [], pulse = [];
try { existing = JSON.parse(fs.readFileSync(DATA_FILE)); } catch(e) {}
try { alerts = JSON.parse(fs.readFileSync(ALERTS_FILE)); } catch(e) {}
try { pulse = JSON.parse(fs.readFileSync(PULSE_FILE)); } catch(e) {}

const existingMap = new Map(existing.map(t => [(t.contract_address || t.address)?.toLowerCase(), t]));

// Fonction fetch
function fetchDexScreener() {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.dexscreener.com',
      path: '/token-profiles/latest/v1',
      headers: { 'User-Agent': 'Mozilla/5.0' }
    };
    
    const req = https.get(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve(json);
        } catch(e) { reject(e); }
      });
    });
    
    req.on('error', reject);
    req.setTimeout(20000, () => { req.destroy(); reject(new Error('Timeout')); });
  });
}

// Chercher aussi les paires WETH récentes
function fetchWETHPairs() {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.dexscreener.com',
      path: '/latest/dex/tokens/0x4200000000000000000000000000000000000006',
      headers: { 'User-Agent': 'Mozilla/5.0' }
    };
    
    const req = https.get(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve(json.pairs || []);
        } catch(e) { reject(e); }
      });
    });
    
    req.on('error', reject);
    req.setTimeout(20000, () => { req.destroy(); reject(new Error('Timeout')); });
  });
}

async function main() {
  try {
    console.log('[PROD-SCAN] Fetching from DexScreener...');
    
    const [profiles, wethPairs] = await Promise.all([
      fetchDexScreener().catch(() => []),
      fetchWETHPairs().catch(() => [])
    ]);
    
    // Traiter les profiles
    const profileTokens = Array.isArray(profiles) ? profiles : [];
    console.log(`[PROD-SCAN] Got ${profileTokens.length} profiles, ${wethPairs.length} WETH pairs`);
    
    let newTokens = 0;
    let updatedTokens = 0;
    let newAlerts = 0;
    
    // Traiter WETH pairs (priorité car plus de données)
    for (const pair of wethPairs) {
      if (pair.chainId !== 'base') continue;
      
      const token = pair.baseToken;
      if (!token || token.address === '0x4200000000000000000000000000000000000006') continue;
      
      const liq = parseFloat(pair.liquidity?.usd || 0);
      const pairCreated = pair.pairCreatedAt || now;
      const ageHours = (now - pairCreated) / (1000 * 60 * 60);
      
      // CRITÈRE PRINCIPAL: liquidité > 5k ET < 2h
      if (liq >= CONFIG.minLiquidity && ageHours < CONFIG.maxAgeHours) {
        const addr = token.address.toLowerCase();
        const existingToken = existingMap.get(addr);
        
        const mcap = parseFloat(pair.fdv || pair.marketCap || 0);
        const vol5m = parseFloat(pair.volume?.m5 || 0);
        const vol1h = parseFloat(pair.volume?.h1 || 0);
        const txns5m = (pair.txns?.m5?.buys || 0) + (pair.txns?.m5?.sells || 0);
        const priceChange5m = pair.priceChange?.m5 || 0;
        
        const tokenData = {
          symbol: token.symbol,
          name: token.name,
          contract_address: token.address,
          pairAddress: pair.pairAddress,
          dexId: pair.dexId,
          ageHours: Math.round(ageHours * 100) / 100,
          liquidityUsd: Math.round(liq * 100) / 100,
          marketCap: Math.round(mcap * 100) / 100,
          volume5m: Math.round(vol5m * 100) / 100,
          volume1h: Math.round(vol1h * 100) / 100,
          volume24h: Math.round(parseFloat(pair.volume?.h24 || 0) * 100) / 100,
          txns5m: txns5m,
          priceUsd: pair.priceUsd,
          priceChange5m: priceChange5m,
          priceChange24h: pair.priceChange?.h24,
          detectedAt: existingToken?.detectedAt || now,
          enrichedAt: now,
          url: `https://dexscreener.com/base/${pair.pairAddress}`,
          hasLiquidity: true
        };
        
        // CALCUL DU SCORE
        let score = 0;
        if (liq >= 200000) score += 40;
        else if (liq >= 100000) score += 35;
        else if (liq >= 50000) score += 30;
        else if (liq >= 20000) score += 25;
        else if (liq >= 10000) score += 20;
        else score += 10;
        
        if (vol5m >= 20000) score += 30;
        else if (vol5m >= 10000) score += 25;
        else if (vol5m >= 5000) score += 20;
        else if (vol5m >= 1000) score += 10;
        
        if (txns5m >= 100) score += 20;
        else if (txns5m >= 50) score += 15;
        else if (txns5m >= 20) score += 10;
        else if (txns5m >= 5) score += 5;
        
        if (priceChange5m > 100) score += 10;
        else if (priceChange5m > 20) score += 5;
        
        if (ageHours < 0.5) score += 5;
        
        tokenData.score = score;
        tokenData.status = score >= CONFIG.hotScore ? 'HOT' : 
                          score >= CONFIG.warmScore ? 'WARM' : 'COLD';
        
        const isNew = !existingToken;
        
        if (isNew) {
          existing.push(tokenData);
          newTokens++;
          console.log(`[NEW] $${token.symbol} | Liq: $${Math.round(liq/1000)}k | Score: ${score} | ${tokenData.status}`);
          
          // Créer alerte pour HOT/WARM
          if (score >= CONFIG.warmScore) {
            const alertMsg = score >= CONFIG.hotScore 
              ? `🔥🔥🔥 LURKER HOT: $${token.symbol} | Liq: $${Math.round(liq/1000)}k | Vol5m: $${Math.round(vol5m)} | ${Math.round(ageHours*60)}min old`
              : `⚡⚡ LURKER WARM: $${token.symbol} | Liq: $${Math.round(liq/1000)}k | Score: ${score}`;
            
            alerts.unshift({
              tokenAddress: token.address,
              symbol: token.symbol,
              status: tokenData.status,
              score: score,
              message: alertMsg,
              sentAt: now,
              liquidityUsd: liq
            });
            newAlerts++;
            
            // Ajouter à pulse (HOT uniquement)
            if (score >= CONFIG.hotScore && pulse.length < CONFIG.maxPulseSignals) {
              pulse.unshift({
                ...tokenData,
                promotedAt: now,
                reasons: ['High liquidity', 'Strong volume', 'Recent launch']
              });
            }
          }
        } else {
          // Mettre à jour si meilleures données
          Object.assign(existingToken, tokenData);
          updatedTokens++;
          
          // Promouvoir si devient HOT
          if (score >= CONFIG.hotScore && !pulse.find(p => p.contract_address === token.address)) {
            if (pulse.length < CONFIG.maxPulseSignals) {
              pulse.unshift({
                ...tokenData,
                promotedAt: now,
                reasons: ['Upgraded to HOT', 'Volume surge']
              });
              console.log(`[UPGRADE] $${token.symbol} → HOT (Score: ${score})`);
            }
          }
        }
        
        existingMap.set(addr, tokenData);
      }
    }
    
    // Sauvegarder tout
    fs.writeFileSync(DATA_FILE, JSON.stringify(existing, null, 2));
    fs.writeFileSync(ALERTS_FILE, JSON.stringify(alerts.slice(0, 100), null, 2)); // Max 100 alerts
    fs.writeFileSync(PULSE_FILE, JSON.stringify(pulse.slice(0, CONFIG.maxPulseSignals), null, 2));
    
    console.log(`[PROD-SCAN] Results:`);
    console.log(`  New tokens: ${newTokens}`);
    console.log(`  Updated: ${updatedTokens}`);
    console.log(`  New alerts: ${newAlerts}`);
    console.log(`  Total DB: ${existing.length}`);
    console.log(`  HOT in pulse: ${pulse.filter(p => p.status === 'HOT').length}`);
    console.log(`  WARM in pulse: ${pulse.filter(p => p.status === 'WARM').length}`);
    console.log('[PROD-SCAN] Done');
    
  } catch (err) {
    console.error('[PROD-SCAN] Error:', err.message);
    process.exit(1);
  }
}

main();
