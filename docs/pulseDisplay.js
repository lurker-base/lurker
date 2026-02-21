/**
 * LURKER Pulse Display - Affiche les signaux HOT/WARM validés
 */

// Base URL dynamique pour GitHub Pages (/lurker/) ou local (/)
function getBasePath() {
    const path = window.location.pathname;
    const parts = path.split('/').filter(Boolean);
    // Si on est sur GH Pages avec /lurker/, on prend le premier segment
    if (parts.length >= 1 && parts[0] === 'lurker') {
        return '/lurker/';
    }
    return '/';
}

const BASE_PATH = getBasePath();

const PULSE_CONFIG = {
    signalsUrl: BASE_PATH + 'data/pulseSignals.v2.alpha.json',
    publicSignalsUrl: BASE_PATH + 'data/pulseSignals.v2.public.json',
    allSignalsUrl: BASE_PATH + 'data/allSignals.json',
    pollInterval: 15000,
    maxDisplay: 20
};

function fmt$(val) {
    if (!val || val === 0) return '$0';
    if (val >= 1000000) return '$' + (val/1000000).toFixed(2) + 'M';
    if (val >= 1000) return '$' + (val/1000).toFixed(1) + 'k';
    return '$' + Math.floor(val);
}

function fmtAge(minutes) {
    if (!minutes || minutes < 1) return 'just now';
    if (minutes < 60) return Math.floor(minutes) + 'min';
    if (minutes < 1440) return Math.floor(minutes/60) + 'h';
    return Math.floor(minutes/1440) + 'd';
}

function truncateAddr(addr) {
    if (!addr || addr.length < 10) return addr || '???';
    return addr.slice(0, 6) + '...' + addr.slice(-4);
}

function getStatusClass(status, score) {
    if (status === 'HOT' || score >= 70) return 'signal-high';
    if (status === 'WARM' || score >= 40) return 'signal-medium';
    return 'signal-low';
}

function getScoreClass(status, score) {
    if (status === 'HOT' || score >= 70) return 'high';
    if (status === 'WARM' || score >= 40) return 'medium';
    return 'low';
}

function getScoreReasons(reasons) {
    if (!reasons || !Array.isArray(reasons)) return [];
    const reasonMap = {
        'liq100k': 'High liquidity',
        'liq50k': 'Good liquidity',
        'liq10k': 'Medium liquidity',
        'vol10k5m': 'High vol 5m',
        'vol5k5m': 'Good volume',
        'tx100': 'Active trading',
        'tx50': 'Some activity',
        'priceUp': 'Price rising',
        'mcap500k': 'Large mcap',
        'fresh': 'Fresh launch'
    };
    return reasons.map(r => reasonMap[r] || r);
}

