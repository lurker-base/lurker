#!/bin/bash
# LURKER Enhanced Enrich - Scoring avancé et système Pulse

cd /data/.openclaw/workspace/lurker-project
node -e "
const fs = require('fs');
const axios = require('axios');

const SIGNALS_FILE = './data/allClankerSignals.json';
const PULSE_FILE = './data/pulseSignals.json';
const ALERTS_FILE = './data/alerts.json';

// Configuration scoring
const SCORE_CONFIG = {
    LIQ_HIGH: 40,      // >$100k
    LIQ_MED: 30,       // >$50k
    LIQ_LOW: 20,       // >$10k
    VOL_HIGH: 30,      // >$10k/5min
    VOL_MED: 20,       // >$5k/5min
    TX_HIGH: 20,       // >100 txns/5min
    TX_MED: 10,        // >50 txns/5min
    PRICE_UP: 15,      // +10% price
    AGE_BONUS: 10,     // <30min old
    MCAP_BONUS: 10     // MC > $500k
};

async function loadJson(path, defaultVal = []) {
    try { return JSON.parse(fs.readFileSync(path, 'utf8')); } catch(e) { return defaultVal; }
}

async function saveJson(path, data) {
    fs.writeFileSync(path, JSON.stringify(data, null, 2));
}

function calculateScore(p, t) {
    let score = 0;
    let reasons = [];
    
    const liq = parseFloat(p.liquidity?.usd || 0);
    const vol5m = parseFloat(p.volume?.m5 || 0);
    const vol1h = parseFloat(p.volume?.h1 || 0);
    const vol24h = parseFloat(p.volume?.h24 || 0);
    const tx5m = parseInt(p.txns?.m5?.buys || 0) + parseInt(p.txns?.m5?.sells || 0);
    const tx1h = parseInt(p.txns?.h1?.buys || 0) + parseInt(p.txns?.h1?.sells || 0);
    const mcap = parseFloat(p.marketCap || 0);
    const priceChange = parseFloat(p.priceChange?.m5 || 0);
    
    // Liquidité
    if (liq >= 100000) { score += SCORE_CONFIG.LIQ_HIGH; reasons.push('liq100k'); }
    else if (liq >= 50000) { score += SCORE_CONFIG.LIQ_MED; reasons.push('liq50k'); }
    else if (liq >= 10000) { score += SCORE_CONFIG.LIQ_LOW; reasons.push('liq10k'); }
    
    // Volume momentum
    if (vol5m >= 10000) { score += SCORE_CONFIG.VOL_HIGH; reasons.push('vol10k5m'); }
    else if (vol5m >= 5000) { score += SCORE_CONFIG.VOL_MED; reasons.push('vol5k5m'); }
    
    // Transactions
    if (tx5m >= 100) { score += SCORE_CONFIG.TX_HIGH; reasons.push('tx100'); }
    else if (tx5m >= 50) { score += SCORE_CONFIG.TX_MED; reasons.push('tx50'); }
    
    // Price action
    if (priceChange >= 10) { score += SCORE_CONFIG.PRICE_UP; reasons.push('priceUp'); }
    
    // Market cap
    if (mcap >= 500000) { score += SCORE_CONFIG.MCAP_BONUS; reasons.push('mcap500k'); }
    
    // Age bonus
    const ageMin = t.ageMinutes || Math.floor((Date.now() - t.detectedAt) / 60000);
    if (ageMin < 30) { score += SCORE_CONFIG.AGE_BONUS; reasons.push('fresh'); }
    
    return { score, reasons, liq, vol5m, vol1h, vol24h, tx5m, tx1h, mcap, priceChange };
}

function determineStatus(score, liq, vol5m, tx5m) {
    // HOT: Score élevé + liquidité solide + momentum
    if (score >= 70 && liq >= 50000 && vol5m >= 5000 && tx5m >= 30) return 'HOT';
    // WARM: Bon score ou bonne liquidité
    if (score >= 40 && liq >= 10000) return 'WARM';
    // COLD: A de la liquidité mais peu d'activité
    if (liq > 0) return 'COLD';
    return 'FRESH';
}

