const axios = require('axios');

/**
 * LURKER Dune Query Runner
 * Exécute des queries existantes sur Dune
 */

const API_KEY = 'StAmNTvnKwEb7ue2Cto5IethDa3kunBj';
const BASE_URL = 'https://api.dune.com/api/v1';

const headers = {
    'X-Dune-API-Key': API_KEY,
    'Content-Type': 'application/json'
};

// Execute a query
async function runQuery(queryId, params = {}) {
    try {
        console.log(`[DUNE] Running query ${queryId}...`);
        
        // Execute
        const execRes = await axios.post(
            `${BASE_URL}/query/${queryId}/execute`,
            { query_parameters: params },
            { headers }
        );
        
        const executionId = execRes.data.execution_id;
        console.log(`[DUNE] Execution ID: ${executionId}`);
        
        // Wait for completion
        let status = 'PENDING';
        let attempts = 0;
        while (status === 'PENDING' || status === 'EXECUTING') {
            await new Promise(r => setTimeout(r, 2000));
            const statusRes = await axios.get(
                `${BASE_URL}/execution/${executionId}/status`,
                { headers }
            );
            status = statusRes.data.state;
            attempts++;
            if (attempts > 30) throw new Error('Timeout');
        }
        
        if (status !== 'QUERY_STATE_COMPLETED') {
            throw new Error(`Query failed: ${status}`);
        }
        
        // Get results
        const resultsRes = await axios.get(
            `${BASE_URL}/execution/${executionId}/results`,
            { headers }
        );
        
        return resultsRes.data;
    } catch(e) {
        console.error('[DUNE] Error:', e.response?.data?.error || e.message);
        return null;
    }
}

// Sample queries for Base
const QUERIES = {
    // New tokens on Base (last 24h) - Query ID exemple
    baseNewTokens: 1258228,
    
    // Top DEX volume on Base
    baseVolume: 1258230
};

// Main
async function main() {
    console.log('[DUNE] LURKER Dune Analytics');
    console.log('[DUNE] Testing API...\n');
    
    // Test avec une query simple (à remplacer par IDs réels)
    // const results = await runQuery(QUERIES.baseNewTokens);
    
    console.log('[DUNE] To use: find query IDs on dune.com/queries');
    console.log('[DUNE] Then: node src/duneQuery.js <query_id>');
}

// If called with query ID
const queryId = process.argv[2];
if (queryId) {
    runQuery(queryId).then(data => {
        if (data) {
            console.log('\nResults:', JSON.stringify(data.result?.rows?.slice(0, 5), null, 2));
        }
    });
} else {
    main();
}
