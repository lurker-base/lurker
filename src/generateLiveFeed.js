#!/usr/bin/env node
/**
 * Live Signals Generator - Utilise le flux CIO pour les signals en temps réel
 * Remplace live_feed.json par les données CIO
 */
const fs = require('fs');
const path = require('path');

const CIO_FEED_PATH = path.join(__dirname, '..', 'signals', 'cio_feed.json');
const LIVE_FEED_PATH = path.join(__dirname, '..', 'signals', 'live_feed.json');

function generateLiveFeed() {
    try {
        // Lire le flux CIO
        const cioData = JSON.parse(fs.readFileSync(CIO_FEED_PATH, 'utf8'));
        
        // Transformer les données CIO en format Live
        const liveFeed = {
            meta: {
                updated_at: new Date().toISOString(),
                source: 'cio',
                chain: 'base',
                count: cioData.candidates ? cioData.candidates.length : 0,
                errors: []
            },
            signals: []
        };
        
        if (cioData.candidates && cioData.candidates.length > 0) {
            for (const candidate of cioData.candidates) {
                liveFeed.signals.push({
                    kind: 'LURKER_SIGNAL',
                    status: 'active',
                    ts_utc: candidate.detected_at,
                    chain: 'base',
                    token: {
                        name: candidate.token.name,
                        symbol: '$' + candidate.token.symbol.toUpperCase(),
                        address: candidate.token.address
                    },
                    scores: {
                        confidence: candidate.score,
                        rarity: 'new',
                        risk: candidate.risk.level
                    },
                    metrics: {
                        price_usd: candidate.metrics.price_usd || 0,
                        mcap_usd: 0,
                        liq_usd: candidate.metrics.liq_usd,
                        vol_24h_usd: candidate.metrics.vol_24h_usd
                    },
                    dex: 'geckoterminal',
                    pair_address: candidate.token.address,
                    scanner: 'cio'
                });
            }
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