async function enrich() {
    let tokens = await loadJson(SIGNALS_FILE);
    let pulseSignals = await loadJson(PULSE_FILE);
    let alerts = await loadJson(ALERTS_FILE);
    
    // Tokens à enrichir: ceux sans liquidité (FRESH ou undefined) et âge < 90min
    const toEnrich = tokens.filter(t => {
        const age = t.ageMinutes || Math.floor((Date.now() - t.detectedAt) / 60000);
        const hasLiq = (t.liquidityUsd || 0) > 0;
        return !hasLiq && age < 90;
    });
    
    if (toEnrich.length === 0) {
        console.log('[ENRICH] No tokens to enrich');
        return;
    }
    
    console.log('[ENRICH] Checking ' + toEnrich.length + ' tokens...');
    let updated = 0;
    let newPulse = 0;
    
    for (const t of toEnrich) {
        try {
            const res = await axios.get('https://api.dexscreener.com/latest/dex/tokens/' + t.contract_address, {
                timeout: 10000,
                headers: { 'User-Agent': 'Mozilla/5.0' }
            });
            
            if (res.data?.pairs?.length > 0) {
                const p = res.data.pairs[0];
                const calc = calculateScore(p, t);
                
                if (calc.liq > 0) {
                    // Mise à jour token
                    t.liquidityUsd = calc.liq;
                    t.marketCap = calc.mcap;
                    t.volume24h = calc.vol24h;
                    t.volume1h = calc.vol1h;
                    t.volume5m = calc.vol5m;
                    t.txns5m = calc.tx5m;
                    t.txns1h = calc.tx1h;
                    t.priceUsd = parseFloat(p.priceUsd || 0);
                    t.priceChange5m = calc.priceChange;
                    t.dexId = p.dexId;
                    t.url = p.url;
                    t.score = calc.score;
                    t.scoreReasons = calc.reasons;
                    t.lastUpdated = Date.now();
                    
                    // Détermination statut
                    const oldStatus = t.status;
                    t.status = determineStatus(calc.score, calc.liq, calc.vol5m, calc.tx5m);
                    
                    const emoji = t.status === 'HOT' ? '🔥' : t.status === 'WARM' ? '⚡' : '💧';
                    console.log(emoji + ' ' + t.symbol + ' | Score:' + t.score + ' | Liq:$' + calc.liq.toLocaleString() + ' | ' + t.status);
                    
                    // Si HOT ou WARM → ajouter à Pulse
                    if ((t.status === 'HOT' || t.status === 'WARM') && oldStatus !== t.status) {
                        const pulseEntry = {
                            ...t,
                            promotedAt: Date.now(),
                            promotionReason: calc.reasons.join(', ')
                        };
                        
                        // Vérifier si déjà dans Pulse
                        const exists = pulseSignals.find(p => p.address === t.address);
                        if (!exists) {
                            pulseSignals.unshift(pulseEntry);
                            pulseSignals = pulseSignals.slice(0, 50); // Max 50
                            newPulse++;
                            
                            // Créer alerte
                            alerts.unshift({
                                type: t.status,
                                symbol: t.symbol,
                                address: t.contract_address,
                                score: t.score,
                                liquidity: t.liquidityUsd,
                                marketCap: t.marketCap,
                                detectedAt: Date.now(),
                                message: t.status + ' signal: $' + t.symbol + ' (Score: ' + t.score + ')'
                            });
                            alerts = alerts.slice(0, 20);
                            
                            console.log('🎯 PULSE → $' + t.symbol + ' promoted to ' + t.status);
                        }
                    }
                    
                    updated++;
                }
            }
        } catch(e) {
            // Silencieux pour ne pas spammer
        }
        await new Promise(r => setTimeout(r, 300));
    }
    
    // Sauvegarde
    if (updated > 0) {
        await saveJson(SIGNALS_FILE, tokens);
        console.log('[ENRICH] ' + updated + ' tokens updated');
    }
    if (newPulse > 0) {
        await saveJson(PULSE_FILE, pulseSignals);
        await saveJson(ALERTS_FILE, alerts);
        console.log('[PULSE] ' + newPulse + ' new signals promoted');
    }
    
    // Stats
    const hot = tokens.filter(t => t.status === 'HOT').length;
    const warm = tokens.filter(t => t.status === 'WARM').length;
    const cold = tokens.filter(t => t.status === 'COLD').length;
    const fresh = tokens.filter(t => t.status === 'FRESH').length;
    console.log('[STATS] HOT:' + hot + ' WARM:' + warm + ' COLD:' + cold + ' FRESH:' + fresh + ' | Pulse DB: ' + pulseSignals.length);
}

enrich().catch(console.error);
"