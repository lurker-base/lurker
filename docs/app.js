// Animate block number
let currentBlock = 42384127;
const blockElement = document.getElementById('block-num');

function updateBlock() {
    currentBlock++;
    if (blockElement) {
        blockElement.textContent = currentBlock.toLocaleString();
    }
}

// Update block every 2 seconds (simulating real-time)
setInterval(updateBlock, 2000);

// Random activity bar animation speeds
const bars = document.querySelectorAll('.bar');
bars.forEach((bar, index) => {
    const randomDelay = Math.random() * 0.5;
    const randomDuration = 0.5 + Math.random() * 0.5;
    bar.style.animationDelay = `${randomDelay}s`;
    bar.style.animationDuration = `${randomDuration}s`;
});

// Simulate metrics loading
setTimeout(() => {
    const metricValues = document.querySelectorAll('.metric-value');
    metricValues.forEach(el => {
        if (el.textContent === '--') {
            el.textContent = 'TBD';
            el.style.color = '#444';
        }
    });
}, 1000);

// Subtle parallax on avatar
document.addEventListener('mousemove', (e) => {
    const avatar = document.querySelector('.avatar');
    if (!avatar) return;
    
    const x = (e.clientX / window.innerWidth - 0.5) * 10;
    const y = (e.clientY / window.innerHeight - 0.5) * 10;
    
    avatar.style.transform = `translate(${x}px, ${y}px)`;
});
