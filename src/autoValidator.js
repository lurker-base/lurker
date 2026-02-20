const axios = require('axios');
const fs = require('fs');
const path = require('path');

/**
 * LURKER Auto-Validator (DexScreener Version)
 * Analyse automatique sans attendre Dune
 */

const CONFIG = {
    signalsFile: path.join(__dirname, '../data/clankerLiveSignals.json'),
    resultsFile: path.join(__dirname, '../data/validatedSignals.json'),
    alertFile: path.join(__dirname, '../data/alerts.json'),
    checkDelayMs: 5 * 60 * 1000, // 5 minutes après détection
    pollInterval: 30 * 1000, // Vérifier toutes les 30s
    
    thresholds: {
        HOT: { minLiq: 30000, minVolume5m: 5000, minScore: 70 },
        WARM: { minLiq: 10000, minVolume5m: 1000, minScore: 40 },
        MIN_LIQ: 5000
    }
};

let validatedTokens = new Set();
let pendingValidation = [];
let alertsSent = new Set();

// Load data
function loadData() {
    try {
        if (fs.existsSync(CONFIG.resultsFile)) {
            const results = JSON.parse(fs.readFileSync(CONFIG.resultsFile, 'utf8'));
            results.forEach(r => validatedTokens.add(r.tokenAddress));
        }
        if (fs.existsSync(CONFIG.alertFile)) {
            const alerts = JSON.parse(fs.readFileSync(CONFIG.alertFile, 'utf8'));
            alerts.forEach(a => alertsSent.add(a.tokenAddress));
        }
    } catch(e) {}
}

// Analyse via DexScreener (gratuit, instantané)
async function analyzeWithDexScreener(tokenAddress) {
    try {
        const res = await axios.get(
            `https://api.dexscreener.com/latest/dex/tokens/${tokenAddress}`,
            { timeout: 10000 }
        );
        
        if (!res.data?.pairs?.length) {
            return { status: 'NO_LIQUIDITY', reason: 'Pas encore sur DexScreener' };
        }
        
        // Prendre la paire avec le plus de liquidité
        const pair = res.data.pairs.sort((a, b) => 
            (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0)
        )[0];
        
        const liquidity = parseFloat(pair.liquidity?.usd || 0);
        const volume5m = parseFloat(pair.volume?.m5 || 0);
        const volume1h = parseFloat(pair.volume?.h1 || 0);
        const marketCap = parseFloat(pair.marketCap || 0);
        const priceChange5m = parseFloat(pair.priceChange?.m5 || 0);
        const priceChange1h = parseFloat(pair.priceChange?.h1 || 0);
        const txns5m = (pair.txns?.m5?.buys || 0) + (pair.txns?.m5?.sells || 0);
        const txns1h = (pair.txns?.h1?.buys || 0) + (pair.txns?.h1?.sells || 0);
        
        // Score LURKER
        let score = 0;
        if (liquidity >= CONFIG.thresholds.HOT.minLiq) score += 30;
        else if (liquidity >= CONFIG.thresholds.WARM.minLiq) score += 20;
        else if (liquidity >= CONFIG.thresholds.MIN_LIQ) score += 10;
        
        if (volume5m >= CONFIG.thresholds.HOT.minVolume5m) score += 30;
        else if (volume5m >= CONFIG.thresholds.WARM.minVolume5m) score += 20;
        else if (volume5m >= 500) score += 10;
        
        if (priceChange5m > 0) score += 10;
        if (txns5m >= 10) score += 15;
        if (marketCap > 0 && marketCap < 1000000) score += 5; // Microcap
        
        // Déterminer signal
        let signal = 'DUST';
        let reason = [];
        
        if (score >= CONFIG.thresholds.HOT.minScore && 
            liquidity >= CONFIG.thresholds.HOT.minLiq &&
            volume5m >= CONFIG.thresholds.HOT.minVolume5m) {
            signal = 'HOT';
            reason.push('🔥 Fort volume + liquidité');
        } else if (score >= CONFIG.thresholds.WARM.minScore &&
                   liquidity >= CONFIG.thresholds.WARM.minLiq &&
                   volume5m >= CONFIG.thresholds.WARM.minVolume5m) {
            signal = 'WARM';
            reason.push('⚡ Bon momentum');
        } else if (liquidity < CONFIG.thresholds.MIN_LIQ) {
            signal = 'ILLIQUID';
            reason.push('💀 Pas assez de liquidité');
        } else {
            signal = 'LOW';
            reason.push('📊 Faible activité');
        }
        
        return {
            status: signal,
            score,
            reason: reason.join(', '),
            liquidityUsd: liquidity,
            volume5m,
            volume1h,
            marketCap,
            priceChange5m,
            priceChange1h,
            txns5m,
            txns1h,
            pairAddress: pair.pairAddress,
            dexId: pair.dexId,
            url: pair.url,
            analyzedAt: Date.now()
        };
        
    } catch(e) {
        return { status: 'ERROR', reason: e.message };
    }
}

