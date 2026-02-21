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
  
  // Gatekeeper ALPHA GOLD (trabable, solide)
  alphaGoldThresholds: {
    minConfidence: 70,
    minLiquidity: 250000,
    maxEarlyLateScore: 60,
    validActions: ['CONSIDER', 'ENTER', 'consider', 'enter']
  },
  
  // Gatekeeper ALPHA EARLY (précoce, risqué)
  alphaEarlyThresholds: {
    minConfidence: 60,
    minLiquidity: 60000,
    maxEarlyLateScore: 40,
    validActions: ['WATCH', 'SPECULATIVE', 'watch', 'speculative']
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

// Obtenir le timing label
function getTimingLabel(earlyLateScore) {
  if (earlyLateScore <= 25) return 'EARLY';
  if (earlyLateScore <= 60) return 'OPTIMAL';
  if (earlyLateScore <= 75) return 'LATE';
  return 'FOMO';
}

// Calculer la window (minutes)
function calculateWindow(earlyLateScore) {
  if (earlyLateScore <= 25) return { min: 60, max: 180, text: '60-180 min' };
  if (earlyLateScore <= 60) return { min: 30, max: 90, text: '30-90 min' };
  if (earlyLateScore <= 75) return { min: 10, max: 30, text: '10-30 min' };
  return { min: 0, max: 10, text: '0-10 min' };
}

// Normaliser les invalidations
function normalizeInvalidations(signal) {
  const inv = [];
  if (signal.invalidatedIf && Array.isArray(signal.invalidatedIf)) {
    return signal.invalidatedIf.map(i => {
      // Normalize common patterns
      if (i.includes('score')) return `Score < ${signal.score * 0.7 || 38}`;
      if (i.includes('liquidity')) return `Liquidity < $${((signal.liquidityUsd || 0) * 0.5 / 1000).toFixed(0)}k`;
      if (i.includes('momentum')) return 'Momentum reversal 2 cycles';
      return i;
    });
  }
  // Default invalidations
  inv.push(`Score < ${Math.floor((signal.score || 50) * 0.7)}`);
  inv.push(`Liquidity < $${Math.floor((signal.liquidityUsd || 200000) / 2 / 1000)}k`);
  inv.push('EarlyLateScore > 75 (FOMO)');
  return inv;
}

// Générer un résumé décisionnel (1 phrase vendable)
function generateDecisionSummary(signal, timingLabel, window) {
  const action = (signal.suggestedAction || 'CONSIDER').toUpperCase();
  const phase = (signal.marketPhase || 'accumulation').toUpperCase();
  const symbol = signal.symbol || 'TOKEN';
  
  if (timingLabel === 'FOMO') {
    return `${symbol}: ${action} with caution — entering FOMO zone (${window.text} left)`;
  }
  if (timingLabel === 'EARLY') {
    return `${symbol}: ${action} — early entry window (${window.text}) during ${phase}`;
  }
  return `${symbol}: ${action} — ${timingLabel.toLowerCase()} timing (${window.text}) in ${phase} phase`;
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
  const liq = signal.liquidityUsd || signal.liquidity || 0;
  const conf = signal.confidence || 0;
  const action = (signal.suggestedAction || '').toUpperCase();
  
  // === ALPHA GOLD (solide, tradable) ===
  const gold = CONFIG.alphaGoldThresholds;
  if (conf >= gold.minConfidence && 
      liq >= gold.minLiquidity && 
      earlyLateScore <= gold.maxEarlyLateScore &&
      gold.validActions.includes(action)) {
    return 'ALPHA_GOLD';
  }
  
  // === ALPHA EARLY (précoce, risqué) ===
  const early = CONFIG.alphaEarlyThresholds;
  if (conf >= early.minConfidence && 
      liq >= early.minLiquidity && 
      earlyLateScore <= early.maxEarlyLateScore) {
    return 'ALPHA_EARLY';
  }
  
  // === PULSE (public, délai) ===
  if (conf >= 40 && liq >= 50000) {
    return 'PULSE';
  }
  
  // === WATCH (liste surveillance) ===
  return 'WATCH';
}

// Déterminer accessLevel
function getAccessLevel(tier) {
  switch(tier) {
    case 'ALPHA_GOLD': return 'premium';
    case 'ALPHA_EARLY': return 'premium_early';
    case 'PULSE': return 'freemium';
    case 'WATCH': return 'public';
    default: return 'public';
  }
}

// Calculer embargo
function calculateEmbargo(tier) {
  const now = Math.floor(Date.now() / 1000);
  if (tier === 'ALPHA_GOLD') {
    // ALPHA GOLD : embargo 15min (premium voit avant)
    return now + (CONFIG.publicDelayMinutes * 60);
  }
  if (tier === 'ALPHA_EARLY') {
    // ALPHA EARLY : embargo 10min (encore plus exclusif)
    return now + 600;
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
  
  // FIX 1: ALPHA coherence
  let suggestedAction = signal.suggestedAction || 'CONSIDER';
  if (tier === 'ALPHA_GOLD') {
    // ALPHA GOLD = toujours CONSIDER (jamais WATCH)
    suggestedAction = 'CONSIDER';
  } else if (tier === 'ALPHA_EARLY') {
    // ALPHA EARLY = WATCH ou SPECULATIVE (risqué)
    suggestedAction = suggestedAction.toLowerCase() === 'consider' ? 'WATCH' : (suggestedAction || 'WATCH');
  }
  
  const accessLevel = getAccessLevel(tier);
  const embargoUntil = calculateEmbargo(tier);
  const timingLabel = getTimingLabel(earlyLateScore);
  const window = calculateWindow(earlyLateScore);
  const invalidatedIf = normalizeInvalidations(signal);
  
  // Recalculer decisionSummary avec l'action corrigée
  const decisionSummary = generateDecisionSummary(
    { ...signal, suggestedAction }, 
    timingLabel, 
    window
  );
  
  return {
    ...signal,
    suggestedAction,
    schemaVersion: 2.1,
    marketPhase,
    earlyLateScore,
    timingLabel,
    windowMin: window.min,
    windowMax: window.max,
    windowText: window.text,
    signalStrengthReason,
    invalidatedIf,
    decisionSummary,
    tier,
    accessLevel,
    embargoUntil,
    generatedAt: Math.floor(Date.now() / 1000)
  };
}

// Sauvegarder les fichiers
function saveSignals(publicSignals, alphaGoldSignals, alphaEarlySignals) {
  const publicPath = path.join(CONFIG.outputDir, 'pulseSignals.v2.public.json');
  const alphaGoldPath = path.join(CONFIG.outputDir, 'pulseSignals.v2.alpha.json');
  const alphaEarlyPath = path.join(CONFIG.outputDir, 'pulseSignals.v2.alpha-early.json');
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
  
  // Fichier ALPHA GOLD (premium, solide)
  fs.writeFileSync(alphaGoldPath, JSON.stringify({
    schemaVersion: 2.1,
    tier: 'alpha_gold',
    criteria: { minConfidence: 70, minLiquidity: 250000, maxEarlyLate: 60 },
    generatedAt: now,
    count: alphaGoldSignals.length,
    items: alphaGoldSignals
  }, null, 2));
  
  // Fichier ALPHA EARLY (premium, risqué)
  fs.writeFileSync(alphaEarlyPath, JSON.stringify({
    schemaVersion: 2.1,
    tier: 'alpha_early',
    criteria: { minConfidence: 60, minLiquidity: 60000, maxEarlyLate: 40 },
    generatedAt: now,
    count: alphaEarlySignals.length,
    items: alphaEarlySignals
  }, null, 2));
  
  // Fichier complet (backup)
  fs.writeFileSync(fullPath, JSON.stringify({
    schemaVersion: 2.1,
    generatedAt: now,
    tiers: {
      public: publicReady.length,
      alpha_gold: alphaGoldSignals.length,
      alpha_early: alphaEarlySignals.length
    },
    items: [...publicSignals, ...alphaGoldSignals, ...alphaEarlySignals]
  }, null, 2));
  
  console.log(`[V2.1] Saved: ${publicReady.length} public, ${alphaGoldSignals.length} gold, ${alphaEarlySignals.length} early`);
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
  const alphaGoldSignals = enriched.filter(s => s.tier === 'ALPHA_GOLD');
  const alphaEarlySignals = enriched.filter(s => s.tier === 'ALPHA_EARLY');
  
  console.log(`[V2.1] Tiers: ${publicSignals.length} public, ${alphaGoldSignals.length} gold, ${alphaEarlySignals.length} early`);
  
  // Exemple de signal ALPHA GOLD
  if (alphaGoldSignals.length > 0) {
    const example = alphaGoldSignals[0];
    console.log('[V2.1] Example ALPHA GOLD signal:');
    console.log(`  Symbol: $${example.symbol}`);
    console.log(`  Phase: ${example.marketPhase}`);
    console.log(`  Timing: ${example.timingLabel} (${example.earlyLateScore}/100)`);
    console.log(`  Window: ${example.windowText}`);
    console.log(`  Confidence: ${example.confidence}%`);
    console.log(`  Action: ${example.suggestedAction}`);
  }
  
  // Exemple de signal ALPHA EARLY
  if (alphaEarlySignals.length > 0) {
    const example = alphaEarlySignals[0];
    console.log('[V2.1] Example ALPHA EARLY signal:');
    console.log(`  Symbol: $${example.symbol}`);
    console.log(`  Timing: ${example.timingLabel} (${example.earlyLateScore}/100)`);
    console.log(`  Action: ${example.suggestedAction}`);
    console.log(`  Decision: ${example.decisionSummary}`);
    console.log(`  Reasons: ${example.signalStrengthReason.join('; ')}`);
    console.log(`  Invalidated if: ${example.invalidatedIf.join(', ')}`);
  }
  
  saveSignals(publicSignals, alphaGoldSignals, alphaEarlySignals);
  console.log('[V2.1] Done.');
}

main();
