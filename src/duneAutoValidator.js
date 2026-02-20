const axios = require('axios');
const fs = require('fs');
const path = require('path');

/**
 * LURKER Dune Auto-Validator
 * Analyse automatiquement chaque token détecté via Dune
 */

const CONFIG = {
    apiKey: 'StAmNTvnKwEb7ue2Cto5IethDa3kunBj',
    baseUrl: 'https://api.dune.com/api/v1',
    signalsFile: path.join(__dirname, '../data/clankerLiveSignals.json'),
    resultsFile: path.join(__dirname, '../data/duneValidated.json'),
    checkDelayMs: 10 * 60 * 1000, // Attendre 10 minutes après détection
    pollInterval: 60 * 1000, // Vérifier toutes les minutes
    
    // Seuils pour alerte
    thresholds: {
        HOT: { minVolume: 50000, minBuyers: 100 },
        WARM: { minVolume: 10000, minBuyers: 30 },
        MIN_VOLUME: 1000 // Ignore en dessous
    }
};

const headers = {
    'X-Dune-API-Key': CONFIG.apiKey,
    'Content-Type': 'application/json'
};

let validatedTokens = new Set();
let pendingValidation = []; // Tokens en attente des 10min

// Load existing
function loadData() {
    try {
        if (fs.existsSync(CONFIG.resultsFile)) {
            const results = JSON.parse(fs.readFileSync(CONFIG.resultsFile, 'utf8'));
            results.forEach(r => validatedTokens.add(r.tokenAddress));
        }
    } catch(e) {}
}

// Execute Dune query
async function executeQuery(queryId, params) {
    try {
        // Lancer
        const execRes = await axios.post(
            `${CONFIG.baseUrl}/query/${queryId}/execute`,
            { query_parameters: params },
            { headers, timeout: 30000 }
        );
        
        const executionId = execRes.data.execution_id;
        
        // Poll
        let status = 'PENDING';
        let attempts = 0;
        while ((status === 'PENDING' || status === 'EXECUTING') && attempts < 30) {
            await new Promise(r => setTimeout(r, 2000));
            const statusRes = await axios.get(
                `${CONFIG.baseUrl}/execution/${executionId}/status`,
                { headers }
            );
            status = statusRes.data.state;
            attempts++;
        }
        
        if (status !== 'QUERY_STATE_COMPLETED') return null;
        
        // Results
        const resultsRes = await axios.get(
            `${CONFIG.baseUrl}/execution/${executionId}/results`,
            { headers }
        );
        
        return resultsRes.data.result?.rows?.[0] || null;
        
    } catch(e) {
        console.error('[DUNE-AUTO] Query error:', e.message);
        return null;
    }
}

// Analyse un token via Dune
async function analyzeToken(tokenAddress, symbol) {
    console.log(`[DUNE-AUTO] Analyzing ${symbol} (${tokenAddress.slice(0, 20)}...)`);
    
    // NOTE: Remplacer par ton vrai query ID quand créé sur dune.com
    // Pour l'instant, on simule
    const queryId = process.env.DUNE_QUERY_ID || 'YOUR_QUERY_ID_HERE';
    
    if (queryId === 'YOUR_QUERY_ID_HERE') {
        console.log('[DUNE-AUTO] Query ID not set — skipping Dune analysis');
        return null;
    }
    
    const result = await executeQuery(queryId, { token_address: tokenAddress });
    
    if (!result) {
        return { status: 'NO_DATA', reason: 'Pas encore de trades' };
    }
    
    // Déterminer signal
    const volume = parseFloat(result.volume_usd || 0);
    const buyers = parseInt(result.unique_buyers || 0);
    
    let signal = 'DUST';
    if (volume >= CONFIG.thresholds.HOT.minVolume && buyers >= CONFIG.thresholds.HOT.minBuyers) {
        signal = 'HOT';
    } else if (volume >= CONFIG.thresholds.WARM.minVolume && buyers >= CONFIG.thresholds.WARM.minBuyers) {
        signal = 'WARM';
    } else if (volume >= CONFIG.thresholds.MIN_VOLUME) {
        signal = 'LOW';
    }
    
    return {
        tokenAddress,
        symbol,
        volumeUsd: volume,
        uniqueBuyers: buyers,
        totalTrades: parseInt(result.total_trades || 0),
        avgTradeSize: parseFloat(result.avg_trade_size || 0),
        firstTrade: result.first_trade,
        lastTrade: result.last_trade,
        lurkerSignal: result.lurker_signal || signal,
        status: signal,
        analyzedAt: Date.now()
    };
}

