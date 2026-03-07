// LURKER Unified Feed — CIO + WATCH + HOTLIST + FAST-CERTIFIED + CERTIFIED

// Inject V2 styles
(function() {
    const style = document.createElement('style');
    style.textContent = `.confidence-badge { padding: 2px 8px; border-radius: 10px; color: white; font-weight: bold; font-size: 0.75em; }
.thesis-box { font-size: 0.8em; color: #a78bfa; background: rgba(124,58,237,0.1); padding: 6px 10px; border-radius: 4px; margin: 4px 0; }
.why-now-box { font-size: 0.75em; color: #fbbf24; margin: 4px 0; }
.invalidation-box { font-size: 0.7em; color: #f87171; font-style: italic; margin: 4px 0; }`;
    if (document.head) document.head.appendChild(style);
})();


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

function formatAge(ageMinutes) {
    const mins = safeNum(ageMinutes);
    if (mins < 60) {
        return `${Math.round(mins)}m`;
    } else {
        const hours = (mins / 60).toFixed(1);
        return `${hours}h`;
    }
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
    // Add confidence badge
    let confBadge = '';
    if (confidence > 0) {
        let confColor = '#ef4444';
        if (confidence >= 5) confColor = '#22c55e';
        else if (confidence >= 3) confColor = '#f59e0b';
        confBadge = `<span class="confidence-badge" style="background:\${confColor}">\${confidence.toFixed(1)}/6</span>`;
    }
    const ageMin = safeNum(item.timestamps?.age_minutes, 0);
    const age = ageMin / 60;
    const checks = item.timestamps?.checks || 1;
    const metrics = item.metrics || {};
    const liq = safeNum(metrics.liq_usd, 0);
    const tx5m = safeNum(metrics.txns_5m, 0);
    const tokenAddress = pick(item, ['token.address', 'address'], '');
    const url = item.pair?.address ? `https://dexscreener.com/base/${item.pair.address}` : 
                (item.pair_url || (item.pool_address ? `https://dexscreener.com/base/${item.pool_address}` : 
                (tokenAddress ? `https://dexscreener.com/base/${tokenAddress}` : '#')));
    
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
            ${renderBadges(item.badges || [])}
            ${invalidation ? `<div class="invalidation-box">🛑 ${invalidation}</div>` : ''}
            <div class="card-footer">
                <span class="age-text">${formatAge(ageMin)} old</span>
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
function renderRiskBadge(riskLevel, risks = []) {
    const colors = {
        'low': '#00ff00',
        'medium': '#ffaa00', 
        'high': '#ff4444'
    };
    const bgColors = {
        'low': 'rgba(0,255,0,0.1)',
        'medium': 'rgba(255,170,0,0.1)',
        'high': 'rgba(255,68,68,0.1)'
    };
    const color = colors[riskLevel] || '#666';
    const bg = bgColors[riskLevel] || 'rgba(102,102,102,0.1)';
    const riskText = risks.slice(0, 2).join(', ') || riskLevel;
    return `<span class="badge-risk" style="background:${bg};color:${color};border:1px solid ${color};padding:2px 8px;border-radius:3px;font-size:0.7rem;text-transform:uppercase;">${riskLevel} risk${risks.length > 0 ? ': ' + riskText : ''}</span>`;
}

function renderQualityBadge(quality, liq, vol1h = 0) {
    if (!quality) return '';
    const qScore = quality.quality_score || 0;
    // Premium: high quality + either good liquidity OR strong volume (pumping)
    const hasGoodLiq = liq > 40000;  // Lowered from $100K
    const isPumping = vol1h > 100000; // $100K+ volume in 1h = pumping
    const isPremium = qScore >= 80 && (hasGoodLiq || isPumping);
    const isGood = qScore >= 60 || liq > 30000 || vol1h > 50000;
    
    if (isPremium) {
        return '<span class="badge-quality" style="background:#4ade80;color:#000;padding:2px 8px;border-radius:3px;font-size:0.7rem;font-weight:bold;">PREMIUM</span>';
    } else if (isGood) {
        return '<span class="badge-quality" style="background:#60a5fa;color:#000;padding:2px 8px;border-radius:3px;font-size:0.7rem;font-weight:bold;">GOOD</span>';
    } else {
        return '<span class="badge-quality" style="background:#fbbf24;color:#000;padding:2px 8px;border-radius:3px;font-size:0.7rem;font-weight:bold;">WATCH</span>';
    }
}

function renderQualityIcons(quality, isPumping = false) {
    if (!quality) return '';
    let icons = '';
    if (quality.has_image) icons += '🖼️';
    if (quality.has_socials) icons += '💬';
    if (quality.has_website) icons += '🌐';
    if (isPumping) icons += ' 🚀';
    return icons ? `<span style="margin-left:0.5rem;">${icons}</span>` : '';
}

function renderBadges(badges) {
    if (!badges || !Array.isArray(badges) || badges.length === 0) return '';
    return badges.map(b => `<span class="badge" style="background:rgba(255,255,255,0.1);padding:2px 6px;border-radius:3px;font-size:0.7rem;margin-right:4px;">${b}</span>`).join('');
}

function renderCIOCard(item) {
    // V2 field extraction
    const confidence = safeNum(item.confidence || 0, 0);
    const thesis = item.thesis || '';
    const whyNow = item.why_now || [];
    const invalidation = item.invalidation || '';
    const dexUrl = item.dex_url || '';
    const vol24h = safeNum(item.metrics?.volume24h || item.metrics?.vol_24h_usd, 0);
    const momentum = safeNum(item.metrics?.momentum_24h, 0);
    
    const symbol = pick(item, ['token.symbol', 'symbol'], '???');
    // Add confidence badge
    let confBadge = '';
    if (confidence > 0) {
        let confColor = '#ef4444';
        if (confidence >= 5) confColor = '#22c55e';
        else if (confidence >= 3) confColor = '#f59e0b';
        confBadge = `<span class="confidence-badge" style="background:\${confColor}">\${confidence.toFixed(1)}/6</span>`;
    }
    const age = safeNum(item.age_hours || item.timestamps?.age_hours, 0);
    const ageMin = safeNum(item.timestamps?.age_minutes, age * 60);
    const score = safeNum(item.scores?.cio_score, 0);
    const source = item.source || item.scores?.source;
    const metrics = item.metrics || {};
    const liq = safeNum(metrics.liq_usd || metrics.liquidity?.usd, 0);
    const vol5m = safeNum(metrics.vol_5m_usd || metrics.volume?.m5, 0);
    const vol1h = safeNum(metrics.vol_1h_usd || metrics.volume?.h1, 0);
    const tx5m = safeNum(metrics.txns_5m || (item.txns?.m5?.buys + item.txns?.m5?.sells), 0);
    const riskLevel = item.risk_level || 'unknown';
    const risks = item.risks || [];
    const quality = item.quality || {};
    const badges = item.badges || [];
    const tokenAddress = pick(item, ['token.address', 'address'], '');
    const url = item.pair?.address ? `https://dexscreener.com/base/${item.pair.address}` : 
                (item.pair_url || (item.pool_address ? `https://dexscreener.com/base/${item.pool_address}` : 
                (tokenAddress ? `https://dexscreener.com/base/${tokenAddress}` : '#')));
    
    // Visual separation by quality
    const qScore = quality.quality_score || 0;
    const hasGoodLiq = liq > 40000;
    const isPumping = vol1h > 100000;
    const isPremium = qScore >= 80 && (hasGoodLiq || isPumping);
    const isGood = qScore >= 60 || liq > 30000 || vol1h > 50000;
    
    const qualityStyles = {
        'premium': 'border-left: 4px solid #4ade80; background: rgba(74,222,128,0.05);',
        'good': 'border-left: 4px solid #60a5fa; background: rgba(96,165,250,0.05);',
        'watch': 'border-left: 4px solid #fbbf24; background: rgba(251,191,36,0.05);',
        'unknown': ''
    };
    const cardStyle = isPremium ? qualityStyles.premium : isGood ? qualityStyles.good : qualityStyles.watch;
    
    return `
        <div class="token-card card-cio" style="${cardStyle}">
            <div class="card-header">
                <span class="token-symbol">${symbol}</span>
                <span class="badges">
                    ${confBadge}
                    ${renderAgeBadge(age)}
                    ${renderSourceBadge(source)}
                </span>
            </div>
            
            ${thesis ? `<div class="thesis-box">📝 ${thesis}</div>` : ''}
            ${whyNow.length > 0 ? `<div class="why-now-box">🔥 ${whyNow.slice(0,2).join(' | ')}</div>` : ''}
            <div style="margin: 0.5rem 0;">
                ${renderRiskBadge(riskLevel, risks)}
                ${renderBadges(badges)}
            </div>
            <div class="card-metrics">
                <span>⭐ ${score}/100</span>
                <span>💧 $${(liq/1e3).toFixed(1)}k</span>
                <span>📈 $${(vol1h/1e3).toFixed(0)}k/h</span>
                ${momentum ? `<span>🚀 ${momentum > 0 ? '+' : ''}${momentum.toFixed(0)}%</span>` : ''}
                <span>🔥 ${Math.round(tx5m)} tx/5m</span>
            </div>
            ${invalidation ? `<div class="invalidation-box">🛑 ${invalidation}</div>` : ''}
            <div class="card-footer">
                <span class="age-text">${formatAge(ageMin)} old</span>
                ${url !== '#' ? `<a href="${url}" target="_blank" class="dex-link">DexScreener →</a>` : ''}
            </div>
        </div>
    `;
}

function renderHotlistCard(item) {
    const symbol = pick(item, ['token.symbol', 'symbol'], '???');
    // Add confidence badge
    let confBadge = '';
    if (confidence > 0) {
        let confColor = '#ef4444';
        if (confidence >= 5) confColor = '#22c55e';
        else if (confidence >= 3) confColor = '#f59e0b';
        confBadge = `<span class="confidence-badge" style="background:\${confColor}">\${confidence.toFixed(1)}/6</span>`;
    }
    const ageMin = safeNum(item.timestamps?.age_minutes, 0);
    const age = ageMin / 60; // Convert to hours for display
    const score = safeNum(item.scores?.hotlist_score, 0);
    const oppScore = safeNum(item.scores?.opportunity_score, 0);
    const riskLevel = item.risk?.level || 'unknown';
    const riskFactors = item.risk?.factors || [];
    const metrics = item.metrics || {};
    const liq = safeNum(metrics.liq_usd, 0);
    const vol1h = safeNum(metrics.vol_1h_usd, 0);
    const tx1h = safeNum(metrics.txns_1h, 0);
    const tokenAddress = pick(item, ['token.address', 'address'], '');
    const url = item.pair?.address ? `https://dexscreener.com/base/${item.pair.address}` : 
                (item.pair_url || (item.pool_address ? `https://dexscreener.com/base/${item.pool_address}` : 
                (tokenAddress ? `https://dexscreener.com/base/${tokenAddress}` : '#')));
    
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
            ${renderBadges(item.badges || [])}
            <div class="card-footer">
                <span class="age-text">${formatAge(ageMin)} old • EARLY OPPORTUNITY</span>
                ${url !== '#' ? `<a href="${url}" target="_blank" class="dex-link">DexScreener →</a>` : ''}
            </div>
        </div>
    `;
}

function renderFastCertifiedCard(item) {
    const original = item.original_cio || item;
    const symbol = pick(original, ['token.symbol', 'symbol'], '???');
    const age = safeNum(item.timestamps?.age_hours, 0);
    const score = safeNum(item.momentum?.score, 0);
    const metrics = item.metrics_at_cert || item.metrics || {};
    const liq = safeNum(metrics.liq_usd, 0);
    const vol24 = safeNum(metrics.vol_24h_usd, 0);
    const tx24 = safeNum(metrics.txns_24h, 0);
    const trend = item.momentum?.vol_trend || 'stable';
    const tokenAddress = pick(item, ['token.address', 'address'], pick(original, ['token.address', 'address'], ''));
    const url = item.pair?.address ? `https://dexscreener.com/base/${item.pair.address}` : 
                (original.pair?.address ? `https://dexscreener.com/base/${original.pair.address}` : 
                (item.pair_url || (item.pool_address ? `https://dexscreener.com/base/${item.pool_address}` : 
                (tokenAddress ? `https://dexscreener.com/base/${tokenAddress}` : '#'))));
    
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
            ${renderBadges(item.badges || [])}
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
        // V2 SUPPORT: Try latest.json first (our new V2 format)
        const res = await fetch(`${REPO_RAW}/signals/latest.json?t=${Date.now()}`, { cache: 'no-store' });
        if (res.ok) {
            const data = await res.json();
            // V2 format: data.signals is array
            if (data.signals && data.signals.length > 0) {
                feedState.cio = data.signals;
                feedState.updated = data.meta?.updated_at || data.updated_at || '--:--';
                return;
            }
            // Direct V2 token object
            if (data.token) {
                feedState.cio = [data];
                feedState.updated = data.meta?.updated_at || '--:--';
                return;
            }
        }
        // Fallback to old format
        const res2 = await fetch(`${REPO_RAW}/signals/cio_feed.json?t=${Date.now()}`, { cache: 'no-store' });
        if (!res2.ok) throw new Error('CIO HTTP ' + res2.status);
        const data2 = await res2.json();
        feedState.cio = data2.candidates || data2.tokens || [];
        feedState.updated = data2.meta?.updated_at || data2.updated_at || '--:--';
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
        // Support both old (hotlist) and new (tokens) structure
        feedState.hotlist = data.hotlist || data.tokens || [];
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
        // Support both old (watch) and new (tokens) structure
        feedState.watch = data.watch || data.tokens || [];
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
        // Support both old (fast_certified) and new (tokens) structure
        feedState.fastCertified = data.fast_certified || data.tokens || [];
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

// === V2 FORMAT SUPPORT ===
function isV2Format(data) {
    return data && (data.format === 'LURKER_SIGNAL_V2' || data.kind === 'LURKER_SIGNAL_V2' || data.meta?.format === 'LURKER_SIGNAL_V2');
}

function renderV2Token(token) {
    const tokenInfo = token.token || {};
    const metrics = token.metrics || {};
    const age = token.age || {};
    const confidence = token.confidence || 0;
    
    const symbol = tokenInfo.symbol || '???';
    const liq = safeNum(metrics.liq_usd, 0);
    const vol24h = safeNum(metrics.volume24h || metrics.vol_1h_usd || 0, 0);
    const price = metrics.price_usd || 0;
    const momentum = safeNum(metrics.momentum_24h, 0);
    
    const ageDisplay = age.hours ? `${age.hours.toFixed(1)}h` : (age.minutes ? `${age.minutes}m` : '?');
    
    // Thesis and why_now
    const thesis = token.thesis || '';
    const whyNow = token.why_now || [];
    const invalidation = token.invalidation || '';
    
    // Confidence badge color
    let confColor = '#ef4444'; // red
    if (confidence >= 4) confColor = '#22c55e'; // green
    else if (confidence >= 2) confColor = '#f59e0b'; // yellow
    
    return `
        <div class="token-row v2">
            <div class="token-main">
                <span class="token-symbol">${symbol}</span>
                <span class="token-age" style="background:${confColor}">${confidence.toFixed(1)}/6</span>
            </div>
            <div class="token-stats">
                <span>Liq: $${(liq/1000).toFixed(0)}k</span>
                <span>Vol: $${(vol24h/1000).toFixed(0)}k</span>
                <span>Momentum: ${momentum > 0 ? '+' : ''}${momentum.toFixed(0)}%</span>
                <span>Age: ${ageDisplay}</span>
            </div>
            ${thesis ? `<div class="token-thesis">📝 ${thesis}</div>` : ''}
            ${whyNow.length > 0 ? `<div class="token-why-now">🔥 ${whyNow.slice(0,2).join(' | ')}</div>` : ''}
            ${invalidation ? `<div class="token-invalidation">🛑 Invalidation: ${invalidation}</div>` : ''}
        </div>
    `;
}

// Add V2 CSS
const v2css = `
.token-v2 { border-left: 3px solid #7C3AED; margin: 8px 0; padding: 12px; background: rgba(124,58,237,0.05); border-radius: 8px; }
.token-thesis { font-size: 0.85em; color: #a78bfa; margin-top: 8px; padding: 8px; background: rgba(124,58,237,0.1); border-radius: 4px; }
.token-why-now { font-size: 0.8em; color: #fbbf24; margin-top: 4px; }
.token-invalidation { font-size: 0.75em; color: #f87171; margin-top: 4px; }
.token-age { padding: 2px 8px; border-radius: 10px; color: white; font-weight: bold; }
`;

// Inject V2 CSS
if (typeof document !== 'undefined') {
    const style = document.createElement('style');
    style.textContent = v2css;
    document.head.appendChild(style);
}

// Add V2 CSS styles
const v2Styles = `
.confidence-badge { padding: 2px 8px; border-radius: 10px; color: white; font-weight: bold; font-size: 0.75em; }
.thesis-box { font-size: 0.8em; color: #a78bfa; background: rgba(124,58,237,0.1); padding: 6px 10px; border-radius: 4px; margin: 4px 0; }
.why-now-box { font-size: 0.75em; color: #fbbf24; margin: 4px 0; }
.invalidation-box { font-size: 0.7em; color: #f87171; font-style: italic; margin: 4px 0; }
`;
