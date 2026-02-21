/**
 * LURKER Signals Enricher V2.1
 * Ajoute marketPhase, earlyLateScore, signalStrengthReason, tier, accessLevel, embargoUntil
 * Sépare les flux PUBLIC / ALPHA
 */

const fs = require('fs');
const path = require('path');

const CONFIG = {
  inputFile: '/data/.openclaw/workspace/lurker-project/data/pulseSignals.json',
  outputDir: '/data/.openclaw/workspace/lurker-project/data',
  publicDelayMinutes: 15,
  
  // Gatekeeper ALPHA
  alphaThresholds: {
    minConfidence: 65,
    minLiquidity: 300000,
    maxEarlyLateScore: 75,
    validActions: ['CONSIDER', 'ENTER', 'WATCH', 'consider', 'enter', 'watch']
  }
};

// Charger les signaux d'entrée
function loadSignals() {
  try {
    const data = fs.readFileSync(CONFIG.inputFile, 'utf8');
    const parsed = JSON.parse(data);
    // Supporte à la fois {schemaVersion, items: []} et []
    return Array.isArray(parsed) ? parsed : (parsed.items || []);
  } catch (e) {
    console.error('[V2.1] Erreur chargement:', e.message);
    return [];
  }
}

// Déterminer la marketPhase
function calculateMarketPhase(signal) {
  const priceChange5m = signal.priceChange5m || 0;
  const priceChange1h = signal.priceChange1h || signal.priceChange || 0;
  const vol5m = signal.volume5m || 0;
  const vol1h = signal.volume1h || 0;
  const age = signal.ageMinutes || 0;
  
  // Distribution : prix qui baisse + volume faible
  if (priceChange5m < -5 && age > 60) return 'distribution';
  
  // Breakout : prix qui monte fort + volume élevé
  if (priceChange5m > 10 && vol5m > 5000) return 'breakout';
  
  // Extension : prix qui monte + volume faible (attention FOMO)
  if (priceChange5m > 15 && vol5m < 3000) return 'extension';
  
  // Accumulation : prix stable/volatile modéré + volume croissant
  if (Math.abs(priceChange5m) < 10 && vol5m > 1000) return 'accumulation';
  
  // Défaut
  return 'accumulation';
}

// Calculer earlyLateScore (0 = trop tôt, 50 = optimal, 100 = trop tard/FOMO)
function calculateEarlyLateScore(signal) {
  const age = signal.ageMinutes || 0;
  const priceChange = signal.priceChange5m || 0;
  const momentum = signal.metrics?.momentum || 0;
  
  // Base sur l'âge
  let score = 0;
  if (age < 5) score = 10; // Trop frais, risqué
  else if (age < 15) score = 30; // Early acceptable
  else if (age < 45) score = 50; // Optimal
  else if (age < 120) score = 65; // Acceptable
  else if (age < 300) score = 80; // Late
  else score = 95; // Trop tard
  
  // Ajustement momentum
  if (momentum > 0.5) score -= 5; // Momentum confirme
  if (momentum < -0.3) score += 15; // Momentum contre, risqué
  
  // Ajustement prix
  if (priceChange > 30) score += 20; // Pump trop rapide = FOMO
  if (priceChange < -10) score += 10; // Dump = trop tard
  
  return Math.max(0, Math.min(100, Math.round(score)));
}

// Générer les raisons de force du signal
function generateStrengthReasons(signal) {
  const reasons = [];
  const liq = signal.liquidityUsd || signal.liquidity || 0;
  const vol5m = signal.volume5m || 0;
  const vol1h = signal.volume1h || 0;
  const priceChange = signal.priceChange5m || 0;
  const tx5m = signal.txns5m || 0;
  const holders = signal.holders || 0;
  
  // Liquidité
  if (liq > 500000) reasons.push('Liquidité élevée (>500k), entrée/sortie fluide');
  else if (liq > 200000) reasons.push('Liquidité solide (>200k), risque slippage limité');
  
  // Volume
  if (vol5m > 10000) reasons.push('Volume 5m élevé, intérêt confirmé');
  else if (vol5m > vol1h / 12) reasons.push('Volume cohérent, pas de flash pump');
  
  // Prix/Momentum
  if (priceChange > 0 && priceChange < 15) reasons.push('Momentum haussier modéré, pas de FOMO');
  if (signal.metrics?.momentum > 0.3) reasons.push('Tendance technique favorable');
  
  // Activité
  if (tx5m > 50) reasons.push('Activité de trading soutenue');
  if (holders > 100) reasons.push('Distribution holders acceptable');
  
  // Limiter à 3 raisons max
  return reasons.slice(0, 3);
}

