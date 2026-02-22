// LURKER Unified Feed — CIO + WATCH + HOTLIST + FAST-CERTIFIED + CERTIFIED
const REPO_RAW = 'https://raw.githubusercontent.com/lurker-base/lurker/main';

// Unified state
let feedState = {
    cio: [],
    watch: [],
    hotlist: [],
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

function renderWatchCard(item) {
    const symbol = pick(item, ['token.symbol', 'symbol'], '???');
    const age = safeNum(item.timestamps?.age_minutes, 0) / 60;
    const checks = item.timestamps?.checks || 1;
    const metrics = item.metrics || {};
    const liq = safeNum(metrics.liq_usd, 0);
    const tx5m = safeNum(metrics.txns_5m, 0);
    const url = item.pair_url || (item.pool_address ? `https://dexscreener.com/base/${item.pool_address}` : '#');
    
    return `
        <div class="token-card" style="border-left: 3px solid #666; opacity: 0.8;">
            <div class="card-header">
                <span class="token-symbol">${symbol}</span>
                <span class="badges">
                    ${renderAgeBadge(age)}
                    <span style="background:#666;color:#fff;padding:2px 6px;border-radius:3px;font-size:0.65rem;">WATCH #${checks}</span>
                </span>
            </div>
            <div class="card-metrics">
                <span>👁️ check ${checks}/3</span>
                <span>💧 $${(liq/1e3).toFixed(0)}k</span>
                <span>🔥 ${Math.round(tx5m)} tx/5m</span>
            </div>
            <div style="font-size: 0.75rem; color: var(--text-muted); margin-bottom: 0.5rem;">
                Buffer zone (10-30m) — re-testing before HOTLIST
            </div>
            <div class="card-footer">
                <span class="age-text">${item.timestamps?.age_minutes?.toFixed(0)}m old</span>
                ${url !== '#' ? `<a href="${url}" target="_blank" class="dex-link">DexScreener →</a>` : ''}
            </div>
        </div>
    `;
}

function renderStatusBadge(status) {
    const badges = {
        'cio': '<span class="badge-status badge-cio">CIO</span>',
        'hotlist': '<span class="badge-status badge-hot">🔥 HOTLIST</span>',
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

function renderHotlistCard(item) {
    const symbol = pick(item, ['token.symbol', 'symbol'], '???');
    const age = safeNum(item.timestamps?.age_minutes, 0) / 60; // Convert to hours for display
    const score = safeNum(item.scores?.hotlist_score, 0);
    const oppScore = safeNum(item.scores?.opportunity_score, 0);
    const riskLevel = item.risk?.level || 'unknown';
    const riskFactors = item.risk?.factors || [];
    const metrics = item.metrics || {};
    const liq = safeNum(metrics.liq_usd, 0);
    const vol1h = safeNum(metrics.vol_1h_usd, 0);
    const tx1h = safeNum(metrics.txns_1h, 0);
    const url = item.pair_url || (item.pool_address ? `https://dexscreener.com/base/${item.pool_address}` : '#');
    
    // Risk bias text
    const riskBiasText = {
        'low': '🟢 momentum + structure OK',
        'medium': '🟡 momentum OK, structure fragile',
        'high': '🔴 pure speculation, scalp only'
    }[riskLevel] || '⚪ unknown';
    
    const riskEmoji = riskLevel === 'low' ? '🟢' : riskLevel === 'medium' ? '🟡' : '🔴';
    
    return `
        <div class="token-card card-hot">
            <div class="card-header">
                <span class="token-symbol">${symbol}</span>
                <span class="badges">
                    ${renderAgeBadge(age)}
                    ${renderStatusBadge('hotlist')}
                </span>
            </div>
            <div class="card-metrics">
                <span>🔥 ${score}/100</span>
                <span>🎯 ${oppScore} opp</span>
                <span>💧 $${(liq/1e3).toFixed(0)}k</span>
                <span>📊 $${(vol1h/1e3).toFixed(0)}k</span>
                <span>🔥 ${Math.round(tx1h)} tx</span>
            </div>
            <div class="card-risk" style="font-size: 0.8rem; font-weight: 500; color: ${riskLevel === 'high' ? '#ff4444' : riskLevel === 'medium' ? '#ff8800' : '#90ff00'}; margin-bottom: 0.5rem; padding: 0.25rem 0.5rem; background: rgba(255,255,255,0.05); border-radius: 4px;">
                ${riskBiasText}
            </div>
            ${riskFactors.length > 0 ? `<div style="font-size: 0.7rem; color: var(--text-muted); margin-bottom: 0.5rem;">${riskFactors.join(', ')}</div>` : ''}
            <div class="card-footer">
                <span class="age-text">${item.timestamps?.age_minutes?.toFixed(0)}m old • EARLY OPPORTUNITY</span>
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
    const cioEl = document.getElementById('stat-cio');
    const watchEl = document.getElementById('stat-watch');
    const hotEl = document.getElementById('stat-hot');
    const fastEl = document.getElementById('stat-fast');
    const certEl = document.getElementById('stat-cert');
    
    if (cioEl) cioEl.textContent = feedState.cio.length;
    if (watchEl) watchEl.textContent = feedState.watch.length;
    if (hotEl) hotEl.textContent = feedState.hotlist.length;
    if (fastEl) fastEl.textContent = feedState.fastCertified.length;
    if (certEl) certEl.textContent = feedState.certified.length;
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

async function loadHotlistFeed() {
    try {
        const res = await fetch(`${REPO_RAW}/signals/hotlist_feed.json?t=${Date.now()}`, { cache: 'no-store' });
        if (!res.ok) {
            feedState.hotlist = [];
            return;
        }
        const data = await res.json();
        feedState.hotlist = data.hotlist || [];
    } catch (e) {
        console.log('Hotlist not available yet');
        feedState.hotlist = [];
    }
}

async function loadWatchFeed() {
    try {
        const res = await fetch(`${REPO_RAW}/signals/watch_feed.json?t=${Date.now()}`, { cache: 'no-store' });
        if (!res.ok) {
            feedState.watch = [];
            return;
        }
        const data = await res.json();
        feedState.watch = data.watch || [];
    } catch (e) {
        console.log('Watch not available yet');
        feedState.watch = [];
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
        loadWatchFeed(),
        loadHotlistFeed(),
        loadFastCertifiedFeed(),
        loadCertifiedFeed()
    ]);

    // Render stats
    renderStats();

    // Render CIO section
    const cioContainer = document.getElementById('cio-feed');
    if (cioContainer) {
        if (feedState.cio.length === 0) {
            cioContainer.innerHTML = '<div class="empty-feed">No active CIO candidates (0-10m)</div>';
        } else {
            // Sort by score
            const sorted = feedState.cio.sort((a, b) =>
                safeNum(b.scores?.cio_score) - safeNum(a.scores?.cio_score)
            );
            cioContainer.innerHTML = sorted.map(renderCIOCard).join('');
        }
    }

    // Render WATCH section
    const watchContainer = document.getElementById('watch-feed');
    if (watchContainer) {
        if (feedState.watch.length === 0) {
            watchContainer.innerHTML = '<div class="empty-feed">No WATCH yet (10-30m buffer)</div>';
        } else {
            const sorted = feedState.watch.sort((a, b) =>
                safeNum(b.timestamps?.checks) - safeNum(a.timestamps?.checks)
            );
            watchContainer.innerHTML = sorted.map(renderWatchCard).join('');
        }
    }

    // Render HOTLIST section
    const hotContainer = document.getElementById('hot-feed');
    if (hotContainer) {
        if (feedState.hotlist.length === 0) {
            hotContainer.innerHTML = '<div class="empty-feed">No HOTLIST yet (30-60m early opportunities)</div>';
        } else {
            const sorted = feedState.hotlist.sort((a, b) =>
                safeNum(b.scores?.opportunity_score) - safeNum(a.scores?.opportunity_score)
            );
            hotContainer.innerHTML = sorted.map(renderHotlistCard).join('');
        }
    }

    // Render FAST-CERTIFIED section
    const fastContainer = document.getElementById('fast-feed');
    if (fastContainer) {
        if (feedState.fastCertified.length === 0) {
            fastContainer.innerHTML = '<div class="empty-feed">No FAST-CERTIFIED yet (1-24h momentum)</div>';
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
