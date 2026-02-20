// Animate stats on load
function animateValue(id, start, end, duration) {
    const obj = document.getElementById(id);
    if (!obj) return;
    
    let startTimestamp = null;
    const step = (timestamp) => {
        if (!startTimestamp) startTimestamp = timestamp;
        const progress = Math.min((timestamp - startTimestamp) / duration, 1);
        obj.innerHTML = Math.floor(progress * (end - start) + start).toLocaleString();
        if (progress < 1) {
            window.requestAnimationFrame(step);
        }
    };
    window.requestAnimationFrame(step);
}

// Simulate live data
function updateStats() {
    const wallets = Math.floor(Math.random() * 100) + 1200;
    const signals = Math.floor(Math.random() * 50) + 450;
    const blocks = Math.floor(Date.now() / 1000 / 2); // Rough block estimate
    
    document.getElementById('wallets').textContent = wallets.toLocaleString();
    document.getElementById('signals').textContent = signals.toLocaleString();
    document.getElementById('blocks').textContent = blocks.toLocaleString();
}

// Add log line to terminal
function addLogLine(timestamp, level, message) {
    const terminal = document.getElementById('terminal-output');
    if (!terminal) return;
    
    const line = document.createElement('div');
    line.className = 'log-line';
    line.innerHTML = `
        <span class="timestamp">[${timestamp}]</span>
        <span class="level ${level.toLowerCase()}">${level}</span>
        <span class="message">${message}</span>
    `;
    
    // Remove cursor line, add new line, add cursor back
    const cursor = terminal.querySelector('.cursor');
    if (cursor) cursor.remove();
    
    terminal.appendChild(line);
    
    // Add cursor line back
    const cursorLine = document.createElement('div');
    cursorLine.className = 'log-line cursor';
    cursorLine.innerHTML = `
        <span class="timestamp">[${new Date().toLocaleTimeString('en-US', {hour12: false, hour: '2-digit', minute:'2-digit', second:'2-digit'})}]</span>
        <span class="level info">INFO</span>
        <span class="message">Waiting for next block...</span>
        <span class="blink">_</span>
    `;
    terminal.appendChild(cursorLine);
    
    // Keep only last 10 lines
    while (terminal.children.length > 10) {
        terminal.removeChild(terminal.firstChild);
    }
    
    terminal.scrollTop = terminal.scrollHeight;
}

// Simulate live activity
function simulateActivity() {
    const now = new Date().toLocaleTimeString('en-US', {hour12: false, hour: '2-digit', minute:'2-digit', second:'2-digit'});
    const activities = [
        { level: 'INFO', msg: `Scanning block ${Math.floor(Math.random() * 100000 + 42000000)}...` },
        { level: 'SIGNAL', msg: `Large transfer detected: ${(Math.random() * 100 + 10).toFixed(1)} ETH` },
        { level: 'INFO', msg: 'Analyzing wallet patterns...' },
        { level: 'SUCCESS', msg: 'Pattern database updated' }
    ];
    
    const activity = activities[Math.floor(Math.random() * activities.length)];
    addLogLine(now, activity.level, activity.msg);
    updateStats();
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    // Animate initial stats
    animateValue('wallets', 0, 1247, 2000);
    animateValue('signals', 0, 463, 2000);
    animateValue('blocks', 42300000, 42383738, 3000);
    
    // Simulate live activity every 3-7 seconds
    setInterval(simulateActivity, Math.random() * 4000 + 3000);
});

// Smooth scroll for nav links
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        e.preventDefault();
        const target = document.querySelector(this.getAttribute('href'));
        if (target) {
            target.scrollIntoView({ behavior: 'smooth' });
        }
    });
});
