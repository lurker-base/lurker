/**
 * LURKER All Signals - Website Integration
 * Affiche TOUS les tokens (live + historique + alerts validées)
 */

const SIGNALS_CONFIG = {
    allSignalsUrl: 'data/allClankerSignals.json',
    alertsUrl: 'data/alerts.json',
    pollInterval: 15000,
    maxSignals: 20,
    maxAlerts: 5
};

// Format currency
function formatCurrency(value) {
    if (!value) return '$0';
    if (value >= 1000000) return '$' + (value / 1000000).toFixed(2) + 'M';
    if (value >= 1000) return '$' + (value / 1000).toFixed(1) + 'k';
    return '$' + value.toFixed(0);
}

// Format time ago
function timeAgo(timestamp) {
    if (!timestamp) return 'unknown';
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 60) return seconds + 's ago';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return minutes + 'min ago';
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return hours + 'h ago';
    const days = Math.floor(hours / 24);
    return days + 'd ago';
}

// Create signal element
function createSignalElement(signal) {
    const div = document.createElement('div');
    
    // Determine status
    let status = 'NEW';
    let statusClass = 'new';
    let emoji = '👁️';
    
    if (signal.status === 'HOT' || signal.lurkerSignal?.includes('HOT')) {
        status = 'HOT';
        statusClass = 'hot';
        emoji = '🔥';
    } else if (signal.status === 'WARM' || signal.lurkerSignal?.includes('WARM')) {
        status = 'WARM';
        statusClass = 'warm';
        emoji = '⚡';
    } else if (signal.source === 'historical') {
        status = 'HISTO';
        statusClass = 'histo';
        emoji = '📜';
    }
    
    div.className = `signal-item ${statusClass}`;
    
    const age = signal.ageHours 
        ? Math.floor(signal.ageHours) + 'h ago'
        : timeAgo(signal.detectedAt);
    
    const liq = signal.liquidityUsd || signal.liquidityUsd || 0;
    const mcap = signal.marketCap || 0;
    
    div.innerHTML = `
        <div class="signal-header">
            <span class="signal-emoji">${emoji}</span>
            <span class="signal-symbol">$${signal.symbol || '???'}</span>
            <span class="signal-status">${status}</span>
            <span class="signal-time">${age}</span>
        </div>
        <div class="signal-metrics">
            <span>Liq: ${formatCurrency(liq)}</span>
            ${mcap ? `<span>MCap: ${formatCurrency(mcap)}</span>` : ''}
            ${signal.score ? `<span>Score: ${signal.score}</span>` : ''}
        </div>
        <div class="signal-address">
            <a href="https://basescan.org/address/${signal.contract_address || signal.address}" target="_blank">
                ${(signal.contract_address || signal.address || '').slice(0, 10)}...${(signal.contract_address || signal.address || '').slice(-6)}
            </a>
            ${signal.url ? `<a href="${signal.url}" target="_blank" class="dex-link">DEX ↗</a>` : ''}
        </div>
    `;
    
    return div;
}

// Load all signals
async function loadAllSignals() {
    try {
        // Load all signals (live + historical)
        const signalsRes = await fetch(SIGNALS_CONFIG.allSignalsUrl + '?t=' + Date.now());
        const signals = signalsRes.ok ? await signalsRes.json() : [];
        
        // Load validated alerts
        const alertsRes = await fetch(SIGNALS_CONFIG.alertsUrl + '?t=' + Date.now());
        const alerts = alertsRes.ok ? await alertsRes.json() : [];
        
        // Update All Signals container
        const signalsContainer = document.getElementById('signals-container');
        if (signalsContainer && Array.isArray(signals)) {
            signalsContainer.innerHTML = '';
            
            if (signals.length === 0) {
                signalsContainer.innerHTML = '<div class="signals-empty">No signals yet...</div>';
            } else {
                // Mark alerts in signals
                const alertAddresses = new Set(alerts.map(a => a.tokenAddress || a.contract_address));
                signals.forEach(s => {
                    if (alertAddresses.has(s.contract_address || s.address)) {
                        s.isValidated = true;
                    }
                });
                
                // Display
                signals.slice(0, SIGNALS_CONFIG.maxSignals).forEach(signal => {
                    signalsContainer.appendChild(createSignalElement(signal));
                });
            }
        }
        
        // Update Validated Alerts container (if separate)
        const alertsContainer = document.getElementById('validated-alerts-container');
        if (alertsContainer && Array.isArray(alerts)) {
            alertsContainer.innerHTML = '';
            
            if (alerts.length === 0) {
                alertsContainer.innerHTML = '<div class="signals-empty">Waiting for HOT signals...</div>';
            } else {
                alerts.slice(0, SIGNALS_CONFIG.maxAlerts).forEach(alert => {
                    alertsContainer.appendChild(createSignalElement(alert));
                });
            }
        }
        
        // Update timestamp
        const lastUpdate = document.getElementById('signals-last-update');
        if (lastUpdate) {
            lastUpdate.textContent = 'Updated: ' + new Date().toLocaleTimeString();
        }
        
        console.log('[LURKER] Signals loaded:', signals.length, 'total,', alerts.length, 'validated');
        
    } catch(e) {
        console.error('[LURKER] Failed to load signals:', e);
    }
}

// Initialize
function initSignals() {
    console.log('[LURKER] All signals initialized');
    
    loadAllSignals();
    setInterval(loadAllSignals, SIGNALS_CONFIG.pollInterval);
}

// Auto-init
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSignals);
} else {
    initSignals();
}
