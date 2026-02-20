const axios = require('axios');

/**
 * LURKER Dune Analyzer
 * Enrichit les signaux avec les données Dune
 * 
 * Usage: node src/duneAnalyzer.js <token_address>
 */

const API_KEY = 'StAmNTvnKwEb7ue2Cto5IethDa3kunBj';
const BASE_URL = 'https://api.dune.com/api/v1';

const headers = {
    'X-Dune-API-Key': API_KEY,
    'Content-Type': 'application/json'
};

// Execute une query existante avec des paramètres
async function runQuery(queryId, params = {}) {
    try {
        console.log(`[DUNE] Executing query ${queryId}...`);
        
        // Lancer l'exécution
        const execRes = await axios.post(
            `${BASE_URL}/query/${queryId}/execute`,
            { query_parameters: params },
            { headers, timeout: 30000 }
        );
        
        const executionId = execRes.data.execution_id;
        console.log(`[DUNE] Execution ID: ${executionId}`);
        
        // Attendre la completion
        let status = 'PENDING';
        let attempts = 0;
        while ((status === 'PENDING' || status === 'EXECUTING') && attempts < 30) {
            await new Promise(r => setTimeout(r, 2000));
            const statusRes = await axios.get(
                `${BASE_URL}/execution/${executionId}/status`,
                { headers }
            );
            status = statusRes.data.state;
            process.stdout.write('.');
            attempts++;
        }
        console.log('');
        
        if (status !== 'QUERY_STATE_COMPLETED') {
            console.error(`[DUNE] Query failed with status: ${status}`);
            return null;
        }
        
        // Récupérer les résultats
        const resultsRes = await axios.get(
            `${BASE_URL}/execution/${executionId}/results`,
            { headers }
        );
        
        return resultsRes.data.result?.rows || [];
        
    } catch(e) {
        console.error('[DUNE] Error:', e.response?.data?.error || e.message);
        return null;
    }
}

// Recherche de queries existantes sur Base
async function findBaseQueries() {
    try {
        const res = await axios.get(`${BASE_URL}/query`, {
            headers,
            params: { limit: 20, search: 'base token' }
        });
        
        console.log('[DUNE] Available queries:');
        (res.data.queries || []).forEach(q => {
            console.log(`  - ${q.query_id}: ${q.name}`);
        });
        
        return res.data.queries || [];
    } catch(e) {
        console.error('[DUNE] Search error:', e.message);
        return [];
    }
}

// Analyse rapide d'un token (sans query custom)
async function quickAnalyze(tokenAddress) {
    console.log(`\n[DUNE] Analyzing ${tokenAddress}`);
    console.log('[DUNE] Note: Pour analyse complète, créer queries sur dune.com\n');
    
    // Pour l'instant, retourne structure vide
    // On créera les queries ensuite
    return {
        tokenAddress,
        analyzedAt: new Date().toISOString(),
        status: 'pending_queries',
        message: 'Créer queries paramétrées sur dune.com pour analyse complète'
    };
}

// Main
async function main() {
    const tokenAddress = process.argv[2];
    
    console.log('[DUNE] LURKER Token Analyzer');
    console.log('[DUNE] API Key:', API_KEY.slice(0, 10) + '...\n');
    
    if (!tokenAddress) {
        console.log('Usage: node src/duneAnalyzer.js <token_address>');
        console.log('\nExemples de queries à créer sur dune.com:');
        console.log('1. Query "Token Volume Base" avec param token_address');
        console.log('2. Query "Token Holders Base" avec param token_address');
        console.log('3. Query "Wallet History" avec param wallet_address');
        return;
    }
    
    // Tester connexion
    const queries = await findBaseQueries();
    
    if (queries.length > 0) {
        // Utiliser première query disponible pour test
        const testQuery = queries[0];
        console.log(`\n[DUNE] Testing with query ${testQuery.query_id}...`);
        
        const results = await runQuery(testQuery.query_id, { 
            token_address: tokenAddress 
        });
        
        if (results) {
            console.log('[DUNE] Results:', JSON.stringify(results.slice(0, 3), null, 2));
        }
    } else {
        console.log('[DUNE] No queries found. Create queries on dune.com first.');
    }
    
    // Analyse basique
    const analysis = await quickAnalyze(tokenAddress);
    console.log('\n[DUNE] Analysis:', analysis);
}

main();
