#!/usr/bin/env node
/**
 * Live Signals Generator - Utilise le flux CIO pour les signals en temps réel
 * Remplace live_feed.json par les données CIO avec proper filtering
 */
const fs = require('fs');
const path = require('path');

const CIO_FEED_PATH = path.join(__dirname, '..', 'signals', 'cio_feed.json');
const LIFECYCLE_FEED_PATH = path.join(__dirname, '..', 'signals', 'lifecycle_feed.json');
const LIVE_FEED_PATH = path.join(__dirname, '..', 'signals', 'live_feed.json');

// Minimum volume threshold for display (in USD)
const MIN_VOLUME_1H = 100;  // $100 minimum in last hour
const MAX_SIGNALS = 20;     // Max signals to show

function generateLiveFeed() {
    try {
        // Lire le flux CIO
        const cioData = JSON.parse(fs.readFileSync(CIO_FEED_PATH, 'utf8'));
        
        // Transformer les données CIO en format Live avec filtrage
        const liveFeed = {
            meta: {
                updated_at: new Date().toISOString(),
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
                
                liveFeed.signals.push({
                    kind: 'LURKER_SIGNAL',
                    status: 'active',
                    ts_utc: candidate.timestamps?.token_first_seen || candidate.timestamps?.pair_created_at || new Date().toISOString(),
                    chain: 'base',
                    token: {
                        name: candidate.token.name,
                        symbol: '$' + candidate.token.symbol.toUpperCase(),
                        address: candidate.token.address
                    },
                    scores: {
                        confidence: candidate.scores?.cio_score || 0,
                        rarity: ageHours < 2 ? 'new' : ageHours < 24 ? 'fresh' : 'mature',
                        risk: candidate.risk_level || 'unknown'
                    },
                    metrics: {
                        price_usd: candidate.metrics?.price_usd || 0,
                        mcap_usd: 0,
                        liq_usd: candidate.metrics?.liq_usd || 0,
                        vol_1h_usd: candidate.metrics?.vol_1h_usd || 0,
                        vol_5m_usd: candidate.metrics?.vol_5m_usd || 0
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
        
    } catch (error) {
        console.error('❌ Error generating live feed:', error.message);
    }
}

// Exécuter si appelé directement
if (require.main === module) {
    generateLiveFeed();
}

module.exports = { generateLiveFeed };
