/**
 * LURKER Live Display for live.html
 */

const CONFIG = {
    signalsUrl: 'data/allSignals.json',
    pollInterval: 10000,
    maxDisplay: 15
};

function fmt$(val) {
    if (!val || val === 0) return '$0';
    if (val >= 1000000) return '$' + (val/1000000).toFixed(2) + 'M';
    if (val >= 1000) return '$' + (val/1000).toFixed(1) + 'k';
    return '$' + Math.floor(val);
}

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

function createCard(s) {
    const div = document.createElement('div');
    div.className = 'live-signal';
    
    let emoji = '👁️';
    let title = 'NEW TOKEN';
    
    if (s.source === 'historical') {
        emoji = '📜';
        title = 'HISTORICAL';
    } else if (s.status === 'HOT' || s.score >= 70) {
        emoji = '🔥';
        title = 'HOT SIGNAL';
    } else if (s.status === 'WARM' || s.score >= 40) {
        emoji = '⚡';
        title = 'WARM SIGNAL';
    }
    
    const addr = s.contract_address || s.address || '???';
    const symbol = s.symbol || '???';
    const liq = s.liquidityUsd || s.liquidity || 0;
    const mcap = s.marketCap || s.market_cap || 0;
    const vol = s.volume24h || s.volume_24h || s.volume || 0;
    const age = fmtAge(s.detectedAt, s.ageHours);
    
    div.innerHTML = `
        <div class="signal-header">
            <span class="signal-type">
                <span>${emoji}</span>
                <span>${title} — $${symbol}</span>
            </span>
            <span class="signal-time">${age}</span>
        </div>
        <div class="signal-wallet">${s.name || symbol}</div>
        <div class="signal-pattern">
            ${s.checks ? s.checks.map(c => '✓ ' + c.replace(/_/g, ' ')).join(' · ') : 
              `LIQ: ${fmt$(liq)} · MCAP: ${fmt$(mcap)}`}
        </div>
        <div class="signal-meta">
            <span>Liq: ${fmt$(liq)}</span>
            <span>MCap: ${fmt$(mcap)}</span>
            <span>Vol24h: ${fmt$(vol)}</span>
            ${s.risk ? `<span>Risk: ${s.risk}</span>` : ''}
            ${s.score ? `<span>Score: ${s.score}</span>` : ''}
        </div>
        <div style="display: flex; gap: 1rem; margin-top: 0.5rem;">
            <a href="https://dexscreener.com/base/${addr}" target="_blank" class="signal-link">dexscreener →</a>
            <a href="https://basescan.org/address/${addr}" target="_blank" class="signal-link">basescan →</a>
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
        
        container.innerHTML = '';
        
        if (!Array.isArray(data) || data.length === 0) {
            container.innerHTML = '<div class="no-signals"><div class="no-signals-icon">👁️</div><p>no signals detected</p></div>';
            return;
        }
        
        data.sort((a, b) => (b.detectedAt || 0) - (a.detectedAt || 0));
        
        data.slice(0, CONFIG.maxDisplay).forEach(s => {
            container.appendChild(createCard(s));
        });
        
        const count = document.getElementById('token-count');
        if (count) count.textContent = data.length;
        
        const last = document.getElementById('last-update');
        if (last) last.textContent = new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
        
    } catch(e) {
        console.error('[LURKER] Load error:', e);
    }
}

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
