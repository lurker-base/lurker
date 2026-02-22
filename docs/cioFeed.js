// CIO Feed Loader v3 — Multi-source with anti-relist
const REPO_RAW = 'https://raw.githubusercontent.com/lurker-base/lurker/main';

function normalizeFeed(feed) {
    const meta = feed?.meta || {};
    const updated = meta.updated_at || feed?.updated_at || feed?.last_updated || '--:--';
    let items = feed?.candidates ?? feed?.signals ?? feed?.items ?? (Array.isArray(feed) ? feed : []);
    if (!Array.isArray(items)) items = [];
    return { updated, items, meta };
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
    if (h < 1) return '<span style="background:#00ff00;color:#000;padding:2px 6px;border-radius:3px;font-size:0.7rem;font-weight:bold;">NEW</span>';
    if (h < 6) return `<span style="background:#90ff00;color:#000;padding:2px 6px;border-radius:3px;font-size:0.7rem;">${Math.round(h)}h</span>`;
    if (h < 12) return `<span style="background:#ffd700;color:#000;padding:2px 6px;border-radius:3px;font-size:0.7rem;">${Math.round(h)}h</span>`;
    if (h < 24) return `<span style="background:#ff8800;color:#000;padding:2px 6px;border-radius:3px;font-size:0.7rem;">${Math.round(h)}h</span>`;
    return `<span style="background:#ff4444;color:#fff;padding:2px 6px;border-radius:3px;font-size:0.7rem;">${Math.round(h)}h</span>`;
}

function renderSourceBadge(source) {
    const colors = {
        'profiles': '#4CAF50',
        'boosts': '#2196F3',
        'top_boosts': '#9C27B0'
    };
    const color = colors[source] || '#666';
    const label = source === 'top_boosts' ? 'TOP' : source.toUpperCase();
    return `<span style="background:${color};color:#fff;padding:1px 6px;border-radius:3px;font-size:0.65rem;margin-left:6px;">${label}</span>`;
}

function renderCIOCard(item) {
    // Safe extraction
    const symbol = pick(item, ['token.symbol', 'symbol'], '???');
    const name = pick(item, ['token.name', 'name'], symbol);
    const url = pick(item, ['pair_url', 'url'], '');
    const dexId = pick(item, ['dex_id', 'dexId', 'dex'], 'unknown');
    const quote = pick(item, ['quote_token.symbol', 'quote'], '?');
    
    // Timestamps (v3 has timestamps object)
    const timestamps = item.timestamps || {};
    const pairAge = safeNum(timestamps.pair_age_hours || item.age_hours, 0);
    const tokenAge = safeNum(timestamps.token_age_hours, pairAge);
    const age = Math.min(pairAge, tokenAge); // Use youngest for display
    
    // Scores
    const score = safeNum(pick(item, ['scores.cio_score', 'score'], 0), 0);
    const source = pick(item, ['scores.source', 'source'], 'unknown');
    const freshness = safeNum(pick(item, ['scores.freshness'], 0), 0);
    
    // Metrics
    const metrics = item.metrics || {};
    const liq = safeNum(metrics.liq_usd || metrics.liquidity_usd, 0);
    const vol1h = safeNum(metrics.vol_1h_usd || metrics.vol_1h, 0);
    const vol24 = safeNum(metrics.vol_24h_usd || metrics.volume, 0);
    const tx1h = safeNum(metrics.txns_1h, 0);
    const tx24 = safeNum(metrics.txns_24h, 0);
    const price = safeNum(metrics.price_usd, 0);
    const mcap = safeNum(metrics.marketCap || metrics.mcap, 0);
    
    // URL
    const poolAddr = pick(item, ['pool_address', 'pairAddress'], '');
    const dexUrl = url || (poolAddr ? `https://dexscreener.com/base/${poolAddr}` : '#');
    
    return `
        <div class="cio-card" style="border:1px solid var(--border);padding:1rem;margin-bottom:1rem;border-radius:6px;border-left:4px solid ${freshness > 0.8 ? '#00ff00' : freshness > 0.5 ? '#90ff00' : '#ffd700'};">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.5rem;flex-wrap:wrap;gap:0.5rem;">
                <span style="font-size:1.2rem;font-weight:600;">
                    ${symbol}
                    ${renderAgeBadge(age)}
                    ${renderSourceBadge(source)}
                </span>
                <span style="font-size:0.8rem;color:var(--text-muted);">
                    ${dexId} • ${quote}
                </span>
            </div>
            
            <div style="display:flex;gap:1rem;font-size:0.85rem;color:var(--text-muted);margin-bottom:0.5rem;flex-wrap:wrap;">
                <span title="CIO Score">⭐ ${score}/100</span>
                <span title="Freshness">🌱 ${Math.round(freshness * 100)}%</span>
                ${tokenAge < pairAge ? `<span title="Anti-relist: new token">🆕 Token</span>` : ''}
            </div>
            
            <div style="font-size:0.85rem;margin-bottom:0.5rem;display:flex;gap:0.8rem;flex-wrap:wrap;">
                <span title="Price">💰 ${price ? '$' + price.toExponential(2) : 'N/A'}</span>
                <span title="Market Cap">🏢 ${mcap ? '$' + (mcap / 1e6).toFixed(2) + 'M' : 'N/A'}</span>
                <span title="Liquidity">💧 ${liq ? '$' + (liq / 1e3).toFixed(0) + 'k' : 'N/A'}</span>
            </div>
            
            <div style="font-size:0.8rem;margin-bottom:0.5rem;display:flex;gap:1rem;flex-wrap:wrap;color:var(--text-muted);">
                <span title="Volume 1h/24h">📊 1h: ${vol1h ? '$' + (vol1h / 1e3).toFixed(0) + 'k' : '-'} / 24h: ${vol24 ? '$' + (vol24 / 1e3).toFixed(0) + 'k' : '-'}</span>
                <span title="Transactions">🔥 1h: ${Math.round(tx1h)} tx / 24h: ${Math.round(tx24)} tx</span>
            </div>
            
            <div style="display:flex;justify-content:space-between;align-items:center;font-size:0.75rem;color:var(--text-muted);">
                <span>
                    Pair: ${pairAge.toFixed(1)}h${tokenAge !== pairAge ? ` • Token: ${tokenAge.toFixed(1)}h` : ''}
                </span>
                ${dexUrl !== '#' ? `<a href="${dexUrl}" target="_blank" style="color:var(--accent);text-decoration:none;">DexScreener →</a>` : ''}
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
        const { updated, items, meta } = normalizeFeed(feed);
        
        if (updatedEl) updatedEl.textContent = updated;
        
        // Show source summary if available
        const sourceStats = meta.sources ? ` (${meta.sources.length} sources)` : '';
        console.log(`[CIO] Loaded ${items.length} candidates${sourceStats}`);
        
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
