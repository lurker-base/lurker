const axios = require('axios');
const fs = require('fs');
const path = require('path');

/**
 * LURKER Dune Analytics Uploader
 * Envoie les signaux vers Dune pour dashboard public
 */

const CONFIG = {
    apiKey: 'StAmNTvnKwEb7ue2Cto5IethDa3kunBj',
    baseUrl: 'https://api.dune.com/api/v1',
    namespace: 'lurker', // Notre espace de données
    dataFile: path.join(__dirname, '../data/clankerLiveSignals.json')
};

// Dune API client
class DuneAPI {
    constructor(apiKey) {
        this.apiKey = apiKey;
        this.headers = {
            'X-Dune-API-Key': apiKey,
            'Content-Type': 'application/json'
        };
    }

    async createTable(tableName, schema) {
        try {
            const res = await axios.post(
                `${CONFIG.baseUrl}/table/${CONFIG.namespace}/${tableName}/create`,
                { schema },
                { headers: this.headers }
            );
            console.log(`[DUNE] Table ${tableName} created`);
            return res.data;
        } catch(e) {
            if (e.response?.status === 409) {
                console.log(`[DUNE] Table ${tableName} already exists`);
                return null;
            }
            throw e;
        }
    }

    async insertData(tableName, data) {
        try {
            const res = await axios.post(
                `${CONFIG.baseUrl}/table/${CONFIG.namespace}/${tableName}/insert`,
                { data },
                { headers: this.headers }
            );
            console.log(`[DUNE] Inserted ${data.length} rows into ${tableName}`);
            return res.data;
        } catch(e) {
            console.error(`[DUNE] Insert failed:`, e.message);
            throw e;
        }
    }

    async executeQuery(queryId, params = {}) {
        try {
            const res = await axios.post(
                `${CONFIG.baseUrl}/query/${queryId}/execute`,
                { query_parameters: params },
                { headers: this.headers }
            );
            return res.data;
        } catch(e) {
            console.error(`[DUNE] Query failed:`, e.message);
            throw e;
        }
    }

    async getResults(executionId) {
        try {
            const res = await axios.get(
                `${CONFIG.baseUrl}/execution/${executionId}/results`,
                { headers: this.headers }
            );
            return res.data;
        } catch(e) {
            console.error(`[DUNE] Get results failed:`, e.message);
            throw e;
        }
    }
}

// Upload signals to Dune
async function uploadSignals() {
    const dune = new DuneAPI(CONFIG.apiKey);

    // Load our signals
    let signals = [];
    try {
        if (fs.existsSync(CONFIG.dataFile)) {
            signals = JSON.parse(fs.readFileSync(CONFIG.dataFile, 'utf8'));
        }
    } catch(e) {
        console.error('[DUNE] Failed to load signals:', e.message);
        return;
    }

    if (signals.length === 0) {
        console.log('[DUNE] No signals to upload');
        return;
    }

    // Prepare data for Dune
    const tableData = signals.slice(0, 500).map(s => ({
        symbol: s.symbol || 'UNKNOWN',
        name: s.name || '',
        contract_address: s.contract_address || s.address || '',
        factory_address: s.factory_address || '',
        pool_address: s.pool_address || '',
        tx_hash: s.tx_hash || '',
        deployed_at: s.deployed_at || new Date().toISOString(),
        age_seconds: s.ageSeconds || Math.floor((s.age || 0) * 60),
        score: s.score || 0,
        detected_at: new Date(s.detectedAt || Date.now()).toISOString()
    }));

    // Create table schema
    const schema = [
        { name: 'symbol', type: 'varchar' },
        { name: 'name', type: 'varchar' },
        { name: 'contract_address', type: 'varchar' },
        { name: 'factory_address', type: 'varchar' },
        { name: 'pool_address', type: 'varchar' },
        { name: 'tx_hash', type: 'varchar' },
        { name: 'deployed_at', type: 'timestamp' },
        { name: 'age_seconds', type: 'integer' },
        { name: 'score', type: 'integer' },
        { name: 'detected_at', type: 'timestamp' }
    ];

    try {
        // Create table if not exists
        await dune.createTable('signals', schema);

        // Insert data
        await dune.insertData('signals', tableData);

        console.log(`[DUNE] Successfully uploaded ${tableData.length} signals`);
    } catch(e) {
        console.error('[DUNE] Upload failed:', e.message);
    }
}

// Run
console.log('[DUNE] LURKER Analytics Uploader');
console.log('[DUNE] Uploading signals to Dune...\n');

uploadSignals();
