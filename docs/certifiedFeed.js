// CERTIFIED Feed Loader — Renders certified 48h+
const REPO_RAW = 'https://raw.githubusercontent.com/lurker-base/lurker/main';

async function fetchCertifiedFeed() {
    try {
        const res = await fetch(`${REPO_RAW}/signals/pulse_feed.json?t=${Date.now()}`, {
            cache: "no-store"
        });
        if (!res.ok) throw new Error('Certified feed not found');
        const data = await res.json();
        return data.certified || [];
    } catch (e) {
        console.log('Certified feed error:', e.message);
        return [];
    }
}

function renderCertifiedBadge(stage) {
    if (stage === '72h') {
        return '<span style="background:#00ff00;color:#000;padding:2px 8px;border-radius:3px;font-size:0.75rem;font-weight:bold;">✓ CERTIFIED 72H</span>';
    }
    return '<span style="background:#90ff00;color:#000;padding:2px 8px;border-radius:3px;font-size:0.75rem;font-weight:bold;">✓ CERTIFIED 48H</span>';
}

function renderHealthBar(score) {
    const color = score >= 80 ? '#00ff00' : score >= 60 ? '#ffd700' : '#ff4444';
    return `
        <div style="display:flex;align-items:center;gap:8px;font-size:0.8rem;">
            <span style="color:var(--text-muted);">Health:</span>
            <div style="flex:1;height:6px;background:rgba(255,255,255,0.1);border-radius:3px;overflow:hidden;">
                <div style="width:${score}%;height:100%;background:${color};transition:width 0.3s;"></div>
            </div>
            <span style="color:${color};font-weight:600;">${score}</span>
        </div>
    `;
}

function renderCertifiedCard(certified) {
    const token = certified.token || {};
    const quote = certified.quote_token || {};
    const metrics = certified.metrics || {};
    const scores = certified.scores || {};
    const stage = certified.cert_stage || '48h';
    
    return `
        <div class="certified-card" style="border:1px solid var(--border);padding:1rem;margin-bottom:1rem;border-radius:6px;border-left:3px solid #00ff00;background:rgba(0,255,0,0.05);">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.5rem;">
                <span style="font-size:1.2rem;font-weight:600;">
                    ${token.symbol || 'UNKNOWN'}
                    ${renderCertifiedBadge(stage)}
                </span>
                <span style="font-size:0.8rem;color:var(--text-muted);">
                    ${certified.dex || 'unknown'}
                </span>
            </div>
            ${renderHealthBar(scores.health_score || scores.certified_score || 0)}
            <div style="font-size:0.85rem;margin:0.5rem 0;">
                <span title="Price">💰 $${(metrics.price_usd || 0).toExponential(2)}</span> | 
                <span title="Market Cap">🏢 $${((metrics.mcap || 0) / 1000000).toFixed(2)}M</span> | 
                <span title="Liquidity">💧 $${((metrics.liq_usd || 0) / 1000).toFixed(0)}k</span> | 
                <span title="Volume 24h">📊 $${((metrics.vol_24h_usd || 0) / 1000).toFixed(0)}k</span> | 
                <span title="Transactions">🔥 ${metrics.txns_24h || 0} tx</span>
            </div>
            <div style="font-size:0.8rem;color:var(--text-muted);margin-bottom:0.5rem;">
                Certified: ${new Date(certified.certified_at).toLocaleDateString()} | 
                Survivor of ${Math.round((Date.now() - new Date(certified.created_at)) / (1000 * 3600))}h
            </div>
            <div style="display:flex;justify-content:space-between;align-items:center;font-size:0.8rem;">
                <span style="color:var(--text-muted);">
                    Quote: ${quote.symbol || '?'}
                </span>
                <a href="https://dexscreener.com/base/${certified.pool_address}" target="_blank" style="color:var(--accent);">
                    DexScreener →
                </a>
            </div>
        </div>
    `;
}

async function renderCertifiedFeed(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    container.innerHTML = '<div class="signal-loading">Loading certified signals...</div>';
    
    const feed = await fetchCertifiedFeed();
    
    if (feed.length === 0) {
        container.innerHTML = '<div class="signal-empty">No certified signals yet</div>';
        return;
    }
    
    // Sort: 72h first, then by score
    feed.sort((a, b) => {
        if (a.cert_stage === '72h' && b.cert_stage !== '72h') return -1;
        if (a.cert_stage !== '72h' && b.cert_stage === '72h') return 1;
        return (b.scores?.certified_score || 0) - (a.scores?.certified_score || 0);
    });
    
    const html = feed.slice(0, 20).map(renderCertifiedCard).join('');
    container.innerHTML = html;
}

// Auto-init
document.addEventListener('DOMContentLoaded', () => {
    renderCertifiedFeed('certified-feed-container');
});

// Refresh every 30 seconds
setInterval(() => renderCertifiedFeed('certified-feed-container'), 30000);
