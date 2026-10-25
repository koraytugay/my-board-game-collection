// Applies skipped-matches.js rules (store + game pairs to ignore).
const { buildStoreKeyAliases } = require('../store-registry');
const { decodeXmlEntities } = require('./util');

const STORE_KEY_ALIASES = buildStoreKeyAliases();

function resolveStoreKey(storeInput) {
    if (!storeInput) return '';
    const clean = String(storeInput).toLowerCase().replace(/[^a-z0-9]/g, '');
    return STORE_KEY_ALIASES[clean] || clean;
}

function normalizeGameTitle(str) {
    if (!str) return '';
    return decodeXmlEntities(String(str))
        .toLowerCase()
        .replace(/['’`]/g, '')
        .replace(/[^a-z0-9]/g, '');
}

function isMatchSkipped(skippedList, storeKey, gameName, gameObjectId = null) {
    if (!Array.isArray(skippedList) || skippedList.length === 0) return false;
    const resolvedTargetStore = resolveStoreKey(storeKey);
    const normGame = normalizeGameTitle(gameName);
    const idStr = gameObjectId ? String(gameObjectId).trim() : null;

    for (const item of skippedList) {
        let s = null;
        let g = null;
        if (Array.isArray(item)) {
            s = item[0];
            g = item[1];
        } else if (item && typeof item === 'object') {
            s = item.store || item.storeKey || item.storeName;
            g = item.game || item.gameName || item.name || item.objectId;
        }
        if (!s || !g) continue;

        const resolvedEntryStore = resolveStoreKey(s);
        if (resolvedEntryStore.toLowerCase() !== resolvedTargetStore.toLowerCase()) {
            continue;
        }

        if (idStr && String(g).trim() === idStr) {
            return true;
        }

        if (normalizeGameTitle(g) === normGame) {
            return true;
        }
    }
    return false;
}

module.exports = { STORE_KEY_ALIASES, resolveStoreKey, normalizeGameTitle, isMatchSkipped };
