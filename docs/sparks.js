// Sparks effect for all pages
(function() {
    const sparksContainer = document.getElementById('sparks');
    const avatarWrapper = document.getElementById('avatar-wrapper');
    let sparkInterval;
    
    function createSpark() {
        if (!sparksContainer) return;
        const spark = document.createElement('div');
        spark.className = 'spark';
        
        // Random angle and distance
        const angle = Math.random() * Math.PI * 2;
        const distance = 70 + Math.random() * 50;
        const x = Math.cos(angle) * distance;
        const y = Math.sin(angle) * distance;
        
        // Random destination (fly outward)
        const flyDistance = 30 + Math.random() * 60;
        const tx = Math.cos(angle) * (distance + flyDistance);
        const ty = Math.sin(angle) * (distance + flyDistance);
        
        spark.style.left = `calc(50% + ${x}px)`;
        spark.style.top = `calc(50% + ${y}px)`;
        spark.style.setProperty('--tx', `${tx}px`);
        spark.style.setProperty('--ty', `${ty}px`);
        spark.style.animation = `spark-fly ${0.5 + Math.random() * 0.5}s ease-out forwards`;
        spark.style.animationDelay = `${Math.random() * 0.2}s`;
        
        sparksContainer.appendChild(spark);
        
        setTimeout(() => spark.remove(), 1200);
    }
    
    // Auto-create sparks periodically
    setInterval(() => {
        if (Math.random() > 0.3) createSpark();
    }, 300);
    
    // More sparks on hover
    if (avatarWrapper) {
        avatarWrapper.addEventListener('mouseenter', () => {
            sparkInterval = setInterval(createSpark, 80);
        });
        
        avatarWrapper.addEventListener('mouseleave', () => {
            clearInterval(sparkInterval);
        });
    }
})();