// CIO Feed Loader — Renders candidates 0-48h
const REPO_RAW = 'https://raw.githubusercontent.com/lurker-base/lurker/main';

function normalizeFeed(feed) {
    // Support multiple formats: v1 (signals), v2 (candidates), raw array
    const meta = feed?.meta || {};
    const updated = meta.updated_at || feed?.updated_at || feed?.last_updated || '--:--';
    let items = feed?.candidates || feed?.signals || feed?.items || (Array.isArray(feed) ? feed : []);
    // Force array
    if (!Array.isArray(items)) items = [];
    return { updated, items };
}

function safeNum(x, fallback = 0) {
    const n = Number(x);
    return Number.isFinite(n) ? n : fallback;
}

function safeDate(dateStr) {
    try {
        return new Date(dateStr).toLocaleString();
    } catch (e) {
        return dateStr || 'Unknown';
    }
}

function renderAgeBadge(ageHours) {
    const h = safeNum(ageHours);
    if (h < 1) return '<span style="background:#00ff00;color:#000;padding:2px 6px;border-radius:3px;font-size:0.7rem;">NEW</span>';
    if (h < 6) return `<span style="background:#90ff00;color:#000;padding:2px 6px;border-radius:3px;font-size:0.7rem;">${Math.round(h)}h</span>`;
    if (h < 24) return `<span style="background:#ffd700;color:#000;padding:2px 6px;border-radius:3px;font-size:0.7rem;">${Math.round(h)}h</span>`;
    return `<span style="background:#ff8800;color:#000;padding:2px 6px;border-radius:3px;font-size:0.7rem;">${Math.round(h)}h</span>`;
}

function renderCIOCard(candidate) {
    // Safe extraction with fallbacks
    const token = candidate.token || {};
    const quote = candidate.quote_token || {};
    const metrics = candidate.metrics || {};
    const scores = candidate.scores || {};
    
    const symbol = token.symbol || 'UNKNOWN';
    const name = token.name || symbol;
    const ageHours = safeNum(candidate.age_hours);
    const dex = candidate.dexId || candidate.dex || 'unknown';
    const score = safeNum(scores.cio_score);
    const quoteSymbol = quote.symbol || '?';
    
    // Metrics with fallbacks
    const price = metrics.price_usd || metrics.priceUsd || 0;
    const mcap = metrics.mcap || metrics.marketCap || metrics.fdv || 0;
    const liq = metrics.liq_usd || metrics.liquidity_usd || 0;
    const vol = metrics.vol_24h_usd || metrics.volume_h24 || 0;
    const txns = metrics.txns_24h || 0;
    
    // URL
    const dexUrl = candidate.pair_url || (candidate.pool_address ? `https://dexscreener.com/base/${candidate.pool_address}` : '#');
    
    // Risk tags
    const riskTags = (candidate.risk_tags || []).map(t => 
        `<span style="background:#ff4444;color:#fff;padding:1px 4px;border-radius:2px;font-size:0.65rem;margin-right:4px;">${t}</span>`
    ).join('');
    
    return `
        <div class="cio-card" style="border:1px solid var(--border);padding:1rem;margin-bottom:1rem;border-radius:6px;border-left:3px solid #90ff00;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.5rem;">
                <span style="font-size:1.2rem;font-weight:600;">
                    ${symbol}
                    ${renderAgeBadge(ageHours)}
                </span>
                <span style="font-size:0.8rem;color:var(--text-muted);">
                    CIO | ${dex}
                </span>
            </div>
            <div style="font-size:0.9rem;color:var(--text-muted);margin-bottom:0.5rem;">
                Score: ${score}/100 | 
                Quote: ${quoteSymbol}
            </div>
            <div style="font-size:0.85rem;margin-bottom:0.5rem;">
                <span title="Price">💰 $${price ? price.toExponential(2) : 'N/A'}</span> | 
                <span title="Market Cap">🏢 $${(mcap / 1000000).toFixed(2)}M</span> | 
                <span title="Liquidity">💧 $${(liq / 1000).toFixed(0)}k</span> | 
                <span title="Volume 24h">📊 $${(vol / 1000).toFixed(0)}k</span> | 
                <span title="Transactions">🔥 ${txns} tx</span>
            </div>
            ${riskTags ? `<div style="margin-bottom:0.5rem;">${riskTags}</div>` : ''}
            <div style="display:flex;justify-content:space-between;align-items:center;font-size:0.8rem;">
                <span style="color:var(--text-muted);">
                    Created: ${safeDate(candidate.created_at)}
                </span>
                <a href="${dexUrl}" target="_blank" style="color:var(--accent);">
                    DexScreener →
                </a>
            </div>
        </div>
    `;
}

async function renderCIOFeed(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    container.innerHTML = '<div class="signal-loading">Loading CIO candidates...</div>';
    
    // Fetch and normalize
    try {
        const res = await fetch(`${REPO_RAW}/signals/cio_feed.json?t=${Date.now()}`, {
            cache: "no-store"
        });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const data = await res.json();
        const { updated, items } = normalizeFeed(data);
        
        // Update "updated" label if exists
        const updatedEl = document.getElementById('last-update') || document.getElementById('updated');
        if (updatedEl) updatedEl.textContent = updated;
        
        renderCIOItems(container, items);
    } catch (e) {
        console.error('CIO load failed:', e);
        container.innerHTML = `<div class="signal-empty">CIO feed error: ${e.message}</div>`;
    }
}

function renderCIOItems(container, items) {
    // Safety check
    if (!Array.isArray(items)) {
        container.innerHTML = '<div class="signal-empty">Invalid feed format</div>';
        return;
    }
    
    // Filter: age <= 48h and has liquidity
    const active = items.filter(c => {
        const age = safeNum(c.age_hours);
        const liq = safeNum(c.metrics?.liq_usd || c.metrics?.liquidity_usd);
        return age <= 48 && liq > 0;
    });
    
    // Sort by CIO score descending
    active.sort((a, b) => safeNum(b.scores?.cio_score) - safeNum(a.scores?.cio_score));
    
    if (active.length === 0) {
        container.innerHTML = '<div class="signal-empty">No active CIO candidates</div>';
        return;
    }
    
    const html = active.slice(0, 20).map(renderCIOCard).join('');
    container.innerHTML = html;
}

// Auto-init
document.addEventListener('DOMContentLoaded', () => {
    renderCIOFeed('cio-feed-container');
});

// Refresh every 30 seconds
setInterval(() => renderCIOFeed('cio-feed-container'), 30000);
