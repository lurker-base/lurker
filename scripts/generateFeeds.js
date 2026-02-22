#!/usr/bin/env node
/**
 * LURKER Feed Generator
 * Génère les 5 fichiers de feed (CIO, WATCH, HOTLIST, FAST, CERTIFIED)
 * Usage: node scripts/generateFeeds.js
 */

const fs = require('fs');
const path = require('path');
const { LAUNCH_MODE, calculateRiskBias } = require('../src/launchMode');

const DATA_DIR = path.join(__dirname, '..', 'data');
const SIGNALS_DIR = path.join(DATA_DIR, 'signals');

// S'assurer que le dossier signals existe
if (!fs.existsSync(SIGNALS_DIR)) {
  fs.mkdirSync(SIGNALS_DIR, { recursive: true });
}

// Charger tous les signaux
function loadAllSignals() {
  const signals = [];
  
  // Essayer plusieurs sources
  const sources = [
    'pulseSignals.json',
    'pulseSignals.v2.json', 
    'realtimeSignals.json',
    'signals.json',
    'allBaseSignals.json'
  ];
  
  for (const source of sources) {
    try {
      const file = path.join(DATA_DIR, source);
      if (fs.existsSync(file)) {
        const data = JSON.parse(fs.readFileSync(file, 'utf8'));
        if (Array.isArray(data)) {
          signals.push(...data);
        } else if (data.items && Array.isArray(data.items)) {
          signals.push(...data.items);
        } else if (data.candidates && Array.isArray(data.candidates)) {
          signals.push(...data.candidates);
        }
        console.log(`📥 Loaded ${source}: ${data.length || data.items?.length || data.candidates?.length || 0} signals`);
      }
    } catch(e) {
      // Ignore errors
    }
  }
  
  // Dédupliquer par adresse
  const seen = new Set();
  return signals.filter(s => {
    const key = s.address || s.token?.address || s.pairAddress;
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// Classifier les signaux
function classifySignals(signals) {
  const now = Date.now();
  const feeds = {
    cio: [],
    watch: [],
    hotlist: [],
    fast: [],
    certified: []
  };
  
  for (const signal of signals) {
    const ageMin = signal.ageMinutes || 
                   (signal.detectedAt ? (now - signal.detectedAt) / 60000 : 999);
    const ageHours = ageMin / 60;
    
    const liq = signal.liquidityUsd || signal.liquidity || 
                signal.metrics?.liquidity_usd || 0;
    const vol5m = signal.volume5m || signal.metrics?.volume_5m || 0;
    const tx5m = signal.txns5m || signal.metrics?.txns_5m || 
                 (signal.txns?.m5 ? signal.txns.m5.buys + signal.txns.m5.sells : 0);
    const tx15m = signal.txns15m || 
                  (signal.txns?.m15 ? signal.txns.m15.buys + signal.txns.m15.sells : 0);
    const tx1h = signal.txns1h || 
                 (signal.txns?.h1 ? signal.txns.h1.buys + signal.txns.h1.sells : 0);
    
    const cfg = LAUNCH_MODE;
    
    // CIO (0-10m)
    if (ageMin <= cfg.cio.maxAgeMinutes && liq >= cfg.cio.minLiquidityUSD) {
      feeds.cio.push({
        ...signal,
        tier: 'CIO',
        tier_label: '0-10m',
        scores: { cio_score: Math.min(100, Math.floor(liq / 1000) + Math.floor(vol5m / 1000)) }
      });
    }
    // WATCH (10-30m)
    else if (ageMin >= cfg.watch.minAgeMinutes && 
             ageMin <= cfg.watch.maxAgeMinutes && 
             liq >= cfg.watch.minLiquidityUSD &&
             tx5m >= cfg.watch.minTx5m) {
      feeds.watch.push({
        ...signal,
        tier: 'WATCH',
        tier_label: '10-30m',
        timestamps: { 
          age_minutes: ageMin,
          checks: Math.floor(ageMin / 10) + 1
        },
        metrics: { liq_usd: liq, txns_5m: tx5m }
      });
    }
    // HOTLIST (30-60m)
    else if (ageMin >= cfg.hotlist.minAgeMinutes && 
             ageMin <= cfg.hotlist.maxAgeMinutes && 
             liq >= cfg.hotlist.minLiquidityUSD &&
             (tx15m >= cfg.hotlist.minTx15m || tx1h >= cfg.hotlist.minTx1h)) {
      const risk = calculateRiskBias(signal);
      feeds.hotlist.push({
        ...signal,
        tier: 'HOTLIST',
        tier_label: '30-60m',
        timestamps: { age_minutes: ageMin },
        scores: { 
          hotlist_score: Math.min(100, Math.floor(liq / 2000) + Math.floor(tx15m / 2)),
          opportunity_score: Math.floor(tx15m / 3)
        },
        metrics: { liq_usd: liq, vol_1h_usd: signal.volume1h || 0, txns_1h: tx1h },
        risk: { level: risk.level, factors: [risk.text] }
      });
    }
    // FAST (1-24h)
    else if (ageHours >= cfg.fast.minAgeHours && 
             ageHours <= cfg.fast.maxAgeHours && 
             liq >= cfg.fast.minLiquidityUSD) {
      feeds.fast.push({
        ...signal,
        tier: 'FAST',
        tier_label: '1-24h',
        timestamps: { age_hours: ageHours },
        metrics_at_cert: { liq_usd: liq, vol_24h_usd: signal.volume24h || 0 },
        momentum: { score: Math.min(100, Math.floor(liq / 1000)), vol_trend: vol5m > (signal.volume1h || 0) / 12 ? 'up' : 'stable' }
      });
    }
    // CERTIFIED (24h+)
    else if (ageHours >= cfg.certified.minAgeHours && 
             liq >= cfg.certified.minLiquidityUSD) {
      feeds.certified.push({
        ...signal,
        tier: 'CERTIFIED',
        tier_label: '24h+',
        timestamps: { age_hours: ageHours },
        holders: signal.holders || 0
      });
    }
  }
  
  return feeds;
}

// Sauvegarder les feeds
function saveFeeds(feeds) {
  const timestamp = new Date().toISOString();
  
  // CIO Feed
  fs.writeFileSync(
    path.join(SIGNALS_DIR, 'cio_feed.json'),
    JSON.stringify({
      meta: { updated_at: timestamp, version: '2.0-launch' },
      candidates: feeds.cio.sort((a, b) => b.scores.cio_score - a.scores.cio_score)
    }, null, 2)
  );
  console.log(`✅ CIO: ${feeds.cio.length} tokens`);
  
  // WATCH Feed
  fs.writeFileSync(
    path.join(SIGNALS_DIR, 'watch_feed.json'),
    JSON.stringify({
      meta: { updated_at: timestamp },
      watch: feeds.watch.sort((a, b) => a.timestamps.age_minutes - b.timestamps.age_minutes)
    }, null, 2)
  );
  console.log(`✅ WATCH: ${feeds.watch.length} tokens`);
  
  // HOTLIST Feed
  fs.writeFileSync(
    path.join(SIGNALS_DIR, 'hotlist_feed.json'),
    JSON.stringify({
      meta: { updated_at: timestamp },
      hotlist: feeds.hotlist.sort((a, b) => b.scores.opportunity_score - a.scores.opportunity_score)
    }, null, 2)
  );
  console.log(`✅ HOTLIST: ${feeds.hotlist.length} tokens`);
  
  // FAST Feed
  fs.writeFileSync(
    path.join(SIGNALS_DIR, 'fast_certified_feed.json'),
    JSON.stringify({
      meta: { updated_at: timestamp },
      fast_certified: feeds.fast.sort((a, b) => b.momentum.score - a.momentum.score)
    }, null, 2)
  );
  console.log(`✅ FAST: ${feeds.fast.length} tokens`);
  
  // CERTIFIED Feed
  fs.writeFileSync(
    path.join(SIGNALS_DIR, 'certified_feed.json'),
    JSON.stringify({
      meta: { updated_at: timestamp },
      certified: feeds.certified.sort((a, b) => b.holders - a.holders)
    }, null, 2)
  );
  console.log(`✅ CERTIFIED: ${feeds.certified.length} tokens`);
  
  // Résumé
  const total = feeds.cio.length + feeds.watch.length + feeds.hotlist.length + feeds.fast.length + feeds.certified.length;
  console.log(`\n📊 TOTAL: ${total} tokens classified`);
  console.log(`🚀 Launch Mode: ACTIVE (until ${new Date(LAUNCH_MODE.validUntil).toISOString()})`);
}

// Main
console.log('🔥 LURKER Launch Mode - Feed Generator\n');

const signals = loadAllSignals();
console.log(`\n📊 Processing ${signals.length} unique signals...\n`);

const feeds = classifySignals(signals);
saveFeeds(feeds);

console.log('\n✨ Feeds generated in data/signals/');