function createAlphaDecisionBlock(s) {
    // Only for ALPHA tier
    if (s.tier !== 'ALPHA') return '';
    
    // Map WATCH to CONSIDER for ALPHA tier (never show WATCH in premium)
    let action = (s.suggestedAction || 'CONSIDER').toUpperCase();
    if (action === 'WATCH') action = 'CONSIDER';
    
    // Timing label from earlyLateScore
    const els = s.earlyLateScore || 50;
    let timingLabel = 'OPTIMAL';
    let timingClass = 'optimal';
    if (els <= 25) { timingLabel = 'EARLY'; timingClass = 'early'; }
    else if (els <= 60) { timingLabel = 'OPTIMAL'; timingClass = 'optimal'; }
    else if (els <= 75) { timingLabel = 'LATE'; timingClass = 'late'; }
    else { timingLabel = 'FOMO'; timingClass = 'fomo'; }
    
    // Window estimate based on timing
    let windowText = '30-90 min';
    if (els <= 25) windowText = '60-180 min';
    else if (els <= 60) windowText = '30-90 min';
    else if (els <= 75) windowText = '10-30 min';
    else windowText = '0-10 min';
    
    // Phase
    const phase = (s.marketPhase || 'accumulation').toUpperCase();
    
    // Invalidations
    const invalidations = (s.invalidatedIf || []).slice(0, 3);
    
    return `
        <div class="alpha-decision-block">
            <div class="alpha-header">
                <span class="alpha-badge">🎯 ALPHA DECISION</span>
                <span class="alpha-rarity">${s.tier} • 3-5/day</span>
            </div>
            <div class="alpha-grid">
                <div class="alpha-item">
                    <span class="alpha-label">Action</span>
                    <span class="alpha-value alpha-action">${action}</span>
                </div>
                <div class="alpha-item">
                    <span class="alpha-label">Confidence</span>
                    <span class="alpha-value">${s.confidence || 0}%</span>
                </div>
                <div class="alpha-item">
                    <span class="alpha-label">Timing</span>
                    <span class="alpha-value alpha-timing ${timingClass}">${timingLabel}</span>
                </div>
                <div class="alpha-item">
                    <span class="alpha-label">Phase</span>
                    <span class="alpha-value">${phase}</span>
                </div>
            </div>
            <div class="alpha-window">
                <span class="alpha-window-label">Window:</span>
                <span class="alpha-window-value">${windowText}</span>
            </div>
            ${invalidations.length > 0 ? `
            <div class="alpha-invalidations">
                <span class="alpha-inv-title">⚠️ Invalidated if:</span>
                <ul class="alpha-inv-list">
                    ${invalidations.map(inv => `<li>• ${inv}</li>`).join('')}
                </ul>
            </div>
            ` : ''}
            <div class="alpha-proof">
                <span>Proof: <a href="https://github.com/lurker-base/lurker/commit/main" target="_blank">GitHub commit</a> • LURKER V2.1</span>
            </div>
        </div>
    `;
}

