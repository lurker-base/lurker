// Live Feed Loader — Renders list from DexScreener scanner
const REPO_RAW = 'https://raw.githubusercontent.com/lurker-base/lurker/main';

async function fetchLiveFeed() {
    try {
        const res = await fetch(`${REPO_RAW}/signals/live_feed.json?t=${Date.now()}`, {
            cache: "no-store"
        });
        if (!res.ok) throw new Error('Feed not found');
        const data = await res.json();
        // New format: {meta: {...}, signals: [...]}
        return data.signals || [];
    } catch (e) {
        console.log('Live feed error:', e.message);
        // Fallback: try old format (array)
        try {
            const res = await fetch(`${REPO_RAW}/signals/live_feed.json?t=${Date.now()}`, {
                cache: "no-store"
            });
            const data = await res.json();
            if (Array.isArray(data)) return data;
        } catch (e2) {}
        return [];
    }
}

function renderSignalCard(signal) {
    const isDryRun = signal.mode === 'dry-run';
    const dryRunBadge = isDryRun ? '<span class="badge dry-run">🧪 DRY-RUN</span>' : '';
    const token = signal.token || {};
    const scores = signal.scores || {};
    const metrics = signal.metrics || {};
    
    return `
        <div class="signal-card ${isDryRun ? 'dry-run' : ''}">
            <div class="signal-header">
                <span class="signal-symbol">${token.symbol || 'UNKNOWN'}</span>
                <span class="signal-chain">${signal.chain || 'base'}</span>
                ${dryRunBadge}
            </div>
            <div class="signal-meta">
                <span>Conf: ${scores.confidence || 0}/100</span>
                <span>Risk: ${scores.risk || 'high'}</span>
                ${signal.dex ? `<span>${signal.dex}</span>` : ''}
            </div>
            <div class="signal-metrics">
                <span>Price: $${(metrics.price_usd || 0).toExponential(2)}</span>
                <span>Liq: $${((metrics.liq_usd || 0) / 1000).toFixed(0)}k</span>
                <span>Vol24h: $${((metrics.vol_24h_usd || metrics.vol_5m_usd || 0) / 1000).toFixed(0)}k</span>
            </div>
            <div class="signal-time">
                ${signal.ts_utc ? new Date(signal.ts_utc).toLocaleString() : '--'}
            </div>
        </div>
    `;
}

async function renderLiveFeed(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    container.innerHTML = '<div class="signal-loading">Loading live feed...</div>';
    
    const feed = await fetchLiveFeed();
    
    if (feed.length === 0) {
        container.innerHTML = '<div class="signal-empty">No live signals yet</div>';
        return;
    }
    
    const html = feed.slice(0, 10).map(renderSignalCard).join('');
    container.innerHTML = html;
}

// Auto-init
document.addEventListener('DOMContentLoaded', () => {
    renderLiveFeed('live-feed-container');
});

// Refresh every 30 seconds
setInterval(() => renderLiveFeed('live-feed-container'), 30000);
