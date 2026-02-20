/**
 * LURKER Live Display - SHOW ALL TOKENS
 * Affiche TOUS les tokens, même à $0 de liquidité
 */

const CONFIG = {
    signalsUrl: 'data/allSignals.json',
    pollInterval: 15000,
    maxDisplay: 50,
    // FILTRES DÉSACTIVÉS - on montre tout
    minLiquidity: 0,
    minVolume: 0
};

function fmt$(val) {
    if (!val || val === 0 || val === '0') return '$0';
    if (val >= 1000000) return '$' + (val/1000000).toFixed(2) + 'M';
    if (val >= 1000) return '$' + (val/1000).toFixed(1) + 'k';
    return '$' + Math.floor(val);
}

function fmtAge(ts, ageHours, ageMinutes) {
    if (ageMinutes !== undefined) {
        if (ageMinutes < 1) return '<1m';
        if (ageMinutes < 60) return Math.floor(ageMinutes) + 'm';
        if (ageMinutes < 1440) return Math.floor(ageMinutes/60) + 'h';
        return Math.floor(ageMinutes/1440) + 'd';
    }
    if (ageHours !== undefined) {
        if (ageHours < 1) return Math.floor(ageHours * 60) + 'm';
        if (ageHours < 24) return Math.floor(ageHours) + 'h';
        return Math.floor(ageHours / 24) + 'd';
    }
    if (!ts) return '?';
    const min = Math.floor((Date.now() - ts) / 60000);
    if (min < 1) return 'now';
    if (min < 60) return min + 'm';
    const hrs = Math.floor(min / 60);
    if (hrs < 24) return hrs + 'h';
    return Math.floor(hrs / 24) + 'd';
}

function createCard(s) {
    const div = document.createElement('div');
    div.className = 'live-signal';
    
    const liq = parseFloat(s.liquidityUsd || s.liquidity || 0);
    const hasLiq = liq > 1000;
    
    let emoji = '🆕';
    let badgeClass = 'badge-new';
    
    if (s.source === 'historical') {
        emoji = '📜';
    } else if (s.status === 'HOT' || s.score >= 70) {
        emoji = '🔥';
        badgeClass = 'badge-hot';
    } else if (s.status === 'WARM' || s.score >= 40) {
        emoji = '⚡';
        badgeClass = 'badge-warm';
    } else if (hasLiq) {
        emoji = '💧';
    }
    
    const addr = s.contract_address || s.address || '???';
    const symbol = s.symbol || '???';
    const mcap = s.marketCap || s.market_cap || 0;
    const vol = s.volume24h || s.volume_24h || s.volume || 0;
    const vol5m = s.volume5m || s.volume_5m || 0;
    const age = fmtAge(s.detectedAt, s.ageHours, s.ageMinutes);
    const price = s.priceUsd || 0;
    
    // Style différent selon liquidité
    if (!hasLiq) {
        div.style.opacity = '0.7';
        div.style.borderLeft = '3px solid #ff6b6b';
    }
    
    div.innerHTML = `
        <div class="signal-header">
            <span class="signal-type">
                <span>${emoji}</span>
                <span>$${symbol}</span>
                ${s.score ? `<span style="margin-left:0.5rem;font-size:0.8rem;color:var(--accent)">${s.score}</span>` : ''}
            </span>
            <span class="signal-time">${age}</span>
        </div>
        <div class="signal-wallet">${s.name || symbol}</div>
        <div class="signal-pattern">
            ${price > 0 && price < 1000000 ? `Price: $${price.toFixed(8)} · ` : ''}
            Liq: <span style="color:${hasLiq ? '#00ff88' : '#ff6b6b'}">${fmt$(liq)}</span>
            ${mcap > 0 ? `· MCap: ${fmt$(mcap)}` : ''}
        </div>
        <div class="signal-meta">
            ${vol5m > 0 ? `<span>Vol5m: ${fmt$(vol5m)}</span>` : ''}
            ${vol > 0 ? `<span>Vol24h: ${fmt$(vol)}</span>` : ''}
            ${s.txns5m > 0 ? `<span>Txns5m: ${s.txns5m}</span>` : ''}
            ${s.dexId ? `<span>${s.dexId}</span>` : ''}
            ${s.status ? `<span style="color:${s.status === 'HOT' ? '#ff4444' : s.status === 'WARM' ? '#ffaa00' : '#888'}">${s.status}</span>` : ''}
        </div>
        <div style="display: flex; gap: 1rem; margin-top: 0.5rem;">
            <a href="https://dexscreener.com/base/${addr}" target="_blank" class="signal-link">DEX ↗</a>
            <a href="https://basescan.org/address/${addr}" target="_blank" class="signal-link">Scan ↗</a>
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
        
        // PAS DE FILTRE - on montre tout
        const allTokens = data;
        
        container.innerHTML = '';
        
        if (allTokens.length === 0) {
            container.innerHTML = `
                <div class="no-signals">
                    <div class="no-signals-icon">👁️</div>
                    <p>No tokens detected</p>
                </div>
            `;
            return;
        }
        
        // Stats
        const withLiq = allTokens.filter(s => (s.liquidityUsd || s.liquidity || 0) > 1000).length;
        const hotTokens = allTokens.filter(s => s.status === 'HOT' || s.score >= 70).length;
        const warmTokens = allTokens.filter(s => s.status === 'WARM' || (s.score >= 40 && s.score < 70)).length;
        
        // Sort: HOT first, then WARM, then by liquidity
        allTokens.sort((a, b) => {
            const scoreA = a.score || 0;
            const scoreB = b.score || 0;
            if (scoreB !== scoreA) return scoreB - scoreA;
            return (b.liquidityUsd || 0) - (a.liquidityUsd || 0);
        });
        
        allTokens.slice(0, CONFIG.maxDisplay).forEach(s => {
            container.appendChild(createCard(s));
        });
        
        // Update counters
        const countEl = document.getElementById('token-count');
        if (countEl) countEl.textContent = `${allTokens.length} total (${withLiq} w/ liq, ${hotTokens}🔥, ${warmTokens}⚡)`;
        
        // Update scanned number (show real count)
        const scannedEl = document.getElementById('scanned-count');
        if (scannedEl) scannedEl.textContent = allTokens.length;
        
        const last = document.getElementById('last-update');
        if (last) last.textContent = new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
        
    } catch(e) {
        console.error('[LURKER] Load error:', e);
    }
}

function init() {
    console.log('[LURKER] Live display init - SHOW ALL MODE');
    load();
    setInterval(load, CONFIG.pollInterval);
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
