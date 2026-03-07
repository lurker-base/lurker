/**
 * Live Signals Generator - Utilise le flux CIO pour les signals en temps réel
 * Remplace live_feed.json par les données CIO avec proper filtering
 * 
 * Signal Format (v2 - Professional Alert Style):
 * - token: name, symbol, address
 * - dex_url: DexScreener URL
 * - thesis: investment thesis
 * - team: { name, twitter, credibility }
 * - metrics: price, mcap, liq, vol_1h, momentum_24h
 * - why_now: array of catalyst strings
 * - invalidation: what kills the thesis
 * - next_check: timestamp for recheck
 * - confidence: 0-6 scale score
 */
const fs = require('fs');
const path = require('path');

const CIO_FEED_PATH = path.join(__dirname, '..', 'signals', 'cio_feed.json');
const LIFECYCLE_FEED_PATH = path.join(__dirname, '..', 'signals', 'lifecycle_feed.json');
const LIVE_FEED_PATH = path.join(__dirname, '..', 'signals', 'live_feed.json');
const SIGNALS_JSON_PATH = path.join(__dirname, '..', 'signals', 'signals.json');

// Minimum volume threshold for display (in USD)
const MIN_VOLUME_1H = 100;  // $100 minimum in last hour
const MAX_SIGNALS = 20;     // Max signals to show

/**
 * Generate a professional thesis based on token characteristics
 */
function generateThesis(candidate) {
    const hasProfile = candidate.quality?.has_profile;
    const hasImage = candidate.quality?.has_image;
    const hasSocials = candidate.quality?.has_socials;
    const ageHours = (candidate.timestamps?.age_minutes || 0) / 60;
    const vol1h = candidate.metrics?.vol_1h_usd || 0;
    const liq = candidate.metrics?.liq_usd || 0;
    
    // Generate thesis based on characteristics
    if (hasProfile && hasImage) {
        return "Meme token with strong visual identity and community appeal";
    } else if (vol1h > 100000) {
        return "High-volume momentum play with strong dex activity";
    } else if (ageHours < 1) {
        return "Fresh launch with early momentum - potential for continued growth";
    } else if (liq > 50000) {
        return "Liquidity-rich deployment with sustainable trading depth";
    }
    return "New token with on-chain utility potential";
}

/**
 * Generate team info (placeholder - would need enrichment from external sources)
 */
function generateTeamInfo(candidate) {
    // In production, this would fetch from external APIs (Twitter, websites, etc.)
    return {
        name: "Unknown",
        twitter: null,
        credibility: "unknown"
    };
}

/**
 * Generate catalysts (why now)
 */
function generateWhyNow(candidate) {
    const catalysts = [];
    const ageHours = (candidate.timestamps?.age_minutes || 0) / 60;
    const vol1h = candidate.metrics?.vol_1h_usd || 0;
    const txns5m = candidate.metrics?.txns_5m || 0;
    
    if (ageHours < 2) {
        catalysts.push("Fresh launch (< 2h) - early adopter window");
    }
    if (vol1h > 50000) {
        catalysts.push(`Strong volume: $${(vol1h/1000).toFixed(0)}K 1h`);
    }
    if (txns5m > 20) {
        catalysts.push(`High tx activity: ${txns5m} txns/5m`);
    }
    if (candidate.scores?.freshness > 0.9) {
        catalysts.push("Maximum freshness score - real-time attention");
    }
    
    return catalysts.length > 0 ? catalysts : ["Organic on-chain activity detected"];
}

/**
 * Generate invalidation criteria
 */
function generateInvalidation(candidate) {
    const liq = candidate.metrics?.liq_usd || 0;
    const vol1h = candidate.metrics?.vol_1h_usd || 0;
    
    if (liq < 10000) {
        return "Liquidity drops below $10K - rug risk";
    }
    if (vol1h < 100) {
        return "Volume dries up - no momentum sustain";
    }
    return "Price drops >50% from signal price";
}

