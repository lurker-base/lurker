// CIO Feed Loader — Renders candidates 0-48h (Bulletproof version)
const REPO_RAW = 'https://raw.githubusercontent.com/lurker-base/lurker/main';

function normalizeFeed(feed) {
    const meta = feed?.meta || {};
    const updated = meta.updated_at || feed?.updated_at || feed?.last_updated || '--:--';
    let items = feed?.candidates ?? feed?.signals ?? feed?.items ?? (Array.isArray(feed) ? feed : []);
    if (!Array.isArray(items)) items = [];
    return { updated, items };
}

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
    if (h < 1) return '<span style="background:#00ff00;color:#000;padding:2px 6px;border-radius:3px;font-size:0.7rem;">NEW</span>';
    if (h < 6) return `<span style="background:#90ff00;color:#000;padding:2px 6px;border-radius:3px;font-size:0.7rem;">${Math.round(h)}h</span>`;
    if (h < 24) return `<span style="background:#ffd700;color:#000;padding:2px 6px;border-radius:3px;font-size:0.7rem;">${Math.round(h)}h</span>`;
    return `<span style="background:#ff8800;color:#000;padding:2px 6px;border-radius:3px;font-size:0.7rem;">${Math.round(h)}h</span>`;
}

function renderCIOCard(item) {
    // Safe extraction with multiple path fallbacks
    const symbol = pick(item, ['token.symbol', 'symbol', 'baseToken.symbol'], '???');
    const name = pick(item, ['token.name', 'name'], symbol);
    const url = pick(item, ['pair_url', 'url', 'pair.url'], '');
    const dexId = pick(item, ['dexId', 'dex', 'pair.dexId'], 'unknown');
    const quote = pick(item, ['quote_token.symbol', 'quoteToken.symbol', 'quote'], '?');
    
    const ageH = safeNum(pick(item, ['age_hours', 'ageHours'], 0), 0);
    const score = safeNum(pick(item, ['scores.cio_score', 'score', 'confidence'], 0), 0);
    
    const liq = safeNum(pick(item, ['metrics.liq_usd', 'metrics.liquidity_usd', 'liquidity_usd', 'liq_usd'], 0), 0);
    const vol24 = safeNum(pick(item, ['metrics.vol_24h_usd', 'metrics.volume.h24', 'volume_h24'], 0), 0);
    const tx24 = safeNum(pick(item, ['metrics.txns_24h', 'metrics.txns.h24', 'txns_h24'], 0), 0);
    const price = safeNum(pick(item, ['metrics.price_usd', 'priceUsd'], 0), 0);
    const mcap = safeNum(pick(item, ['metrics.marketCap', 'metrics.mcap', 'marketCap', 'fdv'], 0), 0);
    
    const createdAt = pick(item, ['created_at', 'createdAt'], '');
    const poolAddr = pick(item, ['pool_address', 'pairAddress'], '');
    
    // Build DexScreener URL
    const dexUrl = url || (poolAddr ? `https://dexscreener.com/base/${poolAddr}` : '#');
    
    // Risk tags
    const riskTags = (item.risk_tags || []).map(t => 
        `<span style="background:#ff4444;color:#fff;padding:1px 4px;border-radius:2px;font-size:0.65rem;margin-right:4px;">${t}</span>`
    ).join('');
    
    return `
        <div class="cio-card" style="border:1px solid var(--border);padding:1rem;margin-bottom:1rem;border-radius:6px;border-left:3px solid #90ff00;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.5rem;">
                <span style="font-size:1.2rem;font-weight:600;">
                    ${symbol}
                    ${renderAgeBadge(ageH)}
                </span>
                <span style="font-size:0.8rem;color:var(--text-muted);">
                    CIO | ${dexId}
                </span>
            </div>
            <div style="font-size:0.9rem;color:var(--text-muted);margin-bottom:0.5rem;">
                Score: ${score}/100 | Quote: ${quote}
            </div>
            <div style="font-size:0.85rem;margin-bottom:0.5rem;">
                <span title="Price">💰 $${price ? price.toExponential(2) : 'N/A'}</span> | 
                <span title="Market Cap">🏢 $${(mcap / 1000000).toFixed(2)}M</span> | 
                <span title="Liquidity">💧 $${(liq / 1000).toFixed(0)}k</span> | 
                <span title="Volume 24h">📊 $${(vol24 / 1000).toFixed(0)}k</span> | 
                <span title="Transactions">🔥 ${Math.round(tx24)} tx</span>
            </div>
            ${riskTags ? `<div style="margin-bottom:0.5rem;">${riskTags}</div>` : ''}
            <div style="display:flex;justify-content:space-between;align-items:center;font-size:0.8rem;">
                <span style="color:var(--text-muted);">
                    ${createdAt ? `Created: ${createdAt}` : ''}
                </span>
                ${dexUrl !== '#' ? `<a href="${dexUrl}" target="_blank" style="color:var(--accent);">DexScreener →</a>` : ''}
            </div>
        </div>
    `;
}

async function renderCIOFeed(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    container.innerHTML = '<div class="signal-loading">Loading CIO candidates...</div>';
    
    const url = `${REPO_RAW}/signals/cio_feed.json?t=${Date.now()}`;
    const updatedEl = document.getElementById('last-update') || document.getElementById('updated');
    
    try {
        const r = await fetch(url, { cache: 'no-store' });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const feed = await r.json();
        const { updated, items } = normalizeFeed(feed);
        
        if (updatedEl) updatedEl.textContent = updated;
        
        if (!items.length) {
            container.innerHTML = '<div class="signal-empty">No active CIO candidates</div>';
            return;
        }
        
        container.innerHTML = items.map(renderCIOCard).join('');
    } catch (e) {
        console.error('CIO load failed:', e);
        container.innerHTML = `<div class="signal-empty">CIO feed error: ${e.message}</div>`;
    }
}

// Auto-init
document.addEventListener('DOMContentLoaded', () => {
    renderCIOFeed('cio-feed-container');
});

// Refresh every 30 seconds
setInterval(() => renderCIOFeed('cio-feed-container'), 30000);
