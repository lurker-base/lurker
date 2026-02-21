#!/usr/bin/env node
/**
 * LURKER Build Data v2 — GitHub Actions compatible
 * Génère pulseSignals.json (v1 compat) + pulseSignals.v2.json (enrichi)
 * Usage: node scripts/build-data.js
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DOCS_DATA_DIR = path.join(__dirname, '..', 'docs', 'data');

// S'assurer que docs/data existe
if (!fs.existsSync(DOCS_DATA_DIR)) {
  fs.mkdirSync(DOCS_DATA_DIR, { recursive: true });
}

// Charger source (v1)
const sourceFile = path.join(DATA_DIR, 'pulseSignals.json');
if (!fs.existsSync(sourceFile)) {
  console.error('❌ Source file not found:', sourceFile);
  process.exit(1);
}

const signals = JSON.parse(fs.readFileSync(sourceFile));
console.log(`📊 Processing ${signals.length} signals`);

// Enrichir pour v2
function enrichV2(signal) {
  const trend = signal.priceChange1h > 0.5 ? 'up' : 
                signal.priceChange1h < -0.2 ? 'down' : 'flat';
  
  const confidence = Math.min(95, Math.max(40, 
    signal.score + (signal.liquidityUsd > 300000 ? 10 : 0)
  ));
  
  const horizon = signal.volume5m > signal.volume1h / 12 ? 'short' : 
                  signal.liquidityUsd > 500000 ? 'mid' : 'long';
  
  const action = confidence > 70 && trend === 'up' ? 'watch' : 
                 confidence < 50 ? 'avoid' : 'consider';
  
  const liquidityThreshold = Math.floor(signal.liquidityUsd * 0.5 / 10000) * 10000;
  
  return {
    ...signal,
    schemaVersion: 2,
    trend,
    confidence,
    horizon,
    lurkerInsight: `Liquidité ~$${(signal.liquidityUsd/1000).toFixed(0)}k, momentum ${trend === 'flat' ? 'stable' : trend}, score ${signal.score} : ${action.toUpperCase()} (confiance ${confidence}%).`,
    suggestedAction: action,
    riskLevel: confidence > 70 ? 'low' : confidence > 50 ? 'medium' : 'high',
    invalidatedIf: [
      `score < ${Math.floor(signal.score * 0.7)}`,
      `liquidity_usd < ${liquidityThreshold}`,
      trend === 'up' ? 'momentum_reverses_down' : 'momentum_weakens_2_cycles'
    ],
    metrics: {
      liquidity_usd: Math.floor(signal.liquidityUsd),
      momentum: trend === 'up' ? 1 : trend === 'down' ? -1 : 0,
      volume_ratio_24h: parseFloat((signal.volume24h / signal.marketCap).toFixed(4))
    },
    lastUpdate: Date.now()
  };
}

// Générer v2
const enriched = signals.map(enrichV2);

// Écrire v1 (compat) — copie exacte de la source
fs.writeFileSync(
  path.join(DOCS_DATA_DIR, 'pulseSignals.json'),
  JSON.stringify(signals, null, 2)
);
console.log('✅ Written: pulseSignals.json (v1 compat)');

// Écrire v2 (enrichi)
fs.writeFileSync(
  path.join(DOCS_DATA_DIR, 'pulseSignals.v2.json'),
  JSON.stringify(enriched, null, 2)
);
console.log('✅ Written: pulseSignals.v2.json (enriched)');

// Vérification
const v2Check = JSON.parse(fs.readFileSync(path.join(DOCS_DATA_DIR, 'pulseSignals.v2.json')));
console.log(`🔍 Verified: ${v2Check.length} signals, schemaVersion: ${v2Check[0]?.schemaVersion}`);
console.log(`💡 Sample insight: ${v2Check[0]?.lurkerInsight?.substring(0, 60)}...`);
