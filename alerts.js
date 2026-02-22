/**
 * LURKER Live Alerts - Website Integration
 * Affiche les alertes HOT/WARM en temps réel sur le site
 */

const ALERTS_CONFIG = {
    dataUrl: 'data/alerts.json', // Chemin relatif depuis le site
    pollInterval: 15000, // 15 secondes
    maxAlerts: 10,
    soundEnabled: false // Option: son sur nouvelle alerte
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
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 60) return seconds + 's ago';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return minutes + 'min ago';
    const hours = Math.floor(minutes / 60);
    return hours + 'h ago';
}

// Create alert element
function createAlertElement(alert) {
    const div = document.createElement('div');
    div.className = `alert-item ${alert.status.toLowerCase()}`;
    
    const emoji = alert.status === 'HOT' ? '🔥' : '⚡';
    
    div.innerHTML = `
        <div class="alert-header">
            <span class="alert-emoji">${emoji}</span>
            <span class="alert-symbol">$${alert.symbol}</span>
            <span class="alert-status">${alert.status}</span>
            <span class="alert-time">${timeAgo(alert.sentAt || alert.detectedAt)}</span>
        </div>
        <div class="alert-metrics">
            <span>Liq: ${formatCurrency(alert.liquidityUsd || alert.liquidityUsd)}</span>
            <span>Vol: ${formatCurrency(alert.volume5m || alert.volume1h)}</span>
            <span>Score: ${alert.score}/100</span>
        </div>
        <div class="alert-address">
            <a href="https://basescan.org/address/${alert.tokenAddress}" target="_blank">
                ${alert.tokenAddress.slice(0, 12)}...${alert.tokenAddress.slice(-8)}
            </a>
        </div>
    `;
    
    return div;
}

// Load and display alerts
async function loadAlerts() {
    try {
        const response = await fetch(ALERTS_CONFIG.dataUrl + '?t=' + Date.now());
        if (!response.ok) return;
        
        const alerts = await response.json();
        if (!Array.isArray(alerts) || alerts.length === 0) return;
        
        const container = document.getElementById('alerts-container');
        if (!container) return;
        
        // Clear current (ou append selon préférence)
        container.innerHTML = '';
        
        // Affiche les dernières alertes
        alerts.slice(0, ALERTS_CONFIG.maxAlerts).forEach(alert => {
            container.appendChild(createAlertElement(alert));
        });
        
        // Update timestamp
        const lastUpdate = document.getElementById('alerts-last-update');
        if (lastUpdate) {
            lastUpdate.textContent = 'Last update: ' + new Date().toLocaleTimeString();
        }
        
    } catch(e) {
        console.error('[ALERTS] Failed to load:', e);
    }
}

// Initialize
function initAlerts() {
    console.log('[LURKER] Live alerts initialized');
    
    // First load
    loadAlerts();
    
    // Poll for updates
    setInterval(loadAlerts, ALERTS_CONFIG.pollInterval);
}

// Auto-init if DOM ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAlerts);
} else {
    initAlerts();
}