// Déterminer le tier (gatekeeper)
function qualifyTier(signal, earlyLateScore) {
  const cfg = CONFIG.alphaThresholds;
  
  // Vérifications de base
  if (signal.confidence < cfg.minConfidence) return 'WATCH';
  if (!cfg.validActions.includes(signal.suggestedAction)) return 'WATCH';
  if ((signal.liquidityUsd || signal.liquidity || 0) < cfg.minLiquidity) return 'PULSE';
  if (earlyLateScore > cfg.maxEarlyLateScore) return 'PULSE'; // Trop tard
  
  // Vérification volume cohérent (pas flash pump)
  const vol5m = signal.volume5m || 0;
  const vol1h = signal.volume1h || 0;
  if (vol1h > 0 && vol5m > (vol1h / 5)) {
    // Volume 5m > 20% du volume 1h = possible flash pump
    return 'PULSE';
  }
  
  // Tous critères OK = ALPHA
  return 'ALPHA';
}

// Déterminer accessLevel
function getAccessLevel(tier) {
  switch(tier) {
    case 'ALPHA': return 'premium';
    case 'PULSE': return 'freemium';
    case 'WATCH': return 'public';
    default: return 'public';
  }
}

// Calculer embargo
function calculateEmbargo(tier) {
  const now = Math.floor(Date.now() / 1000);
  if (tier === 'ALPHA') {
    // ALPHA : embargo 15min (premium voit avant)
    return now + (CONFIG.publicDelayMinutes * 60);
  }
  if (tier === 'PULSE') {
    // PULSE : embargo 5min
    return now + 300;
  }
  // WATCH : immédiat
  return now;
}

// Enrichir un signal
function enrichSignal(signal) {
  const marketPhase = calculateMarketPhase(signal);
  const earlyLateScore = calculateEarlyLateScore(signal);
  const signalStrengthReason = generateStrengthReasons(signal);
  const tier = qualifyTier(signal, earlyLateScore);
  const accessLevel = getAccessLevel(tier);
  const embargoUntil = calculateEmbargo(tier);
  
  return {
    ...signal,
    schemaVersion: 2.1,
    marketPhase,
    earlyLateScore,
    signalStrengthReason,
    tier,
    accessLevel,
    embargoUntil,
    generatedAt: Math.floor(Date.now() / 1000)
  };
}

// Sauvegarder les fichiers
function saveSignals(publicSignals, alphaSignals) {
  const publicPath = path.join(CONFIG.outputDir, 'pulseSignals.v2.public.json');
  const alphaPath = path.join(CONFIG.outputDir, 'pulseSignals.v2.alpha.json');
  const fullPath = path.join(CONFIG.outputDir, 'pulseSignals.v2.1.json');
  
  // Fichier public (WATCH + PULSE avec embargo respecté)
  const now = Math.floor(Date.now() / 1000);
  const publicReady = publicSignals.filter(s => s.embargoUntil <= now);
  
  fs.writeFileSync(publicPath, JSON.stringify({
    schemaVersion: 2.1,
    tier: 'public',
    generatedAt: now,
    count: publicReady.length,
    items: publicReady
  }, null, 2));
  
  // Fichier ALPHA (premium, temps réel)
  fs.writeFileSync(alphaPath, JSON.stringify({
    schemaVersion: 2.1,
    tier: 'alpha',
    generatedAt: now,
    count: alphaSignals.length,
    items: alphaSignals
  }, null, 2));
  
  // Fichier complet (backup)
  fs.writeFileSync(fullPath, JSON.stringify({
    schemaVersion: 2.1,
    generatedAt: now,
    tiers: {
      public: publicReady.length,
      alpha: alphaSignals.length
    },
    items: [...publicSignals, ...alphaSignals]
  }, null, 2));
  
  console.log(`[V2.1] Saved: ${publicReady.length} public, ${alphaSignals.length} alpha`);
}

// Main
function main() {
  console.log('[V2.1] Starting enrichment...');
  
  const signals = loadSignals();
  if (signals.length === 0) {
    console.log('[V2.1] No signals to process');
    return;
  }
  
  console.log(`[V2.1] Processing ${signals.length} signals...`);
  
  const enriched = signals.map(enrichSignal);
  
  // Séparer les tiers
  const publicSignals = enriched.filter(s => s.tier === 'WATCH' || s.tier === 'PULSE');
  const alphaSignals = enriched.filter(s => s.tier === 'ALPHA');
  
  console.log(`[V2.1] Tiers: ${publicSignals.length} public, ${alphaSignals.length} alpha`);
  
  // Exemple de signal ALPHA
  if (alphaSignals.length > 0) {
    const example = alphaSignals[0];
    console.log('[V2.1] Example ALPHA signal:');
    console.log(`  Symbol: $${example.symbol}`);
    console.log(`  Phase: ${example.marketPhase}`);
    console.log(`  Early/Late: ${example.earlyLateScore}/100`);
    console.log(`  Confidence: ${example.confidence}%`);
    console.log(`  Action: ${example.suggestedAction}`);
    console.log(`  Reasons: ${example.signalStrengthReason.join('; ')}`);
  }
  
  saveSignals(publicSignals, alphaSignals);
  console.log('[V2.1] Done.');
}

main();