function createPulseCard(s) {
    const div = document.createElement('div');
    const statusClass = getStatusClass(s.status, s.score);
    const scoreClass = getScoreClass(s.status, s.score);
    
    div.className = `token-signal ${statusClass} ${s.tier === 'ALPHA' ? 'signal-alpha' : ''}`;
    
    const addr = s.contract_address || s.address || '???';
    const symbol = s.symbol || '???';
    const name = s.name || symbol;
    const age = s.ageMinutes || Math.floor((Date.now() - s.detectedAt) / 60000);
    const score = s.score || 0;
    const reasons = getScoreReasons(s.scoreReasons);
    
    const liq = s.liquidityUsd || s.liquidity || 0;
    const mcap = s.marketCap || s.market_cap || 0;
    const vol5m = s.volume5m || 0;
    const vol1h = s.volume1h || 0;
    const vol24h = s.volume24h || s.volume_24h || s.volume || 0;
    
    // Déterminer si on affiche les vraies données ou des badges qualitatifs
    const isPremium = s.tier === 'ALPHA_GOLD' || s.tier === 'ALPHA_EARLY';
    
    // Badges qualitatifs pour le public (pas de chiffres faux)
    function getLiqBadge(val) {
        if (val >= 500000) return '<span class="metric-badge high">HIGH</span>';
        if (val >= 200000) return '<span class="metric-badge medium">MEDIUM</span>';
        if (val >= 50000) return '<span class="metric-badge low">LOW</span>';
        return '<span class="metric-badge">-</span>';
    }
    function getVolBadge(val) {
        if (val >= 10000) return '<span class="vol-badge high">HIGH</span>';
        if (val >= 2000) return '<span class="vol-badge medium">MED</span>';
        if (val > 0) return '<span class="vol-badge low">LOW</span>';
        return '<span class="vol-badge">-</span>';
    }
    const tx5m = s.txns5m || 0;
    const tx1h = s.txns1h || 0;
    const price = s.priceUsd || s.price || 0;
    const priceChange = s.priceChange5m || 0;
    
    // Badges dynamiques
    const badges = [];
    if (s.status === 'HOT') badges.push('<span class="check-badge check-pass">🔥 HOT</span>');
    else if (s.status === 'WARM') badges.push('<span class="check-badge check-pass">⚡ WARM</span>');
    
    reasons.forEach(r => {
        badges.push(`<span class="check-badge check-pass">✓ ${r}</span>`);
    });
    
    if (priceChange >= 10) badges.push('<span class="check-badge check-neutral">📈 +' + priceChange.toFixed(1) + '%</span>');
    if (tx5m >= 50) badges.push('<span class="check-badge check-pass">🔄 ' + tx5m + ' txs</span>');
    
    // ALPHA DECISION block (only for ALPHA tier)
    const alphaBlock = createAlphaDecisionBlock(s);
    
    div.innerHTML = `
        ${alphaBlock}
        <div class="token-header">
            <div class="token-identity">
                <span class="token-name">$${symbol}</span>
                <span class="token-address">${truncateAddr(addr)}</span>
            </div>
            <div class="token-confidence">
                <span class="confidence-score ${scoreClass}">${score}</span>
                <span class="confidence-label">score</span>
            </div>
        </div>
        <div class="token-metrics">
            <div class="metric-item">
                <span class="metric-label">price</span>
                <span class="metric-value">${price > 0 ? '$' + price.toFixed(6) : '-'}</span>
            </div>
            <div class="metric-item">
                <span class="metric-label">liquidity</span>
                <span class="metric-value">${isPremium ? fmt$(liq) : getLiqBadge(liq)}</span>
            </div>
            <div class="metric-item">
                <span class="metric-label">mkt cap</span>
                <span class="metric-value">${isPremium ? fmt$(mcap) : (mcap > 1000000 ? '$'+(mcap/1000000).toFixed(1)+'M' : mcap > 1000 ? '$'+(mcap/1000).toFixed(0)+'k' : '-')}</span>
            </div>
            <div class="metric-item">
                <span class="metric-label">age</span>
                <span class="metric-value">${fmtAge(age)}</span>
            </div>
        </div>
        ${isPremium ? `
        <div class="volume-row">
            <span class="volume-label">vol 5m:</span>
            <span class="volume-value ${vol5m >= 5000 ? 'high' : vol5m < 1000 ? 'low' : ''}">${fmt$(vol5m)}</span>
            <span class="volume-label">1h:</span>
            <span class="volume-value">${fmt$(vol1h)}</span>
            <span class="volume-label">24h:</span>
            <span class="volume-value">${fmt$(vol24h)}</span>
        </div>
        ` : `
        <div class="volume-row badges">
            <span class="volume-label">volume:</span>
            ${getVolBadge(vol5m)}
        </div>
        `}
        <div class="token-checks">
            ${badges.join('')}
        </div>
        <div class="token-links">
            <a href="https://dexscreener.com/base/${addr}" target="_blank" class="token-link">dexscreener →</a>
            <a href="https://basescan.org/address/${addr}" target="_blank" class="token-link">basescan →</a>
            ${s.url ? `<a href="${s.url}" target="_blank" class="token-link">trade →</a>` : ''}
        </div>
        <span class="source-badge">${s.source || 'clanker'}</span>
    `;
    
    return div;
}

