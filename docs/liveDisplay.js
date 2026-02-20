/**
 * LURKER Live Display - Filtered version
 * Affiche UNIQUEMENT les tokens avec liquidité > 0
 */

const CONFIG = {
    signalsUrl: 'data/allSignals.json',
    pollInterval: 15000,
    maxDisplay: 20
};

function fmt$(val) {
    if (!val || val === 0) return '$0';
    if (val >= 1000000) return '$' + (val/1000000).toFixed(2) + 'M';
    if (val >= 1000) return '$' + (val/1000).toFixed(1) + 'k';
    return '$' + Math.floor(val);
}

function fmtAge(ts, ageHours, ageMinutes) {
    if (ageMinutes !== undefined) {
        if (ageMinutes < 1) return 'just now';
        if (ageMinutes < 60) return Math.floor(ageMinutes) + 'min';
        if (ageMinutes < 1440) return Math.floor(ageMinutes/60) + 'h';
        return Math.floor(ageMinutes/1440) + 'd';
    }
    if (ageHours !== undefined) {
        if (ageHours < 1) return Math.floor(ageHours * 60) + 'min';
        if (ageHours < 24) return Math.floor(ageHours) + 'h';
        return Math.floor(ageHours / 24) + 'd';
    }
    if (!ts) return '?';
    const min = Math.floor((Date.now() - ts) / 60000);
    if (min < 1) return 'now';
    if (min < 60) return min + 'min';
    const hrs = Math.floor(min / 60);
    if (hrs < 24) return hrs + 'h';
    return Math.floor(hrs / 24) + 'd';
}

function createCard(s) {
    const div = document.createElement('div');
    div.className = 'live-signal';
    
    let emoji = '👁️';
    let badgeClass = 'badge-new';
    
    if (s.source === 'historical') {
        emoji = '📜';
    } else if (s.status === 'HOT' || s.score >= 70) {
        emoji = '🔥';
        badgeClass = 'badge-hot';
    } else if (s.status === 'WARM' || s.score >= 40) {
        emoji = '⚡';
        badgeClass = 'badge-warm';
    } else if (s.liquidityUsd > 0) {
        emoji = '💧';
    }
    
    const addr = s.contract_address || s.address || '???';
    const symbol = s.symbol || '???';
    const liq = s.liquidityUsd || s.liquidity || 0;
    const mcap = s.marketCap || s.market_cap || 0;
    const vol = s.volume24h || s.volume_24h || s.volume || 0;
    const age = fmtAge(s.detectedAt, s.ageHours, s.ageMinutes);
    const price = s.priceUsd || 0;
    
    div.innerHTML = `
        <div class="signal-header">
            <span class="signal-type">
                <span>${emoji}</span>
                <span>$${symbol}</span>
                ${s.score ? `<span style="margin-left:0.5rem;font-size:0.8rem;color:var(--accent)">Score: ${s.score}</span>` : ''}
            </span>
            <span class="signal-time">${age}</span>
        </div>
        <div class="signal-wallet">${s.name || symbol}</div>
        <div class="signal-pattern">
            ${price > 0 ? `Price: $${price.toFixed(6)} · ` : ''}
            Liq: ${fmt$(liq)} · MCap: ${fmt$(mcap)}
        </div>
        <div class="signal-meta">
            ${vol > 0 ? `<span>Vol24h: ${fmt$(vol)}</span>` : ''}
            ${s.dexId ? `<span>DEX: ${s.dexId}</span>` : ''}
            ${s.status && s.status !== 'FRESH' ? `<span>Status: ${s.status}</span>` : ''}
        </div>
        <div style="display: flex; gap: 1rem; margin-top: 0.5rem;">
            <a href="https://dexscreener.com/base/${addr}" target="_blank" class="signal-link">DEX ↗</a>
            <a href="https://basescan.org/address/${addr}" target="_blank" class="signal-link">BaseScan ↗</a>
        </div>
    `;
    
    return div;
}

async function load() {
    try {
        const res = await fetch(CONFIG.signalsUrl + '?t=' + Date.now());
        const data = await res.json();
        
        const container = document.getElementById('live-tokens');
        if (!container) return;
        
        // Filter: only tokens with liquidity > 0
        const validTokens = data.filter(s => (s.liquidityUsd || s.liquidity || 0) > 0);
        
        container.innerHTML = '';
        
        if (validTokens.length === 0) {
            container.innerHTML = `
                <div class="no-signals">
                    <div class="no-signals-icon">👁️</div>
                    <p>scanning for liquid tokens...</p>
                    <p style="font-size: 0.8rem; opacity: 0.6; margin-top: 0.5rem;">
                        Tokens appear here once they have liquidity on DEX
                    </p>
                </div>
            `;
            return;
        }
        
        // Sort by liquidity (highest first)
        validTokens.sort((a, b) => (b.liquidityUsd || 0) - (a.liquidityUsd || 0));
        
        validTokens.slice(0, CONFIG.maxDisplay).forEach(s => {
            container.appendChild(createCard(s));
        });
        
        const count = document.getElementById('token-count');
        if (count) count.textContent = validTokens.length + ' tokens';
        
        const last = document.getElementById('last-update');
        if (last) last.textContent = new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
        
    } catch(e) {
        console.error('[LURKER] Load error:', e);
    }
}

function init() {
    console.log('[LURKER] Live display init (filtered)');
    load();
    setInterval(load, CONFIG.pollInterval);
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
