// LURKER Unified Feed — CIO + FAST-CERTIFIED + CERTIFIED
const REPO_RAW = 'https://raw.githubusercontent.com/lurker-base/lurker/main';

// Unified state
let feedState = {
    cio: [],
    fastCertified: [],
    certified: [],
    updated: '--:--'
};

// Utils
function safeNum(x, fallback = 0) {
    const n = Number(x);
    return Number.isFinite(n) ? n : fallback;
}

function pick(obj, paths, fallback = undefined) {
    for (const p of paths) {
        const parts = p.split('.');
        let cur = obj;
        let ok = true;
        for (const k of parts) {
            cur = cur?.[k];
            if (cur === undefined || cur === null) {
                ok = false;
                break;
            }
        }
        if (ok) return cur;
    }
    return fallback;
}

function renderAgeBadge(ageHours) {
    const h = safeNum(ageHours);
    if (h < 1) return '<span class="badge-age badge-new">NEW</span>';
    if (h < 6) return `<span class="badge-age badge-fresh">${Math.round(h)}h</span>`;
    if (h < 12) return `<span class="badge-age badge-young">${Math.round(h)}h</span>`;
    if (h < 24) return `<span class="badge-age badge-aging">${Math.round(h)}h</span>`;
    return `<span class="badge-age badge-old">${Math.round(h)}h</span>`;
}

function renderStatusBadge(status) {
    const badges = {
        'cio': '<span class="badge-status badge-cio">CIO</span>',
        'fast_certified': '<span class="badge-status badge-fast">⚡ FAST-CERTIFIED</span>',
        'certified': '<span class="badge-status badge-cert">✓ CERTIFIED</span>'
    };
    return badges[status] || '';
}

function renderSourceBadge(source) {
    if (!source) return '';
    const colors = {
        'profiles': '#4CAF50',
        'boosts': '#2196F3', 
        'top_boosts': '#9C27B0'
    };
    return `<span class="badge-source" style="background:${colors[source] || '#666'}">${source.toUpperCase()}</span>`;
}

// Card renderers
function renderCIOCard(item) {
    const symbol = pick(item, ['token.symbol', 'symbol'], '???');
    const age = safeNum(item.age_hours || item.timestamps?.age_hours, 0);
    const score = safeNum(item.scores?.cio_score, 0);
    const source = item.scores?.source;
    const metrics = item.metrics || {};
    const liq = safeNum(metrics.liq_usd, 0);
    const vol24 = safeNum(metrics.vol_24h_usd, 0);
    const tx24 = safeNum(metrics.txns_24h, 0);
    const url = item.pair_url || (item.pool_address ? `https://dexscreener.com/base/${item.pool_address}` : '#');
    
    return `
        <div class="token-card card-cio">
            <div class="card-header">
                <span class="token-symbol">${symbol}</span>
                <span class="badges">
                    ${renderAgeBadge(age)}
                    ${renderStatusBadge('cio')}
                    ${renderSourceBadge(source)}
                </span>
            </div>
            <div class="card-metrics">
                <span>⭐ ${score}/100</span>
                <span>💧 $${(liq/1e3).toFixed(0)}k</span>
                <span>📊 $${(vol24/1e3).toFixed(0)}k</span>
                <span>🔥 ${Math.round(tx24)} tx</span>
            </div>
            <div class="card-footer">
                <span class="age-text">${age.toFixed(1)}h old</span>
                ${url !== '#' ? `<a href="${url}" target="_blank" class="dex-link">DexScreener →</a>` : ''}
            </div>
        </div>
    `;
}

function renderFastCertifiedCard(item) {
    const original = item.original_cio || {};
    const symbol = pick(original, ['token.symbol', 'symbol'], '???');
    const age = safeNum(item.timestamps?.age_hours, 0);
    const score = safeNum(item.momentum?.score, 0);
    const metrics = item.metrics_at_cert || {};
    const liq = safeNum(metrics.liq_usd, 0);
    const vol24 = safeNum(metrics.vol_24h_usd, 0);
    const tx24 = safeNum(metrics.txns_24h, 0);
    const trend = item.momentum?.vol_trend || 'stable';
    const url = original.pair_url || (original.pool_address ? `https://dexscreener.com/base/${original.pool_address}` : '#');
    
    const trendEmoji = trend === 'up' ? '📈' : trend === 'down' ? '📉' : '➡️';
    
    return `
        <div class="token-card card-fast">
            <div class="card-header">
                <span class="token-symbol">${symbol}</span>
                <span class="badges">
                    ${renderAgeBadge(age)}
                    ${renderStatusBadge('fast_certified')}
                </span>
            </div>
            <div class="card-metrics">
                <span>⚡ ${score}/100</span>
                <span>${trendEmoji} ${trend}</span>
                <span>💧 $${(liq/1e3).toFixed(0)}k</span>
                <span>📊 $${(vol24/1e3).toFixed(0)}k</span>
            </div>
            <div class="card-footer">
                <span class="age-text">${age.toFixed(1)}h • Momentum confirmed</span>
                ${url !== '#' ? `<a href="${url}" target="_blank" class="dex-link">DexScreener →</a>` : ''}
            </div>
        </div>
    `;
}

