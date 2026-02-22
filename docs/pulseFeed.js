// Pulse Feed Loader — Renders list of certified signals
const REPO_RAW = 'https://raw.githubusercontent.com/lurker-base/lurker/main';
const MAX_ITEMS = 10;

async function fetchPulseFeed() {
    try {
        const res = await fetch(`${REPO_RAW}/signals/pulse_feed.json?t=${Date.now()}`, {
            cache: "no-store"
        });
        if (!res.ok) throw new Error('Feed not found');
        return await res.json();
    } catch (e) {
        console.log('Pulse feed error:', e.message);
        return [];
    }
}

function renderPulseCard(signal) {
    const isDryRun = signal.mode === 'dry-run';
    const dryRunBadge = isDryRun ? '<span class="badge dry-run">🧪 DRY-RUN</span>' : '';
    const certifiedBadge = signal.certified ? '<span class="badge certified">✓ CERTIFIED</span>' : '';
    const token = signal.token || {};
    const scores = signal.scores || {};
    const metrics = signal.metrics || {};
    
    return `
        <div class="signal-card pulse-card ${isDryRun ? 'dry-run' : ''}">
            <div class="signal-header">
                <span class="signal-symbol">${token.symbol || 'UNKNOWN'}</span>
                <span class="signal-chain">${signal.chain || 'base'}</span>
                ${certifiedBadge}
                ${dryRunBadge}
            </div>
            <div class="signal-meta">
                <span>Conf: ${scores.confidence || 0}/100</span>
                <span>Risk: ${scores.risk || 'high'}</span>
                <span>${signal.signal_number || ''}</span>
            </div>
            <div class="signal-metrics">
                <span>Price: $${(metrics.price_usd || 0).toExponential(2)}</span>
                <span>MC: $${((metrics.mcap_usd || 0) / 1000).toFixed(0)}k</span>
                <span>Liq: $${((metrics.liq_usd || 0) / 1000).toFixed(0)}k</span>
            </div>
            <div class="signal-time">
                ${signal.ts_utc ? new Date(signal.ts_utc).toLocaleString() : '--'}
            </div>
        </div>
    `;
}

async function renderPulseFeed(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    container.innerHTML = '<div class="signal-loading">Loading certified signals...</div>';
    
    const feed = await fetchPulseFeed();
    
    if (feed.length === 0) {
        container.innerHTML = '<div class="signal-empty">No certified signals yet</div>';
        return;
    }
    
    const html = feed.slice(0, MAX_ITEMS).map(renderPulseCard).join('');
    container.innerHTML = html;
}

// Auto-init if element exists
document.addEventListener('DOMContentLoaded', () => {
    console.log('[LURKER] Initializing pulse feed...');
    renderPulseFeed('pulse-feed-container');
});

// Refresh every 30 seconds
setInterval(() => {
    console.log('[LURKER] Refreshing pulse feed...');
    renderPulseFeed('pulse-feed-container');
}, 30000);

// Also try immediate load in case DOM is already ready
if (document.readyState === 'complete' || document.readyState === 'interactive') {
    console.log('[LURKER] DOM already ready, loading immediately...');
    renderPulseFeed('pulse-feed-container');
}
