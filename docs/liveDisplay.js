/**
 * LURKER Live Display v2 - FILTRES AVANCÉS
 * Filtres: WARN only, tri par liquidity, compteurs
 */

const CONFIG = {
    signalsUrl: 'data/allSignals.json',
    pollInterval: 15000,
    maxDisplay: 50,
    // Default filter
    showWarnOnly: false,
    sortBy: 'liquidity' // 'liquidity', 'score', 'age'
};

let currentFilter = {
    warnOnly: false,
    sortBy: 'liquidity' // liquidity | score | age
};

function fmt$(val) {
    if (!val || val === 0 || val === '0') return '$0';
    if (val >= 1000000) return '$' + (val/1000000).toFixed(2) + 'M';
    if (val >= 1000) return '$' + (val/1000).toFixed(1) + 'k';
    return '$' + Math.floor(val);
}

function fmtNumber(num) {
    if (!num) return '0';
    if (num >= 1000000) return (num/1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num/1000).toFixed(1) + 'k';
    return num.toString();
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
    const vol24h = parseFloat(s.volume24h || s.volume_24h || s.volume || 0);
    const hasLiq = liq > 1000;
    const hasVol = vol24h > 5000;
    
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
    } else if (hasLiq && hasVol) {
        emoji = '💧';
    }
    
    const addr = s.contract_address || s.address || '???';
    const symbol = s.symbol || '???';
    const mcap = s.marketCap || s.market_cap || 0;
    const vol5m = s.volume5m || s.volume_5m || 0;
    const age = fmtAge(s.detectedAt, s.ageHours, s.ageMinutes);
    const price = s.priceUsd || 0;
    
    // Style différent selon liquidité
    if (!hasLiq) {
        div.style.opacity = '0.7';
        div.style.borderLeft = '3px solid #ff6b6b';
    }
    
    // BaseScan indicators
    const verifiedBadge = s.verifiedContract ? '✓V' : '';
    const transferBadge = s.hasTransfers ? '✓T' : '';
    const baseScanInfo = (verifiedBadge || transferBadge) ? `[${verifiedBadge}${transferBadge}] ` : '';
    
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
            ${baseScanInfo}
            ${price > 0 && price < 1000000 ? `Price: $${price.toFixed(8)} · ` : ''}
            Liq: <span style="color:${hasLiq ? '#00ff88' : '#ff6b6b'}">${fmt$(liq)}</span>
            ${mcap > 0 ? `· MCap: ${fmt$(mcap)}` : ''}
        </div>
        <div class="signal-meta">
            ${vol5m > 0 ? `<span>Vol5m: ${fmt$(vol5m)}</span>` : ''}
            ${vol24h > 0 ? `<span>Vol24h: ${fmt$(vol24h)}</span>` : ''}
            ${s.txns5m > 0 ? `<span>Txns5m: ${s.txns5m}</span>` : ''}
            ${s.baseScanData?.totalSupply ? `<span>Supply: ${fmtNumber(s.baseScanData.totalSupply)}</span>` : ''}
            ${s.status ? `<span style="color:${s.status === 'HOT' ? '#ff4444' : s.status === 'WARM' ? '#ffaa00' : '#888'};font-weight:bold">${s.status}</span>` : ''}
        </div>
        <div style="display: flex; gap: 1rem; margin-top: 0.5rem;">
            <a href="https://dexscreener.com/base/${addr}" target="_blank" class="signal-link">DEX ↗</a>
            <a href="https://basescan.org/address/${addr}" target="_blank" class="signal-link">Scan ↗</a>
        </div>
    `;
    
    return div;
}

function createFilterBar() {
    const bar = document.createElement('div');
    bar.className = 'filter-bar';
    bar.style.cssText = `
        display: flex;
        gap: 1rem;
        padding: 1rem;
        background: rgba(0,255,136,0.05);
        border: 1px solid rgba(0,255,136,0.2);
        border-radius: 8px;
        margin-bottom: 1.5rem;
        flex-wrap: wrap;
        align-items: center;
    `;
    
    bar.innerHTML = `
        <label style="display:flex;align-items:center;gap:0.5rem;cursor:pointer;">
            <input type="checkbox" id="warn-only" ${currentFilter.warnOnly ? 'checked' : ''}>
            <span>⚡ WARN only (WARM/HOT)</span>
        </label>
        
        <select id="sort-by" style="background:#0a0a0f;color:#00ff88;border:1px solid #00ff8840;padding:0.4rem 0.8rem;border-radius:4px;">
            <option value="liquidity" ${currentFilter.sortBy === 'liquidity' ? 'selected' : ''}>💰 Tri: Liquidité</option>
            <option value="score" ${currentFilter.sortBy === 'score' ? 'selected' : ''}>📊 Tri: Score</option>
            <option value="age" ${currentFilter.sortBy === 'age' ? 'selected' : ''}>⏱️ Tri: Plus récent</option>
        </select>
        
        <div id="counter-display" style="margin-left:auto;font-family:monospace;color:var(--accent);">
            Chargement...
        </div>
    `;
    
    // Event listeners
    setTimeout(() => {
        const warnCheck = document.getElementById('warn-only');
        const sortSelect = document.getElementById('sort-by');
        
        if (warnCheck) {
            warnCheck.addEventListener('change', (e) => {
                currentFilter.warnOnly = e.target.checked;
                load();
            });
        }
        
        if (sortSelect) {
            sortSelect.addEventListener('change', (e) => {
                currentFilter.sortBy = e.target.value;
                load();
            });
        }
    }, 100);
    
    return bar;
}

async function load() {
    try {
        const res = await fetch(CONFIG.signalsUrl + '?t=' + Date.now());
        const data = await res.json();
        
        const container = document.getElementById('live-tokens');
        if (!container) return;
        
        // Ajouter la barre de filtres si pas déjà présente
        let filterBar = document.querySelector('.filter-bar');
        if (!filterBar) {
            filterBar = createFilterBar();
            container.parentNode.insertBefore(filterBar, container);
        }
        
        // Appliquer filtres
        let filtered = [...data];
        
        // WARN only filter
        if (currentFilter.warnOnly) {
            filtered = filtered.filter(s => 
                s.status === 'HOT' || 
                s.status === 'WARM' || 
                s.score >= 40
            );
        }
        
        // Stats avant affichage
        const totalCount = data.length;
        const hotCount = data.filter(s => s.status === 'HOT' || s.score >= 70).length;
        const warmCount = data.filter(s => s.status === 'WARM' || (s.score >= 40 && s.score < 70)).length;
        const withLiq = data.filter(s => (s.liquidityUsd || s.liquidity || 0) > 1000).length;
        
        // Trier
        filtered.sort((a, b) => {
            const liqA = parseFloat(a.liquidityUsd || a.liquidity || 0);
            const liqB = parseFloat(b.liquidityUsd || b.liquidity || 0);
            const scoreA = a.score || 0;
            const scoreB = b.score || 0;
            const timeA = a.detectedAt || 0;
            const timeB = b.detectedAt || 0;
            
            switch(currentFilter.sortBy) {
                case 'liquidity':
                    if (liqB !== liqA) return liqB - liqA;
                    return scoreB - scoreA;
                case 'score':
                    if (scoreB !== scoreA) return scoreB - scoreA;
                    return liqB - liqA;
                case 'age':
                    return timeB - timeA;
                default:
                    return liqB - liqA;
            }
        });
        
        container.innerHTML = '';
        
        if (filtered.length === 0) {
            container.innerHTML = `
                <div class="no-signals">
                    <div class="no-signals-icon">👁️</div>
                    <p>${currentFilter.warnOnly ? 'No WARN signals found' : 'No tokens detected'}</p>
                    ${currentFilter.warnOnly ? '<p style="font-size:0.9rem;opacity:0.7">Try disabling WARN filter</p>' : ''}
                </div>
            `;
        } else {
            filtered.slice(0, CONFIG.maxDisplay).forEach(s => {
                container.appendChild(createCard(s));
            });
        }
        
        // Update counters
        const counterDisplay = document.getElementById('counter-display');
        if (counterDisplay) {
            counterDisplay.innerHTML = `
                <span style="color:#888">Total: ${totalCount}</span> · 
                <span style="color:#ff4444">🔥${hotCount}</span> · 
                <span style="color:#ffaa00">⚡${warmCount}</span> · 
                <span style="color:#00ff88">💰${withLiq}</span>
                ${currentFilter.warnOnly ? ` <span style="color:#00ff88">| Affichés: ${filtered.length}</span>` : ''}
            `;
        }
        
        // Legacy counters
        const countEl = document.getElementById('token-count');
        if (countEl) countEl.textContent = `${totalCount} total (${withLiq} w/ liq, ${hotCount}🔥, ${warmCount}⚡)`;
        
        const scannedEl = document.getElementById('scanned-count');
        if (scannedEl) scannedEl.textContent = totalCount;
        
        const last = document.getElementById('last-update');
        if (last) last.textContent = new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
        
    } catch(e) {
        console.error('[LURKER] Load error:', e);
    }
}

function init() {
    console.log('[LURKER] Live display v2 init - Filters enabled');
    load();
    setInterval(load, CONFIG.pollInterval);
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
