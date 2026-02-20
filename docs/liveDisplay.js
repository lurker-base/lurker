/**
 * LURKER Live Display
 * Affiche les tokens en temps réel sur le site
 */

const CONFIG = {
    signalsUrl: 'data/allSignals.json',
    pollInterval: 10000,
    maxDisplay: 15
};

// Format currency
function fmt$(val) {
    if (!val || val === 0) return '$0';
    if (val >= 1000000) return '$' + (val/1000000).toFixed(2) + 'M';
    if (val >= 1000) return '$' + (val/1000).toFixed(1) + 'k';
    return '$' + Math.floor(val);
}

// Format age
function fmtAge(ts, ageHours) {
    if (ageHours !== undefined) {
        if (ageHours < 1) return Math.floor(ageHours * 60) + 'min';
        if (ageHours < 24) return Math.floor(ageHours) + 'h';
        return Math.floor(ageHours / 24) + 'd';
    }
    if (!ts) return '?';
    const min = Math.floor((Date.now() - ts) / 60000);
    if (min < 60) return min + 'min';
    const hrs = Math.floor(min / 60);
    if (hrs < 24) return hrs + 'h';
    return Math.floor(hrs / 24) + 'd';
}

// Create card
function createCard(s) {
    const div = document.createElement('div');
    div.className = 'token-card';
    
    // Determine type
    let badge = '👁️ NEW';
    let badgeClass = 'badge-new';
    
    if (s.source === 'historical') {
        badge = '📜 HIST';
        badgeClass = 'badge-hist';
    } else if (s.status === 'HOT' || s.score >= 70) {
        badge = '🔥 HOT';
        badgeClass = 'badge-hot';
    } else if (s.status === 'WARM' || s.score >= 40) {
        badge = '⚡ WARM';
        badgeClass = 'badge-warm';
    }
    
    // Get values with fallbacks
    const addr = s.contract_address || s.address || '???';
    const symbol = s.symbol || '???';
    const liq = s.liquidityUsd || s.liquidity || 0;
    const mcap = s.marketCap || s.market_cap || 0;
    const vol = s.volume24h || s.volume_24h || s.volume || 0;
    const age = fmtAge(s.detectedAt, s.ageHours);
    
    div.innerHTML = `
        <div class="card-header">
            <span class="card-symbol">$${symbol}</span>
            <span class="card-badge ${badgeClass}">${badge}</span>
        </div>
        <div class="card-age">${age} ago</div>
        <div class="card-metrics">
            <div class="metric">
                <span class="metric-label">LIQ</span>
                <span class="metric-value">${fmt$(liq)}</span>
            </div>
            <div class="metric">
                <span class="metric-label">MCAP</span>
                <span class="metric-value">${fmt$(mcap)}</span>
            </div>
            <div class="metric">
                <span class="metric-label">VOL24H</span>
                <span class="metric-value">${fmt$(vol)}</span>
            </div>
        </div>
        <div class="card-links">
            <a href="https://basescan.org/address/${addr}" target="_blank" class="link">BaseScan ↗</a>
            ${s.url ? `<a href="${s.url}" target="_blank" class="link">DEX ↗</a>` : ''}
        </div>
    `;
    
    return div;
}

// Load
async function load() {
    try {
        const res = await fetch(CONFIG.signalsUrl + '?t=' + Date.now());
        const data = await res.json();
        
        const container = document.getElementById('live-tokens');
        if (!container) return;
        
        container.innerHTML = '';
        
        if (!Array.isArray(data) || data.length === 0) {
            container.innerHTML = '<div class="empty">no signals detected</div>';
            return;
        }
        
        // Sort by detected time
        data.sort((a, b) => (b.detectedAt || 0) - (a.detectedAt || 0));
        
        // Display
        data.slice(0, CONFIG.maxDisplay).forEach(s => {
            container.appendChild(createCard(s));
        });
        
        // Update count
        const count = document.getElementById('token-count');
        if (count) count.textContent = data.length + ' tokens tracked';
        
    } catch(e) {
        console.error('[LURKER] Load error:', e);
    }
}

// Init
function init() {
    console.log('[LURKER] Live display init');
    load();
    setInterval(load, CONFIG.pollInterval);
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
