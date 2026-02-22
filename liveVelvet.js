/**
 * LURKER Velvet-Style Live Display
 * UI inspirée de Velvet Capital Memescope
 */

const CONFIG = {
    signalsUrl: 'data/allSignals.json',
    pollInterval: 10000,
    maxDisplay: 50
};

let currentFilter = 'all';

function fmt$(val) {
    if (!val || val === 0 || val === '0') return '$0';
    if (val >= 1000000) return '$' + (val/1000000).toFixed(2) + 'M';
    if (val >= 1000) return '$' + (val/1000).toFixed(1) + 'k';
    return '$' + Math.floor(val);
}

function fmtAge(minutes) {
    if (!minutes || minutes < 1) return '<1m';
    if (minutes < 60) return Math.floor(minutes) + 'm';
    if (minutes < 1440) return Math.floor(minutes/60) + 'h';
    return Math.floor(minutes/1440) + 'd';
}

function getBadgeClass(status) {
    if (status === 'HOT') return 'badge-hot';
    if (status === 'WARM') return 'badge-warm';
    return 'badge-cold';
}

function getInitials(symbol) {
    return symbol ? symbol.slice(0, 2).toUpperCase() : '??';
}

function createTokenCard(token) {
    const liq = parseFloat(token.liquidityUsd || token.liquidity || 0);
    const mcap = parseFloat(token.marketCap || token.market_cap || 0);
    const vol24h = parseFloat(token.volume24h || token.volume_24h || 0);
    const priceChange = token.priceChange24h || token.price_change_24h || 0;
    const ageMinutes = token.ageMinutes || (token.ageHours ? token.ageHours * 60 : 0);
    
    const addr = token.contract_address || token.address;
    const symbol = token.symbol || '???';
    const name = token.name || symbol;
    
    const div = document.createElement('div');
    div.className = 'token-card';
    div.dataset.status = token.status || 'COLD';
    div.dataset.liquidity = liq > 0 ? 'yes' : 'no';
    
    const changeClass = priceChange > 0 ? 'positive' : priceChange < 0 ? 'negative' : '';
    const changeSign = priceChange > 0 ? '+' : '';
    
    div.innerHTML = `
        <div class="token-icon">${getInitials(symbol)}</div>
        <div class="token-info">
            <div class="token-name">
                ${name}
                <span class="token-symbol">$${symbol}</span>
                ${token.status ? `<span class="badge ${getBadgeClass(token.status)}">${token.status}</span>` : ''}
            </div>
            <div class="token-age">
                ${fmtAge(ageMinutes)} old · ${token.dexId || 'DEX'}
            </div>
        </div>
        <div class="token-metrics">
            <div class="metric">
                <div class="metric-value">${fmt$(mcap)}</div>
                <div class="metric-label">MCAP</div>
            </div>
            <div class="metric">
                <div class="metric-value">${fmt$(liq)}</div>
                <div class="metric-label">LIQ</div>
            </div>
            <div class="metric ${changeClass}">
                <div class="metric-value">${changeSign}${priceChange.toFixed ? priceChange.toFixed(1) : priceChange}%</div>
                <div class="metric-label">24H</div>
            </div>
        </div>
        <div class="token-actions">
            <a href="https://dexscreener.com/base/${addr}" target="_blank" class="btn btn-secondary">📊</a>
            <a href="https://app.uniswap.org/#/swap?outputCurrency=${addr}&chain=base" target="_blank" class="btn btn-primary">
                Buy
            </a>
        </div>
    `;
    
    return div;
}

function applyFilter(tokens) {
    if (currentFilter === 'hot') return tokens.filter(t => t.status === 'HOT');
    if (currentFilter === 'warm') return tokens.filter(t => t.status === 'WARM');
    if (currentFilter === 'liquidity') return tokens.filter(t => (t.liquidityUsd || t.liquidity || 0) > 0);
    return tokens;
}

async function load() {
    try {
        const res = await fetch(CONFIG.signalsUrl + '?t=' + Date.now());
        const data = await res.json();
        
        // Filter
        const filtered = applyFilter(data);
        
        // Split by MCAP
        const lowcaps = filtered.filter(t => (t.marketCap || t.market_cap || 0) < 100000);
        const highcaps = filtered.filter(t => (t.marketCap || t.market_cap || 0) >= 100000);
        
        // Sort by score then by liquidity
        const sortFn = (a, b) => {
            const scoreDiff = (b.score || 0) - (a.score || 0);
            if (scoreDiff !== 0) return scoreDiff;
            return (b.liquidityUsd || b.liquidity || 0) - (a.liquidityUsd || a.liquidity || 0);
        };
        
        lowcaps.sort(sortFn);
        highcaps.sort(sortFn);
        
        // Update counts
        document.getElementById('count-low').textContent = lowcaps.length;
        document.getElementById('count-high').textContent = highcaps.length;
        
        // Stats
        const hot = data.filter(t => t.status === 'HOT').length;
        const warm = data.filter(t => t.status === 'WARM').length;
        const withLiq = data.filter(t => (t.liquidityUsd || t.liquidity || 0) > 0).length;
        
        document.getElementById('stat-total').textContent = data.length;
        document.getElementById('stat-hot').textContent = hot;
        document.getElementById('stat-warm').textContent = warm;
        document.getElementById('stat-liquidity').textContent = withLiq;
        
        // Render lowcaps
        const lowGrid = document.getElementById('lowcap-grid');
        lowGrid.innerHTML = '';
        if (lowcaps.length === 0) {
            lowGrid.innerHTML = `
                <div class="empty-state">
                    <p>No lowcap signals detected</p>
                    <p style="font-size:0.8rem;margin-top:0.5rem;">Check filters or wait for new tokens</p>
                </div>
            `;
        } else {
            lowcaps.slice(0, CONFIG.maxDisplay).forEach(t => {
                lowGrid.appendChild(createTokenCard(t));
            });
        }
        
        // Render highcaps
        const highGrid = document.getElementById('highcap-grid');
        highGrid.innerHTML = '';
        if (highcaps.length === 0) {
            highGrid.innerHTML = `
                <div class="empty-state">
                    <p>No mid/largecap signals detected</p>
                </div>
            `;
        } else {
            highcaps.slice(0, CONFIG.maxDisplay).forEach(t => {
                highGrid.appendChild(createTokenCard(t));
            });
        }
        
    } catch(e) {
        console.error('[LURKER] Load error:', e);
    }
}

function init() {
    console.log('[LURKER] Velvet-style live display init');
    
    // Filter buttons
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentFilter = btn.dataset.filter;
            load();
        });
    });
    
    load();
    setInterval(load, CONFIG.pollInterval);
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
