// Animate metrics on scroll
function animateValue(id, start, end, duration) {
    const obj = document.getElementById(id);
    if (!obj) return;
    
    let startTimestamp = null;
    const step = (timestamp) => {
        if (!startTimestamp) startTimestamp = timestamp;
        const progress = Math.min((timestamp - startTimestamp) / duration, 1);
        const value = Math.floor(progress * (end - start) + start);
        obj.innerHTML = value.toLocaleString();
        if (progress < 1) {
            window.requestAnimationFrame(step);
        }
    };
    window.requestAnimationFrame(step);
}

// Initialize animations on load
document.addEventListener('DOMContentLoaded', () => {
    // Animate metrics
    setTimeout(() => {
        animateValue('blocks', 42000000, 42384127, 2000);
        animateValue('wallets', 0, 1247, 1500);
        animateValue('signals', 0, 463, 1800);
    }, 500);

    // Terminal typing effect
    const terminal = document.getElementById('terminal');
    if (terminal) {
        simulateTerminalActivity();
    }
});

// Simulate terminal activity
function simulateTerminalActivity() {
    const lines = [
        { type: 'output', text: '[00:00:05] Scanning block 42384128...' },
        { type: 'output', text: '[00:00:06] Analyzing transaction patterns...' },
        { type: 'signal', text: '[00:00:07] Large transfer detected: 23.5 ETH' },
        { type: 'output', text: '[00:00:08] Pattern analysis complete. No anomaly.' },
        { type: 'output', text: '[00:00:09] Waiting for next block...' },
    ];

    let index = 0;
    const terminal = document.getElementById('terminal');
    
    setInterval(() => {
        if (index >= lines.length) index = 0;
        
        const line = lines[index];
        const lineEl = document.createElement('div');
        lineEl.className = 'line output';
        
        if (line.type === 'signal') {
            lineEl.innerHTML = `<span class="timestamp">${line.text.split(' ')[0]}</span> <span class="highlight">${line.text.substring(line.text.indexOf(' ') + 1)}</span>`;
        } else {
            lineEl.innerHTML = `<span class="timestamp">${line.text.split(' ')[0]}</span> ${line.text.substring(line.text.indexOf(' ') + 1)}`;
        }
        
        // Remove cursor line, add new line, add cursor back
        const cursorLine = terminal.querySelector('.cursor-line');
        if (cursorLine) cursorLine.remove();
        
        terminal.appendChild(lineEl);
        
        // Add cursor line back
        const newCursorLine = document.createElement('div');
        newCursorLine.className = 'line cursor-line';
        newCursorLine.innerHTML = '<span class="prompt">$</span><span class="cursor">█</span>';
        terminal.appendChild(newCursorLine);
        
        // Keep only last 10 lines
        while (terminal.children.length > 12) {
            const firstOutput = terminal.querySelector('.output');
            if (firstOutput && !firstOutput.classList.contains('cursor-line')) {
                firstOutput.remove();
            } else {
                break;
            }
        }
        
        terminal.scrollTop = terminal.scrollHeight;
        index++;
    }, 4000);
}

// Random glitch effect on title
setInterval(() => {
    const title = document.querySelector('.title');
    if (title && Math.random() > 0.9) {
        title.style.transform = 'translateX(2px)';
        setTimeout(() => {
            title.style.transform = 'translateX(0)';
        }, 50);
    }
}, 3000);