async function loadPulseSignals() {
    const feed = document.getElementById('pulse-feed');
    if (!feed) return;
    
    feed.innerHTML = `
        <div class="no-signals" id="loading-state">
            <div class="no-signals-icon">⏳</div>
            <p>Loading signals...</p>
        </div>
    `;
    
    let signals = [];
    let source = '';
    
    try {
        // 1. Essayer ALPHA signals (V2.1 premium)
        try {
            const res = await fetch(PULSE_CONFIG.signalsUrl + '?t=' + Date.now());
            if (res.ok) {
                const data = await res.json();
                const items = data.items || data;
                if (Array.isArray(items) && items.length > 0) {
                    signals = items;
                    source = 'alpha-v2.1';
                    console.log('[PULSE] Loaded ALPHA signals:', items.length);
                }
            }
        } catch(e) {
            console.log('[PULSE] ALPHA fetch failed:', e.message);
        }
        
        // 2. Fallback sur public signals
        if (signals.length === 0) {
            try {
                const res = await fetch(PULSE_CONFIG.publicSignalsUrl + '?t=' + Date.now());
                if (res.ok) {
                    const data = await res.json();
                    const items = data.items || data;
                    if (Array.isArray(items) && items.length > 0) {
                        signals = items;
                        source = 'public-v2.1';
                        console.log('[PULSE] Loaded public signals:', items.length);
                    }
                }
            } catch(e) {
                console.log('[PULSE] Public fetch failed:', e.message);
            }
        }
        
        // 3. Fallback legacy allSignals
        if (signals.length === 0) {
            try {
                const res = await fetch(PULSE_CONFIG.allSignalsUrl + '?t=' + Date.now());
                if (res.ok) {
                    const all = await res.json();
                    signals = all.filter(s => s.status === 'HOT' || s.status === 'WARM');
                    source = 'legacy';
                    console.log('[PULSE] Loaded legacy signals:', signals.length);
                }
            } catch(e) {
                console.log('[PULSE] Legacy fetch failed:', e.message);
            }
        }
    } catch(e) {
        console.error('[PULSE] Fatal load error:', e);
    }
    
    feed.innerHTML = '';
    
    if (signals.length === 0) {
        feed.innerHTML = `
            <div class="no-signals">
                <div class="no-signals-icon">👁️</div>
                <p>No signals yet</p>
                <p style="font-size: 0.8rem; opacity: 0.6; margin-top: 0.5rem;">
                    Scanner is running. ALPHA signals appear here (3-5/day).
                </p>
            </div>
        `;
        updateStats(0, 0, 0, source);
        return;
    }
    
    // Trier: ALPHA first, then by score
    signals.sort((a, b) => {
        if (a.tier === 'ALPHA' && b.tier !== 'ALPHA') return -1;
        if (b.tier === 'ALPHA' && a.tier !== 'ALPHA') return 1;
        const scoreDiff = (b.score || 0) - (a.score || 0);
        if (scoreDiff !== 0) return scoreDiff;
        return (b.liquidityUsd || 0) - (a.liquidityUsd || 0);
    });
    
    signals.slice(0, PULSE_CONFIG.maxDisplay).forEach(s => {
        feed.appendChild(createPulseCard(s));
    });
    
    // Stats
    const alpha = signals.filter(s => s.tier === 'ALPHA').length;
    const hot = signals.filter(s => s.status === 'HOT' || s.tier === 'HOT').length;
    const warm = signals.filter(s => s.status === 'WARM' || s.tier === 'WARM').length;
    updateStats(signals.length, alpha, hot, warm, source);
}

function updateStats(total, alpha, hot, warm, source) {
    // Mettre à jour le compteur scanné
    const scannedEl = document.querySelector('.filter-value');
    if (scannedEl) {
        if (alpha > 0) {
            scannedEl.textContent = `${total} signals (${alpha} ALPHA, ${hot} HOT)`;
        } else if (total > 0) {
            scannedEl.textContent = `${total} signals (${hot} HOT, ${warm} WARM)`;
        } else {
            scannedEl.textContent = '0 signals';
        }
    }
    
    // Mettre à jour le texte "listening"
    const listeningText = document.querySelector('.listening-pulse span:last-child');
    if (listeningText) {
        if (alpha > 0) {
            listeningText.textContent = `${alpha} ALPHA signal${alpha > 1 ? 's' : ''} detected — premium tier`;
        } else if (total > 0) {
            listeningText.textContent = `${total} signals — waiting for ALPHA tier`;
        } else {
            listeningText.textContent = 'Listening for new tokens...';
        }
    }
    
    console.log('[PULSE] Stats updated:', { total, alpha, hot, warm, source });
}

// Sparks effect
const sparksContainer = document.getElementById('sparks');
if (sparksContainer) {
    for (let i = 0; i < 12; i++) {
        const spark = document.createElement('div');
        spark.className = 'spark';
        spark.style.left = Math.random() * 100 + '%';
        spark.style.top = Math.random() * 100 + '%';
        spark.style.animationDelay = Math.random() * 2 + 's';
        spark.style.animation = `spark-float ${2 + Math.random() * 2}s ease-in-out infinite`;
        sparksContainer.appendChild(spark);
    }
}

// Initial load
console.log('[PULSE] Display initialized');
loadPulseSignals();

// Auto refresh
setInterval(loadPulseSignals, PULSE_CONFIG.pollInterval);
