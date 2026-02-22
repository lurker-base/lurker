// CIO Feed Loader — Renders candidates 0-48h
const REPO_RAW = 'https://raw.githubusercontent.com/lurker-base/lurker/main';

async function fetchCIOFeed() {
    try {
        const res = await fetch(`${REPO_RAW}/signals/cio_feed.json?t=${Date.now()}`, {
            cache: "no-store"
        });
        if (!res.ok) throw new Error('CIO feed not found');
        const data = await res.json();
        return data.candidates || [];
    } catch (e) {
        console.log('CIO feed error:', e.message);
        return [];
    }
}

function renderAgeBadge(ageHours) {
    if (ageHours < 1) return '<span style="background:#00ff00;color:#000;padding:2px 6px;border-radius:3px;font-size:0.7rem;">NEW</span>';
    if (ageHours < 6) return `<span style="background:#90ff00;color:#000;padding:2px 6px;border-radius:3px;font-size:0.7rem;">${Math.round(ageHours)}h</span>`;
    if (ageHours < 24) return `<span style="background:#ffd700;color:#000;padding:2px 6px;border-radius:3px;font-size:0.7rem;">${Math.round(ageHours)}h</span>`;
    return `<span style="background:#ff8800;color:#000;padding:2px 6px;border-radius:3px;font-size:0.7rem;">${Math.round(ageHours)}h</span>`;
}

function renderCIOCard(candidate) {
    const token = candidate.token || {};
    const quote = candidate.quote_token || {};
    const metrics = candidate.metrics || {};
    const scores = candidate.scores || {};
    const ageHours = candidate.age_hours || 0;
    
    const riskTags = (candidate.risk_tags || []).map(t => 
        `<span style="background:#ff4444;color:#fff;padding:1px 4px;border-radius:2px;font-size:0.65rem;margin-right:4px;">${t}</span>`
    ).join('');
    
    return `
        <div class="cio-card" style="border:1px solid var(--border);padding:1rem;margin-bottom:1rem;border-radius:6px;border-left:3px solid #90ff00;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.5rem;">
                <span style="font-size:1.2rem;font-weight:600;">
                    ${token.symbol || 'UNKNOWN'}
                    ${renderAgeBadge(ageHours)}
                </span>
                <span style="font-size:0.8rem;color:var(--text-muted);">
                    CIO | ${candidate.dex || 'unknown'}
                </span>
            </div>
            <div style="font-size:0.9rem;color:var(--text-muted);margin-bottom:0.5rem;">
                Score: ${scores.cio_score || 0}/100 | 
                Quote: ${quote.symbol || '?'}
            </div>
            <div style="font-size:0.85rem;margin-bottom:0.5rem;">
                <span title="Price">💰 $${(metrics.price_usd || 0).toExponential(2)}</span> | 
                <span title="Market Cap">🏢 $${((metrics.mcap || 0) / 1000000).toFixed(2)}M</span> | 
                <span title="Liquidity">💧 $${((metrics.liq_usd || 0) / 1000).toFixed(0)}k</span> | 
                <span title="Volume 24h">📊 $${((metrics.vol_24h_usd || 0) / 1000).toFixed(0)}k</span> | 
                <span title="Transactions">🔥 ${metrics.txns_24h || 0} tx</span>
            </div>
            ${riskTags ? `<div style="margin-bottom:0.5rem;">${riskTags}</div>` : ''}
            <div style="display:flex;justify-content:space-between;align-items:center;font-size:0.8rem;">
                <span style="color:var(--text-muted);">
                    Created: ${new Date(candidate.created_at).toLocaleString()}
                </span>
                <a href="https://dexscreener.com/base/${candidate.pool_address}" target="_blank" style="color:var(--accent);">
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
    
    const feed = await fetchCIOFeed();
    
    // Filter: age <= 48h and has metrics
    const active = feed.filter(c => {
        const age = c.age_hours || 0;
        const hasMetrics = c.metrics && c.metrics.liq_usd > 0;
        return age <= 48 && hasMetrics;
    });
    
    // Sort by CIO score descending
    active.sort((a, b) => (b.scores?.cio_score || 0) - (a.scores?.cio_score || 0));
    
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
