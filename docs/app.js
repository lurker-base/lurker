// Simple counter animation
let blockCount = 42384127;
let signalCount = 463;

const blockEl = document.getElementById('block-count');
const signalEl = document.getElementById('signal-count');

function updateBlocks() {
    blockCount++;
    if (blockEl) blockEl.textContent = blockCount.toLocaleString();
}

// Update every 2 seconds
setInterval(updateBlocks, 2000);

// Simulate occasional signal
setInterval(() => {
    if (Math.random() > 0.7) {
        signalCount++;
        if (signalEl) signalEl.textContent = signalCount;
    }
}, 5000);

// Change "connecting..." to "connected" after 3s
setTimeout(() => {
    const indicator = document.querySelector('.status-indicator');
    if (indicator) {
        indicator.textContent = 'connected';
        indicator.style.color = 'var(--accent)';
    }
}, 3000);
