const fs = require('fs');
const path = require('path');
const axios = require('axios');

// Config
const CONFIG = {
    dataFile: path.join(__dirname, '../data/signals.json'),
    statsFile: path.join(__dirname, '../data/stats.json'),
    performanceFile: path.join(__dirname, '../data/performance.json'),
    updateInterval: 300000, // 5 minutes
};

// Ensure data directory exists
const dataDir = path.dirname(CONFIG.dataFile);
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

// Load files
function loadJSON(file, defaultVal = {}) {
    try {
        if (fs.existsSync(file)) {
            return JSON.parse(fs.readFileSync(file, 'utf8'));
        }
    } catch(e) {}
    return defaultVal;
}

function saveJSON(file, data) {
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

// Load data
const signals = loadJSON(CONFIG.dataFile, []);
let stats = loadJSON(CONFIG.statsFile, {
    startTime: Date.now(),
    totalScans: 0,
    totalTokensChecked: 0,
    tokensDetected: 0,
    bySource: {},
    byScoreRange: {
        '90-100': { count: 0, pumps: 0 },
        '80-89': { count: 0, pumps: 0 },
        '70-79': { count: 0, pumps: 0 },
        '60-69': { count: 0, pumps: 0 },
        '50-59': { count: 0, pumps: 0 },
        '40-49': { count: 0, pumps: 0 },
        '<40': { count: 0, pumps: 0 }
    },
    hourlyActivity: []
});

let performance = loadJSON(CONFIG.performanceFile, {
    signals: []
});

// Get score range
function getScoreRange(score) {
    if (score >= 90) return '90-100';
    if (score >= 80) return '80-89';
    if (score >= 70) return '70-79';
    if (score >= 60) return '60-69';
    if (score >= 50) return '50-59';
    if (score >= 40) return '40-49';
    return '<40';
}

// Fetch current price data for a token
async function getCurrentPrice(tokenAddress) {
    try {
        const res = await axios.get(
            `https://api.dexscreener.com/latest/dex/tokens/${tokenAddress}`,
            { timeout: 10000 }
        );
        if (!res.data?.pairs?.length) return null;
        
        const pair = res.data.pairs[0];
        return {
            priceUSD: parseFloat(pair.priceUsd) || 0,
            liquidityUSD: parseFloat(pair.liquidity?.usd) || 0,
            volume24h: parseFloat(pair.volume?.h24) || 0,
            marketCap: parseFloat(pair.marketCap) || 0,
            timestamp: Date.now()
        };
    } catch(e) {
        return null;
    }
}

// Calculate price change percentage
function calculateChange(current, initial) {
    if (!initial || initial === 0) return 0;
    return ((current - initial) / initial) * 100;
}

// Determine if token "pumped"
function didPump(changes) {
    // Pump = +20% dans les 24h ou +50% dans les 6h
    return changes.change24h > 20 || changes.change6h > 50 || changes.change1h > 30;
}

// Update stats for a signal
async function updateSignalPerformance(signal) {
    const hoursSinceDetection = (Date.now() - signal.detectedAt) / (1000 * 60 * 60);
    
    // Only track if detected more than 1h ago (to have meaningful data)
    if (hoursSinceDetection < 1) return;
    
    // Find existing performance entry
    let perfEntry = performance.signals.find(p => p.id === signal.id);
    
    if (!perfEntry) {
        perfEntry = {
            id: signal.id,
            symbol: signal.symbol,
            address: signal.address,
            source: signal.source || 'unknown',
            score: signal.score,
            detectedAt: signal.detectedAt,
            initialPrice: signal.priceUSD,
            initialMcap: signal.marketCap,
            updates: []
        };
        performance.signals.push(perfEntry);
    }
    
    // Get current data
    const current = await getCurrentPrice(signal.address);
    if (!current) return;
    
    // Calculate changes
    const changes = {
        timestamp: Date.now(),
        priceUSD: current.priceUSD,
        marketCap: current.marketCap,
        change1h: hoursSinceDetection >= 1 ? calculateChange(current.priceUSD, signal.priceUSD) : null,
        change6h: hoursSinceDetection >= 6 ? calculateChange(current.priceUSD, perfEntry.updates.find(u => u.hours >= 6)?.priceUSD || signal.priceUSD) : null,
        change24h: hoursSinceDetection >= 24 ? calculateChange(current.priceUSD, signal.priceUSD) : null
    };
    
    // Add update
    perfEntry.updates.push({
        hours: Math.floor(hoursSinceDetection),
        ...changes
    });
    
    // Mark as pumped if criteria met
    if (!perfEntry.pumped && didPump(changes)) {
        perfEntry.pumped = true;
        perfEntry.pumpTime = Date.now();
        
        // Update stats
        const range = getScoreRange(signal.score);
        stats.byScoreRange[range].pumps++;
        
        console.log(`[STATS] 🚀 PUMP: ${signal.symbol} | Score: ${signal.score} | +${changes.change24h?.toFixed(1) || changes.change1h?.toFixed(1)}%`);
    }
    
    // Save
    saveJSON(CONFIG.performanceFile, performance);
}

// Update global stats
function updateGlobalStats() {
    // Calculate overall success rate
    const totalPumps = Object.values(stats.byScoreRange).reduce((a, r) => a + r.pumps, 0);
    stats.totalSignals = signals.length;
    stats.pumpsDetected = totalPumps;
    stats.overallSuccessRate = signals.length > 0 ? (totalPumps / signals.length * 100).toFixed(1) : 0;
    
    // Calculate by source
    const bySource = {};
    signals.forEach(s => {
        const src = s.source || 'unknown';
        if (!bySource[src]) bySource[src] = { count: 0, avgScore: 0 };
        bySource[src].count++;
        bySource[src].avgScore += s.score;
    });
    
    Object.keys(bySource).forEach(src => {
        bySource[src].avgScore = (bySource[src].avgScore / bySource[src].count).toFixed(1);
    });
    
    stats.bySource = bySource;
    
    // Calculate score distribution
    const scoreDist = {};
    signals.forEach(s => {
        const range = getScoreRange(s.score);
        if (!scoreDist[range]) scoreDist[range] = { count: 0, pumps: 0 };
        scoreDist[range].count++;
    });
    
    // Merge with existing pump data
    Object.keys(stats.byScoreRange).forEach(range => {
        if (scoreDist[range]) {
            stats.byScoreRange[range].count = scoreDist[range].count;
        }
    });
    
    // Success rate by score range
    Object.keys(stats.byScoreRange).forEach(range => {
        const r = stats.byScoreRange[range];
        r.successRate = r.count > 0 ? (r.pumps / r.count * 100).toFixed(1) : 0;
    });
    
    // Hourly activity
    const hour = new Date().getHours();
    const existing = stats.hourlyActivity.find(h => h.hour === hour);
    if (existing) {
        existing.signals++;
    } else {
        stats.hourlyActivity.push({ hour, signals: 1 });
    }
    
    // Uptime
    stats.uptimeHours = ((Date.now() - stats.startTime) / (1000 * 60 * 60)).toFixed(1);
    
    // Last update
    stats.lastUpdate = Date.now();
    
    saveJSON(CONFIG.statsFile, stats);
}

// Print report
function printReport() {
    console.log('\n' + '='.repeat(60));
    console.log('📊 LURKER STATS REPORT');
    console.log('='.repeat(60));
    console.log(`\n⏱️  Uptime: ${stats.uptimeHours} hours`);
    console.log(`📡 Total Signals: ${stats.totalSignals || signals.length}`);
    console.log(`🚀 Pumps Detected: ${stats.pumpsDetected || 0}`);
    console.log(`📈 Overall Success Rate: ${stats.overallSuccessRate || 0}%`);
    
    console.log('\n📍 By Source:');
    Object.entries(stats.bySource || {}).forEach(([src, data]) => {
        console.log(`   ${src}: ${data.count} signals (avg score: ${data.avgScore})`);
    });
    
    console.log('\n🎯 By Score Range:');
    Object.entries(stats.byScoreRange).forEach(([range, data]) => {
        if (data.count > 0) {
            console.log(`   ${range}: ${data.count} signals, ${data.pumps} pumps (${data.successRate}%)`);
        }
    });
    
    console.log('\n💡 Recommendations:');
    
    // Find best performing score range
    const bestRange = Object.entries(stats.byScoreRange)
        .filter(([_, d]) => d.count >= 3) // At least 3 signals
        .sort((a, b) => parseFloat(b[1].successRate) - parseFloat(a[1].successRate))[0];
    
    if (bestRange) {
        console.log(`   ✅ Focus on score range ${bestRange[0]} (${bestRange[1].successRate}% success)`);
    }
    
    const worstRange = Object.entries(stats.byScoreRange)
        .filter(([_, d]) => d.count >= 3 && parseFloat(d.successRate) < 30)
        .sort((a, b) => parseFloat(a[1].successRate) - parseFloat(b[1].successRate))[0];
    
    if (worstRange) {
        console.log(`   ⚠️  Avoid score range ${worstRange[0]} (${worstRange[1].successRate}% success)`);
    }
    
    console.log('='.repeat(60) + '\n');
}

// Main update loop
async function update() {
    console.log('[STATS] Updating performance data...');
    
    // Update performance for each signal
    for (const signal of signals) {
        await updateSignalPerformance(signal);
    }
    
    // Update global stats
    updateGlobalStats();
    
    // Print report
    printReport();
}

// Run
update();
setInterval(update, CONFIG.updateInterval);

console.log('[STATS] Tracker started — updates every 5 minutes');
console.log('[STATS] Tracking', signals.length, 'signals');