function renderCertifiedCard(item) {
    // Placeholder for now - will be implemented when certifier exists
    return renderFastCertifiedCard(item).replace('card-fast', 'card-certified').replace('⚡', '✓');
}

// Stats renderer
function renderStats() {
    const statsEl = document.getElementById('feed-stats');
    if (!statsEl) return;
    
    const cioCount = feedState.cio.length;
    const fastCount = feedState.fastCertified.length;
    const certCount = feedState.certified.length;
    
    statsEl.innerHTML = `
        <div class="stat-box">
            <span class="stat-value">${cioCount}</span>
            <span class="stat-label">CIO (0-6h)</span>
        </div>
        <div class="stat-box stat-fast">
            <span class="stat-value">${fastCount}</span>
            <span class="stat-label">⚡ FAST (6-24h)</span>
        </div>
        <div class="stat-box stat-cert">
            <span class="stat-value">${certCount}</span>
            <span class="stat-label">✓ CERTIFIED (24h+)</span>
        </div>
        <div class="stat-updated">
            Updated: ${feedState.updated}
        </div>
    `;
}

// Feed loaders
async function loadCIOFeed() {
    try {
        const res = await fetch(`${REPO_RAW}/signals/cio_feed.json?t=${Date.now()}`, { cache: 'no-store' });
        if (!res.ok) throw new Error('CIO HTTP ' + res.status);
        const data = await res.json();
        feedState.cio = data.candidates || [];
        feedState.updated = data.meta?.updated_at || data.updated_at || '--:--';
    } catch (e) {
        console.error('CIO load failed:', e);
    }
}

async function loadFastCertifiedFeed() {
    try {
        const res = await fetch(`${REPO_RAW}/signals/fast_certified_feed.json?t=${Date.now()}`, { cache: 'no-store' });
        if (!res.ok) {
            // Feed might not exist yet
            feedState.fastCertified = [];
            return;
        }
        const data = await res.json();
        feedState.fastCertified = data.fast_certified || [];
    } catch (e) {
        console.log('Fast-certified not available yet');
        feedState.fastCertified = [];
    }
}

async function loadCertifiedFeed() {
    // Placeholder - will load certified feed when available
    feedState.certified = [];
}

// Main render
async function renderAllFeeds() {
    // Load all feeds
    await Promise.all([
        loadCIOFeed(),
        loadFastCertifiedFeed(),
        loadCertifiedFeed()
    ]);
    
    // Render stats
    renderStats();
    
    // Render CIO section
    const cioContainer = document.getElementById('cio-feed');
    if (cioContainer) {
        if (feedState.cio.length === 0) {
            cioContainer.innerHTML = '<div class="empty-feed">No active CIO candidates (0-6h)</div>';
        } else {
            // Sort by score
            const sorted = feedState.cio.sort((a, b) => 
                safeNum(b.scores?.cio_score) - safeNum(a.scores?.cio_score)
            );
            cioContainer.innerHTML = sorted.map(renderCIOCard).join('');
        }
    }
    
    // Render FAST-CERTIFIED section
    const fastContainer = document.getElementById('fast-feed');
    if (fastContainer) {
        if (feedState.fastCertified.length === 0) {
            fastContainer.innerHTML = '<div class="empty-feed">No FAST-CERTIFIED yet (6-24h momentum)</div>';
        } else {
            const sorted = feedState.fastCertified.sort((a, b) => 
                safeNum(b.momentum?.score) - safeNum(a.momentum?.score)
            );
            fastContainer.innerHTML = sorted.map(renderFastCertifiedCard).join('');
        }
    }
    
    // Render CERTIFIED section
    const certContainer = document.getElementById('cert-feed');
    if (certContainer) {
        if (feedState.certified.length === 0) {
            certContainer.innerHTML = '<div class="empty-feed">No CERTIFIED yet (24h+ with holders)</div>';
        } else {
            certContainer.innerHTML = feedState.certified.map(renderCertifiedCard).join('');
        }
    }
}

// Auto-init
document.addEventListener('DOMContentLoaded', () => {
    renderAllFeeds();
    // Refresh every 30 seconds
    setInterval(renderAllFeeds, 30000);
});
