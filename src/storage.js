const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, '../data/signals.json');

// Ensure data directory exists
function ensureDataDir() {
    const dataDir = path.dirname(DATA_FILE);
    if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
    }
}

// Load signals from JSON file
function loadSignals() {
    ensureDataDir();
    if (!fs.existsSync(DATA_FILE)) {
        return { signals: [], patterns: [], lastBlock: 0 };
    }
    try {
        return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    } catch (e) {
        return { signals: [], patterns: [], lastBlock: 0 };
    }
}

// Save signals to JSON file
function saveSignals(data) {
    ensureDataDir();
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

module.exports = { loadSignals, saveSignals, DATA_FILE };
