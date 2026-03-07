// Live Data Loader — Fetches from GitHub JSON (V2 FORMAT)
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

function formatCurrency(value) {
    if (!value) return '$0';
    if (value >= 1000000) return '$' + (value / 1000000).toFixed(2) + 'M';
    if (value >= 1000) return '$' + (value / 1000).toFixed(1) + 'k';
    return '$' + value.toFixed(0);
}

function renderSignalWidget(data) {
    if (!data) {
        return '<div class="signal-empty">No active signal</div>';
    }
    
    // Get the first signal from array or use data directly
    const signals = data.signals || [];
    const signal = signals.length > 0 ? signals[0] : data;
    
    if (!signal || (signal.status !== 'active' && signal.status !== 'posted')) {
        return '<div class="signal-empty">🔍 Observing the chain...</div>';
    }
    
    const token = signal.token || {};
    const metrics = signal.metrics || {};
    const age = signal.age || {};
    const confidence = signal.confidence || 0;
    
    // V2 fields
    const thesis = signal.thesis || '';
    const whyNow = signal.why_now || [];
    const invalidation = signal.invalidation || '';
    const dexUrl = signal.dex_url || '';
    
    const liq = metrics.liq_usd || 0;
    const vol1h = metrics.vol_1h_usd || 0;
    const momentum = metrics.momentum_24h || 0;
    
    const ageDisplay = age.hours ? `${age.hours.toFixed(1)}h` : (age.minutes ? `${age.minutes}m` : 'unknown');
    
    return `
        <div class="signal-card">
            <div class="signal-header">
                <span class="signal-symbol">${token.symbol || 'UNKNOWN'}</span>
                <span class="signal-chain">${signal.chain || 'base'}</span>
                <span class="confidence-badge">${confidence.toFixed(1)}/6</span>
            </div>
            
            <div class="signal-meta">
                <span>Age: ${ageDisplay}</span>
                <span>Liq: ${formatCurrency(liq)}</span>
                <span>Vol 1h: ${formatCurrency(vol1h)}</span>
                ${momentum ? `<span>Momentum: ${momentum.toFixed(0)}%</span>` : ''}
            </div>
            
            ${thesis ? `<div class="signal-thesis"><strong>Thesis:</strong> ${thesis}</div>` : ''}
            
            ${whyNow.length > 0 ? `
                <div class="signal-why-now">
                    <strong>Why Now:</strong>
                    <ul>
                        ${whyNow.map(w => `<li>${w}</li>`).join('')}
                    </ul>
                </div>
            ` : ''}
            
            ${invalidation ? `<div class="signal-invalidation"><strong>Invalidation:</strong> ${invalidation}</div>` : ''}
            
            <div class="signal-time">
                ${signal.ts_utc ? new Date(signal.ts_utc).toLocaleString() : '--'}
            </div>
            
            ${dexUrl ? `<a href="${dexUrl}" target="_blank" class="dex-link">📊 View on DexScreener</a>` : ''}
        </div>
    `;
}

// Auto-refresh every 30 seconds
async function initLiveData() {
    const signalEl = document.getElementById('live-signal-widget');
    
    if (signalEl) {
        const signal = await fetchLatestSignal();
        signalEl.innerHTML = renderSignalWidget(signal);
    }
}

// Load on page load
document.addEventListener('DOMContentLoaded', initLiveData);

// Refresh every 30 seconds
setInterval(initLiveData, 30000);