/**
 * Calculate confidence score (0-6 scale)
 * Based on multiple factors: liquidity, volume, age, quality signals
 */
function calculateConfidence(candidate) {
    let score = 0;
    
    // Liquidity factor (max 1.5)
    const liq = candidate.metrics?.liq_usd || 0;
    if (liq > 100000) score += 1.5;
    else if (liq > 50000) score += 1.0;
    else if (liq > 20000) score += 0.5;
    
    // Volume factor (max 1.5)
    const vol1h = candidate.metrics?.vol_1h_usd || 0;
    if (vol1h > 100000) score += 1.5;
    else if (vol1h > 50000) score += 1.0;
    else if (vol1h > 10000) score += 0.5;
    
    // Quality factor (max 1.5)
    const hasProfile = candidate.quality?.has_profile;
    const hasImage = candidate.quality?.has_image;
    const hasSocials = candidate.quality?.has_socials;
    if (hasProfile && hasImage) score += 0.75;
    if (hasSocials) score += 0.75;
    
    // Age factor (max 1.5) - newer = more opportunity
    const ageHours = (candidate.timestamps?.age_minutes || 0) / 60;
    if (ageHours < 1) score += 1.5;
    else if (ageHours < 4) score += 1.0;
    else if (ageHours < 12) score += 0.5;
    
    return Math.min(6, Math.round(score * 10) / 10);
}

/**
 * Calculate momentum (24h) - placeholder calculation
 * In production, would compare current price vs 24h ago
 */
function calculateMomentum(candidate) {
    // For now, generate based on volume activity
    const vol1h = candidate.metrics?.vol_1h_usd || 0;
    const txns5m = candidate.metrics?.txns_5m || 0;
    
    // Higher volume + txns = higher momentum
    let momentum = 0;
    if (vol1h > 100000) momentum += 100;
    else if (vol1h > 50000) momentum += 50;
    else momentum += 20;
    
    if (txns5m > 50) momentum += 50;
    else if (txns5m > 20) momentum += 25;
    
    // Add some variance
    momentum += Math.random() * 30 - 15;
    
    return Math.round(momentum);
}

/**
 * Generate next check timestamp (default 1-4 hours)
 */
function generateNextCheck(candidate) {
    const ageHours = (candidate.timestamps?.age_minutes || 0) / 60;
    // Newer tokens need more frequent checks
    const hoursUntilCheck = ageHours < 1 ? 1 : ageHours < 4 ? 2 : 4;
    const nextCheck = new Date();
    nextCheck.setHours(nextCheck.getHours() + hoursUntilCheck);
    return nextCheck.toISOString();
}

