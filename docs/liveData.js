// Live Data Loader — Fetches from GitHub JSON
const REPO_RAW = 'https://raw.githubusercontent.com/lurker-base/lurker/main';

async function fetchLatestSignal() {
    try {
        const res = await fetch(`${REPO_RAW}/signals/latest.json?t=${Date.now()}`, {
            cache: "no-store"
        });
        if (!res.ok) throw new Error('Signal not found');
        return await res.json();
    } catch (e) {
        console.log('No live signal yet:', e.message);
        return null;
    }
}

async function fetchPerformance() {
    try {
        const res = await fetch(`${REPO_RAW}/state/performance_tracker.json?t=${Date.now()}`, {
            cache: "no-store"
        });
        if (!res.ok) throw new Error('Tracker not found');
        return await res.json();
    } catch (e) {
        console.log('No performance data yet:', e.message);
        return null;
    }
}

function renderSignalWidget(data) {
    if (!data || data.status !== 'posted') {
        return '<div class="signal-empty">No active signal</div>';
    }
    
    const isDryRun = data.mode === 'dry-run';
    const dryRunBadge = isDryRun ? '<span class="badge dry-run">🧪 DRY-RUN</span>' : '';
    const token = data.token || {};
    const scores = data.scores || {};
    const metrics = data.metrics || {};
    
    return `
        <div class="signal-card ${isDryRun ? 'dry-run' : ''}">
            <div class="signal-header">
                <span class="signal-symbol">${token.symbol || 'UNKNOWN'}</span>
                <span class="signal-chain">${data.chain || 'base'}</span>
                ${dryRunBadge}
            </div>
            <div class="signal-meta">
                <span>Conf: ${scores.confidence || 0}/100</span>
                <span>Risk: ${scores.risk || 'high'}</span>
            </div>
            <div class="signal-metrics">
                <span>Price: $${(metrics.price_usd || 0).toExponential(2)}</span>
                <span>MC: $${((metrics.mcap_usd || 0) / 1000).toFixed(0)}k</span>
                <span>Liq: $${((metrics.liq_usd || 0) / 1000).toFixed(0)}k</span>
            </div>
            <div class="signal-time">
                ${data.ts_utc ? new Date(data.ts_utc).toLocaleTimeString() : '--:--'}
            </div>
        </div>
    `;
}

function renderPerformanceWidget(data) {
    if (!data) {
        return '<div class="perf-empty">No performance data</div>';
    }
    
    const signals = data.signals || [];
    const total = signals.length;
    const wins = signals.filter(s => s.verdict === 'WIN').length;
    const winRate = total > 0 ? ((wins / total) * 100).toFixed(0) : '--';
    
    return `
        <div class="perf-card">
            <div class="perf-title">📊 Performance Tracker</div>
            <div class="perf-stats">
                <div class="perf-stat">
                    <span class="perf-value">${total}</span>
                    <span class="perf-label">signals</span>
                </div>
                <div class="perf-stat">
                    <span class="perf-value">${winRate}%</span>
                    <span class="perf-label">win rate</span>
                </div>
                <div class="perf-stat">
                    <span class="perf-value">${data.target_signals || 20}</span>
                    <span class="perf-label">target</span>
                </div>
            </div>
            <div class="perf-phase">Phase: <strong>${data.phase || 'DRY-RUN'}</strong></div>
            <div class="perf-note">Tracking transparency — results cannot be cherry-picked</div>
        </div>
    `;
}

// Auto-refresh every 30 seconds
async function initLiveData() {
    const signalEl = document.getElementById('live-signal-widget');
    const perfEl = document.getElementById('performance-widget');
    
    if (signalEl) {
        const signal = await fetchLatestSignal();
        signalEl.innerHTML = renderSignalWidget(signal);
    }
    
    if (perfEl) {
        const perf = await fetchPerformance();
        perfEl.innerHTML = renderPerformanceWidget(perf);
    }
}

// Load on page load
document.addEventListener('DOMContentLoaded', initLiveData);

// Refresh every 30 seconds
setInterval(initLiveData, 30000);
