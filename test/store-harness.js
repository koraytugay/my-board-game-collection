// Test helper: runs a store's real checking code with lib/http served from saved responses
// (test/fixtures/responses/, recorded from live stores on 2026-10-25).
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const FIXTURES = path.join(__dirname, 'fixtures', 'responses');
const index = JSON.parse(fs.readFileSync(path.join(FIXTURES, 'index.json'), 'utf8'));
const requested = [];

function load(url) {
    // same normalization Node applies when the request is made (e.g. ' -> %27)
    const u = new URL(url);
    const key = u.origin + u.pathname + u.search;
    requested.push(key);
    const entry = index[key];
    if (!entry) return null;   // not recorded: behave like a failed fetch
    return zlib.gunzipSync(fs.readFileSync(path.join(FIXTURES, entry.file))).toString('utf8');
}

// Replace the fetchers before any store module destructures them.
const http = require('../lib/http');
http.fetchHtml = async (url) => load(url);
http.fetchJson = async (url) => {
    const text = load(url);
    if (text === null) return null;
    try { return JSON.parse(text); } catch (_) { return null; }
};

const { cleanName } = require('../lib/util');
const { getStoreConfigs } = require('../lib/store-configs');
const { fetchShopifyStore } = require('../lib/stores/shopify');
const storeConfigs = getStoreConfigs([]);

// Same dispatch as checkStore() in check-availability.js, minus the bookkeeping.
async function checkStore(storeKey, game, existingStoreData = undefined) {
    const config = storeConfigs[storeKey];
    const query = cleanName(game.name);
    if (config.type === 'shopify') {
        return fetchShopifyStore(config.baseUrl, query, game.name, config.currencySymbol || '$', config.country || 'CA', config.currency || 'CAD');
    }
    if (config.type === 'custom') {
        return config.checker(game, existingStoreData);
    }
    const targetUrl = typeof config.url === 'function' ? await config.url(game, query) : config.url;
    if (!targetUrl) return { available: false, price: null, url: null };
    const res = config.type === 'json' ? await http.fetchJson(targetUrl) : await http.fetchHtml(targetUrl);
    if (res === null) throw new Error('Fetch returned null (timeout/error)');
    return config.parser(res, game.name, targetUrl, existingStoreData);
}

module.exports = { checkStore, requested };