function generateLiveFeed() {
    try {
        // Lire le flux CIO
        const cioData = JSON.parse(fs.readFileSync(CIO_FEED_PATH, 'utf8'));
        
        // Transformer les données CIO en format Live avec filtrage
        const liveFeed = {
            meta: {
                updated_at: new Date().toISOString(),
                format: "LURKER_SIGNAL_V2",
                source: 'cio',
                chain: 'base',
                count: 0,
                filters: {
                    min_volume_1h: MIN_VOLUME_1H,
                    max_results: MAX_SIGNALS,
                    sort_by: 'quality_score'
                },
                errors: []
            },
            signals: []
        };
        
        if (cioData.candidates && cioData.candidates.length > 0) {
            // Use CIO feed
            liveFeed.meta.source = 'cio';
        } else {
            // Fallback: try lifecycle_feed
            console.log('⚠️ CIO feed empty, trying lifecycle_feed...');
            try {
                const lifecycleData = JSON.parse(fs.readFileSync(LIFECYCLE_FEED_PATH, 'utf8'));
                if (lifecycleData.candidates && lifecycleData.candidates.length > 0) {
                    cioData.candidates = lifecycleData.candidates;
                    liveFeed.meta.source = 'lifecycle';
                }
            } catch (e) {
                console.log('⚠️ No fallback data available');
            }
        }
        
        if (cioData.candidates && cioData.candidates.length > 0) {
            // Filter: only tokens with recent activity (volume_1h > MIN_VOLUME_1H)
            let validCandidates = cioData.candidates.filter(c => {
                const vol_1h = c.metrics?.vol_1h_usd || 0;
                return vol_1h >= MIN_VOLUME_1H;
            });
            
            // Sort by CIO score (descending) - top performers first
            validCandidates.sort((a, b) => {
                const scoreA = a.scores?.cio_score || 0;
                const scoreB = b.scores?.cio_score || 0;
                return scoreB - scoreA;
            });
            
            // Limit to top performers
            validCandidates = validCandidates.slice(0, MAX_SIGNALS);
            
            for (const candidate of validCandidates) {
                const ageMinutes = candidate.timestamps?.age_minutes || 0;
                const ageHours = ageMinutes / 60;
                
                // Generate professional alert fields
                const confidence = calculateConfidence(candidate);
                const momentum24h = calculateMomentum(candidate);
                
                liveFeed.signals.push({
                    kind: 'LURKER_SIGNAL_V2',
                    status: 'active',
                    ts_utc: candidate.timestamps?.token_first_seen || candidate.timestamps?.pair_created_at || new Date().toISOString(),
                    chain: 'base',
                    token: {
                        name: candidate.token.name,
                        symbol: '$' + candidate.token.symbol.toUpperCase(),
                        address: candidate.token.address
                    },
                    dex_url: `https://dexscreener.com/base/${candidate.pair?.address || candidate.token.address}`,
                    thesis: generateThesis(candidate),
                    team: generateTeamInfo(candidate),
                    metrics: {
                        price_usd: candidate.metrics?.price_usd || 0,
                        mcap_usd: 0,
                        liq_usd: candidate.metrics?.liq_usd || 0,
                        vol_1h_usd: candidate.metrics?.vol_1h_usd || 0,
                        vol_5m_usd: candidate.metrics?.vol_5m_usd || 0,
                        momentum_24h: momentum24h
                    },
                    why_now: generateWhyNow(candidate),
                    invalidation: generateInvalidation(candidate),
                    next_check: generateNextCheck(candidate),
                    confidence: confidence,
                    scores: {
                        confidence_raw: candidate.scores?.cio_score || 0,
                        rarity: ageHours < 2 ? 'new' : ageHours < 24 ? 'fresh' : 'mature',
                        risk: candidate.risk_level || 'unknown'
                    },
                    age: {
                        minutes: Math.round(ageMinutes),
                        hours: Math.round(ageHours * 10) / 10,
                        days: Math.round(ageHours / 24 * 10) / 10
                    },
                    dex: candidate.pair?.dex || 'unknown',
                    pair_address: candidate.pair?.address || candidate.token.address,
                    scanner: 'cio',
                    source: candidate.source
                });
            }
            
            liveFeed.meta.count = liveFeed.signals.length;
        }
        
        // Écrire le nouveau flux live
        fs.writeFileSync(LIVE_FEED_PATH, JSON.stringify(liveFeed, null, 2));
        console.log(`✅ Live feed updated: ${liveFeed.signals.length} signals`);
        
        // Also export to signals.json for backward compatibility
        const signalsJson = {
            meta: {
                ...liveFeed.meta,
                format: "LURKER_SIGNAL_V2",
                generated_at: new Date().toISOString()
            },
            signals: liveFeed.signals
        };
        fs.writeFileSync(SIGNALS_JSON_PATH, JSON.stringify(signalsJson, null, 2));
        console.log(`✅ Signals JSON exported: ${signalsJson.signals.length} signals`);
        
    } catch (error) {
        console.error('❌ Error generating live feed:', error.message);
    }
}

// Exécuter si appelé directement
if (require.main === module) {
    generateLiveFeed();
}

module.exports = { generateLiveFeed };
