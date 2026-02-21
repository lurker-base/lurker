#!/usr/bin/env node
/**
 * LURKER Signal Enricher v2.0
 * Ajoute: trend, confidence, horizon, insight, history
 * Garde: compatibilité v1
 */

const fs = require('fs');
const path = require('path');

const SIGNALS_FILE = '/data/.openclaw/workspace/lurker-project/data/pulseSignals.json';
const HISTORY_FILE = '/data/.openclaw/workspace/lurker-project/data/signalHistory.json';

// Charger historique
function loadHistory() {
  try {
    return JSON.parse(fs.readFileSync(HISTORY_FILE));
  } catch {
    return {};
  }
}

function saveHistory(history) {
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2));
}

// Calculer trend
function calculateTrend(signal, history) {
  const symbol = signal.symbol;
  const hist = history[symbol] || [];
  if (hist.length < 2) return 'flat';
  
  const recent = hist.slice(-3);
  const avgPrev = recent.slice(0, -1).reduce((a, b) => a + b.score, 0) / (recent.length - 1);
  const current = signal.score;
  
  if (current > avgPrev * 1.15) return 'up';
  if (current < avgPrev * 0.85) return 'down';
  return 'flat';
}

// Calculer confidence
function calculateConfidence(signal) {
  let confidence = signal.score;
  
  // Bonus liquidité
  if (signal.liquidityUsd > 100000) confidence += 10;
  if (signal.liquidityUsd > 500000) confidence += 15;
  
  // Bonus volume relatif
  const volRatio = signal.volume24h / signal.marketCap;
  if (volRatio > 0.1) confidence += 10;
  
  // Malus jeunesse extrême
  const age = Date.now() - signal.detectedAt;
  if (age < 600000) confidence -= 10; // < 10 min
  
  return Math.min(95, Math.max(30, confidence));
}

// Déterminer horizon
function calculateHorizon(signal) {
  if (signal.volume5m > signal.volume1h / 10) return 'short'; // Explosif
  if (signal.priceChange1h > 0.5) return 'short';
  if (signal.liquidityUsd > 500000) return 'mid';
  return 'long';
}

// Générer insight lisible
function generateInsight(signal, trend, confidence, horizon) {
  const insights = [];
  
  // Momentum
  if (trend === 'up') insights.push("Momentum en accélération");
  else if (trend === 'down') insights.push("Retracement naturel en cours");
  else insights.push("Stabilisation du momentum");
  
  // Liquidité
  if (signal.liquidityUsd > 300000) insights.push("liquidité institutionnelle");
  else if (signal.liquidityUsd > 100000) insights.push("liquidité solide");
  else insights.push("liquidité encore fragile");
  
  // Volume
  const volRatio = signal.volume24h / signal.marketCap;
  if (volRatio > 0.15) insights.push("volume anormalement élevé");
  else if (volRatio > 0.08) insights.push("volume sain");
  
  // Concurrence
  if (signal.txCount24h > 500) insights.push("forte participation");
  else if (signal.txCount24h < 100) insights.push("faible concurrence");
  
  const horizonText = horizon === 'short' ? 'court terme' : horizon === 'mid' ? 'moyen terme' : 'vision long terme';
  
  return `${insights.join(', ')}, ${horizonText}. Confiance: ${confidence}%.`;
}

// Déterminer action suggérée
function calculateAction(signal, trend, confidence) {
  if (confidence < 40) return 'wait';
  if (trend === 'down' && signal.priceChange1h < -0.2) return 'wait';
  if (confidence > 70 && trend === 'up') return 'watch';
  if (confidence > 80 && signal.liquidityUsd > 200000) return 'enter';
  return 'watch';
}

// Mettre à jour historique
function updateHistory(history, signal) {
  const symbol = signal.symbol;
  if (!history[symbol]) history[symbol] = [];
  
  history[symbol].push({
    timestamp: Date.now(),
    score: signal.score,
    price: signal.priceUsd,
    mcap: signal.marketCap
  });
  
  // Garder 30 jours max
  const cutoff = Date.now() - (30 * 24 * 60 * 60 * 1000);
  history[symbol] = history[symbol].filter(h => h.timestamp > cutoff);
  
  // Limiter à 100 entrées par token
  if (history[symbol].length > 100) {
    history[symbol] = history[symbol].slice(-100);
  }
}

// Enrichir un signal
function enrichSignal(signal, history) {
  const trend = calculateTrend(signal, history);
  const confidence = calculateConfidence(signal);
  const horizon = calculateHorizon(signal);
  const insight = generateInsight(signal, trend, confidence, horizon);
  const action = calculateAction(signal, trend, confidence);
  
  updateHistory(history, signal);
  
  // Seuils d'invalidation cohérents
  const liquidityThreshold = Math.floor(signal.liquidityUsd * 0.5 / 10000) * 10000; // Arrondi 10k
  const scoreThreshold = Math.floor(signal.score * 0.7);
  
  // Insight mesurable et défendable
  const cleanInsight = `Liquidité ~$${(signal.liquidityUsd/1000).toFixed(0)}k, momentum ${trend === 'flat' ? 'stable' : trend}, score ${signal.score} : ${action.toUpperCase()} (confiance ${confidence}%).`;
  
  return {
    ...signal,
    schemaVersion: 2,
    trend,
    confidence,
    horizon,
    lurkerInsight: cleanInsight,
    suggestedAction: action,
    riskLevel: confidence > 70 ? 'low' : confidence > 50 ? 'medium' : 'high',
    invalidatedIf: [
      `score < ${scoreThreshold}`,
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

// Main
function main() {
  try {
    const signals = JSON.parse(fs.readFileSync(SIGNALS_FILE));
    const history = loadHistory();
    
    const enriched = signals.map(s => enrichSignal(s, history));
    
    saveHistory(history);
    fs.writeFileSync(SIGNALS_FILE, JSON.stringify(enriched, null, 2));
    
    console.log(`✅ Enriched ${enriched.length} signals`);
    enriched.forEach(s => {
      console.log(`  ${s.symbol}: ${s.trend} | ${s.confidence}% | ${s.suggestedAction} | ${s.lurkerInsight.substring(0, 50)}...`);
    });
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
}

main();