// Alert console (à remplacer par Telegram)
function sendAlert(token, analysis) {
    const alertKey = `${token.contract_address}_${analysis.status}`;
    if (alertsSent.has(alertKey)) return; // Pas de spam
    
    alertsSent.add(alertKey);
    
    const emoji = analysis.status === 'HOT' ? '🔥🔥🔥' : '⚡⚡';
    const message = `
${emoji} LURKER ALERT ${analysis.status} ${emoji}

Token: $${token.symbol}
├ Address: ${token.contract_address}
├ Age: ${Math.floor((Date.now() - token.detectedAt) / 60000)}min
├ DEX: ${analysis.dexId}
└ URL: ${analysis.url}

📊 Metrics:
├ Liq: $${analysis.liquidityUsd?.toLocaleString()}
├ Vol 5m: $${analysis.volume5m?.toLocaleString()}
├ Vol 1h: $${analysis.volume1h?.toLocaleString()}
├ Txns 5m: ${analysis.txns5m}
├ Price Δ5m: ${analysis.priceChange5m?.toFixed(2)}%
├ Market Cap: $${analysis.marketCap?.toLocaleString()}
└ Score: ${analysis.score}/100

${analysis.reason}

Time: ${new Date().toLocaleTimeString()}
`;
    
    console.log(message);
    
    // Sauvegarder alerte
    let alerts = [];
    try {
        if (fs.existsSync(CONFIG.alertFile)) {
            alerts = JSON.parse(fs.readFileSync(CONFIG.alertFile, 'utf8'));
        }
    } catch(e) {}
    
    alerts.unshift({
        tokenAddress: token.contract_address,
        symbol: token.symbol,
        status: analysis.status,
        score: analysis.score,
        message,
        sentAt: Date.now()
    });
    
    fs.writeFileSync(CONFIG.alertFile, JSON.stringify(alerts.slice(0, 100), null, 2));
}

// Process queue
async function processQueue() {
    const now = Date.now();
    
    const ready = pendingValidation.filter(t => 
        (now - t.detectedAt) >= CONFIG.checkDelayMs &&
        !validatedTokens.has(t.contract_address)
    );
    
    if (ready.length === 0) return;
    
    console.log(`[AUTO] Processing ${ready.length} tokens for validation...`);
    
    for (const token of ready) {
        // Retirer de la queue
        pendingValidation = pendingValidation.filter(p => 
            p.contract_address !== token.contract_address
        );
        
        console.log(`[AUTO] Analyzing ${token.symbol}...`);
        
        // Analyse DexScreener
        const analysis = await analyzeWithDexScreener(token.contract_address);
        
        // Sauvegarder résultat
        validatedTokens.add(token.contract_address);
        
        const result = {
            tokenAddress: token.contract_address,
            symbol: token.symbol,
            detectedAt: token.detectedAt,
            validatedAt: Date.now(),
            ...analysis
        };
        
        let results = [];
        try {
            if (fs.existsSync(CONFIG.resultsFile)) {
                results = JSON.parse(fs.readFileSync(CONFIG.resultsFile, 'utf8'));
            }
        } catch(e) {}
        
        results.unshift(result);
        fs.writeFileSync(CONFIG.resultsFile, JSON.stringify(results.slice(0, 500), null, 2));
        
        // Alerte si HOT/WARM
        if (analysis.status === 'HOT' || analysis.status === 'WARM') {
            sendAlert(token, analysis);
        } else {
            console.log(`[AUTO] ${token.symbol}: ${analysis.status} (Score: ${analysis.score})`);
        }
        
        // Délai entre analyses pour pas surcharger API
        await new Promise(r => setTimeout(r, 1000));
    }
}

// Load new signals
function loadNewSignals() {
    try {
        if (!fs.existsSync(CONFIG.signalsFile)) return;
        
        const signals = JSON.parse(fs.readFileSync(CONFIG.signalsFile, 'utf8'));
        const now = Date.now();
        
        let newCount = 0;
        
        for (const signal of signals) {
            const addr = signal.contract_address || signal.address;
            if (!addr) continue;
            
            if (pendingValidation.some(p => p.contract_address === addr)) continue;
            if (validatedTokens.has(addr)) continue;
            
            pendingValidation.push({
                contract_address: addr,
                symbol: signal.symbol || 'UNKNOWN',
                name: signal.name || '',
                detectedAt: signal.detectedAt || signal.timestamp || now,
                addedToQueue: now
            });
            newCount++;
        }
        
        if (newCount > 0) {
            console.log(`[AUTO] +${newCount} new tokens queued (Total pending: ${pendingValidation.length})`);
        }
        
    } catch(e) {
        console.error('[AUTO] Load error:', e.message);
    }
}

// Stats
function showStats() {
    console.log('\n[LURKER] Stats:');
    console.log(`  Pending: ${pendingValidation.length}`);
    console.log(`  Validated: ${validatedTokens.size}`);
    console.log(`  Next check: ${CONFIG.checkDelayMs / 60000}min après détection`);
    console.log('');
}

// Start
console.log('[AUTO] LURKER Auto-Validator (DexScreener)');
console.log('[AUTO] Valide les tokens 5min après détection');
console.log('[AUTO] Alerte uniquement si HOT ou WARM\n');

loadData();
showStats();

// Loops
setInterval(loadNewSignals, 10000); // Check new signals every 10s
setInterval(processQueue, CONFIG.pollInterval);
setInterval(showStats, 60000); // Stats every minute

// First run
loadNewSignals();
setTimeout(processQueue, 5000);