// Alert Telegram
async function sendAlert(analysis) {
    // TODO: Intégrer avec ton bot Telegram
    console.log(`\n🚨🚨🚨 ALERTE ${analysis.status} 🚨🚨🚨`);
    console.log(`Token: $${analysis.symbol}`);
    console.log(`Volume 1h: $${analysis.volumeUsd?.toLocaleString()}`);
    console.log(`Buyers: ${analysis.uniqueBuyers}`);
    console.log(`Trades: ${analysis.totalTrades}`);
    console.log(`Signal: ${analysis.lurkerSignal}`);
    console.log(`Address: ${analysis.tokenAddress}\n`);
    
    // Ici tu ajouteras l'envoi Telegram
}

// Main loop
async function processQueue() {
    const now = Date.now();
    
    // Tokens prêts pour validation (10min écoulées)
    const ready = pendingValidation.filter(t => 
        (now - t.detectedAt) >= CONFIG.checkDelayMs
    );
    
    for (const token of ready) {
        // Retirer de la queue
        pendingValidation = pendingValidation.filter(p => 
            p.contract_address !== token.contract_address
        );
        
        // Skip si déjà validé
        if (validatedTokens.has(token.contract_address)) continue;
        
        // Analyser
        const analysis = await analyzeToken(
            token.contract_address, 
            token.symbol
        );
        
        if (!analysis) continue;
        
        // Sauvegarder
        validatedTokens.add(token.contract_address);
        let results = [];
        try {
            if (fs.existsSync(CONFIG.resultsFile)) {
                results = JSON.parse(fs.readFileSync(CONFIG.resultsFile, 'utf8'));
            }
        } catch(e) {}
        
        results.unshift(analysis);
        fs.writeFileSync(CONFIG.resultsFile, JSON.stringify(results.slice(0, 500), null, 2));
        
        // Alerte si HOT ou WARM
        if (analysis.status === 'HOT' || analysis.status === 'WARM') {
            await sendAlert(analysis);
        } else {
            console.log(`[DUNE-AUTO] ${token.symbol}: ${analysis.status} (ignoré)`);
        }
    }
}

// Load new signals
function loadNewSignals() {
    try {
        if (!fs.existsSync(CONFIG.signalsFile)) return;
        
        const signals = JSON.parse(fs.readFileSync(CONFIG.signalsFile, 'utf8'));
        const now = Date.now();
        
        for (const signal of signals) {
            const addr = signal.contract_address || signal.address;
            
            // Skip si déjà en attente ou validé
            if (pendingValidation.some(p => p.contract_address === addr)) continue;
            if (validatedTokens.has(addr)) continue;
            
            // Ajouter à la queue (même si détecté y a longtemps)
            pendingValidation.push({
                contract_address: addr,
                symbol: signal.symbol,
                detectedAt: signal.detectedAt || now,
                addedToQueue: now
            });
        }
        
        if (pendingValidation.length > 0) {
            console.log(`[DUNE-AUTO] Queue: ${pendingValidation.length} tokens pending`);
        }
        
    } catch(e) {
        console.error('[DUNE-AUTO] Load error:', e.message);
    }
}

// Start
console.log('[DUNE-AUTO] LURKER Auto-Validator');
console.log('[DUNE-AUTO] Attente: 10min après détection');
console.log('[DUNE-AUTO] Check interval: 1min\n');

loadData();

// Main loop
setInterval(() => {
    loadNewSignals();
    processQueue();
}, CONFIG.pollInterval);

// First run
loadNewSignals();
