#!/usr/bin/env node
/**
 * LURKER ALPHA Bot — Premium signal broadcaster
 * Polling: toutes les 2 minutes
 * Anti-doublon: state file
 */

const fs = require('fs').promises;
const path = require('path');

// Config via env
const CONFIG = {
  token: process.env.TELEGRAM_BOT_TOKEN,
  channel: process.env.TELEGRAM_CHANNEL || '@LurkerAlphaSignals',
  alphaUrl: 'https://lurker-base.github.io/lurker/data/pulseSignals.v2.alpha.json',
  stateFile: '/data/.openclaw/workspace/lurker-project/data/.alpha_state.json',
  pollInterval: 120000, // 2 min
  testMode: process.env.TEST_MODE === '1'
};

// Vérifier config
if (!CONFIG.token) {
  console.error('[ALPHA BOT] ❌ TELEGRAM_BOT_TOKEN manquant');
  process.exit(1);
}

// Charger state (signaux déjà postés)
async function loadState() {
  try {
    const data = await fs.readFile(CONFIG.stateFile, 'utf8');
    return JSON.parse(data);
  } catch {
    return { posted: [] };
  }
}

// Sauvegarder state
async function saveState(state) {
  await fs.writeFile(CONFIG.stateFile, JSON.stringify(state, null, 2));
}

// Générer clé unique pour un signal
function signalKey(s) {
  return `${s.contractAddress || s.tokenAddress || s.symbol}:${s.detectedAt}`;
}

// Formater message ALPHA premium
function formatAlphaMessage(signal) {
  const symbol = signal.symbol || 'UNKNOWN';
  const isGold = signal.tier === 'ALPHA_GOLD';
  const tierLabel = isGold ? '🥇 ALPHA GOLD' : '🧪 ALPHA EARLY';
  const tierDesc = isGold ? 'Max 3/day • High conviction' : 'Speculative • Sizing léger';
  
  // ALPHA GOLD = CONSIDER, ALPHA EARLY = WATCH/SPECULATIVE
  const action = signal.suggestedAction?.toUpperCase() || (isGold ? 'CONSIDER' : 'WATCH');
  const confidence = signal.confidence || 0;
  const timing = signal.timingLabel || 'OPTIMAL';
  const window = signal.windowText || '30-90 min';
  const phase = signal.marketPhase || 'accumulation';
  const liq = formatCurrency(signal.liquidityUsd || signal.liquidity || 0);
  const mcap = formatCurrency(signal.marketCap || signal.market_cap || 0);
  const score = signal.score || 0;
  
  // Invalidations
  const invalidations = (signal.invalidatedIf || [])
    .slice(0, 3)
    .map(i => `• ${i}`)
    .join('\n');
  
  return `
${tierLabel} — ${symbol}

⏰ **TIMING: ${timing}** (${window})
📊 **Action:** ${action} | **Confidence:** ${confidence}%
🌊 **Phase:** ${phase.toUpperCase()}

💰 **Liquidity:** ${liq} | **MCap:** ${mcap}
📈 **Score:** ${score}/100

⚠️ **Invalidated if:**
${invalidations}

—
🤖 LURKER V2.1 • ${tierDesc}
🔗 Proof: github.com/lurker-base/lurker
  `.trim();
}

function formatCurrency(val) {
  if (!val || val === 0) return '$0';
  if (val >= 1000000) return '$' + (val/1000000).toFixed(2) + 'M';
  if (val >= 1000) return '$' + (val/1000).toFixed(1) + 'k';
  return '$' + Math.floor(val);
}

// Envoyer message Telegram
async function sendToTelegram(text) {
  if (CONFIG.testMode) {
    console.log('[TEST MODE] Message would be sent:\n', text);
    return { ok: true };
  }
  
  const url = `https://api.telegram.org/bot${CONFIG.token}/sendMessage`;
  const params = new URLSearchParams({
    chat_id: CONFIG.channel,
    text: text,
    parse_mode: 'Markdown',
    disable_web_page_preview: true
  });
  
  const res = await fetch(`${url}?${params}`);
  const data = await res.json();
  
  if (!data.ok) {
    throw new Error(`Telegram API error: ${data.description}`);
  }
  
  return data;
}

// Fetch ALPHA signals
async function fetchAlphaSignals() {
  const res = await fetch(CONFIG.alphaUrl + '?t=' + Date.now());
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return data.items || data || [];
}

// Main loop
async function main() {
  console.log('[ALPHA BOT] Starting...');
  console.log(`[ALPHA BOT] Channel: ${CONFIG.channel}`);
  console.log(`[ALPHA BOT] Test mode: ${CONFIG.testMode ? 'YES' : 'NO'}`);
  
  const state = await loadState();
  const signals = await fetchAlphaSignals();
  
  console.log(`[ALPHA BOT] Fetched ${signals.length} signals`);
  
  // Filtrer nouveaux signaux (GOLD + EARLY)
  const newSignals = signals.filter(s => {
    const key = signalKey(s);
    return !state.posted.includes(key) && (s.tier === 'ALPHA_GOLD' || s.tier === 'ALPHA_EARLY');
  });
  
  console.log(`[ALPHA BOT] New ALPHA signals: ${newSignals.length}`);
  
  if (newSignals.length === 0) {
    console.log('[ALPHA BOT] Nothing to post');
    return;
  }
  
  // Poster chaque nouveau signal
  for (const signal of newSignals) {
    try {
      const message = formatAlphaMessage(signal);
      await sendToTelegram(message);
      
      state.posted.push(signalKey(signal));
      console.log(`[ALPHA BOT] ✅ Posted: ${signal.symbol}`);
      
      // Rate limit entre messages
      await new Promise(r => setTimeout(r, 1000));
    } catch (err) {
      console.error(`[ALPHA BOT] ❌ Failed to post ${signal.symbol}:`, err.message);
    }
  }
  
  // Cleanup state (garder 50 derniers)
  if (state.posted.length > 50) {
    state.posted = state.posted.slice(-50);
  }
  
  await saveState(state);
  console.log('[ALPHA BOT] Done');
}

// Run
main().catch(err => {
  console.error('[ALPHA BOT] Fatal error:', err);
  process.exit(1);
});
