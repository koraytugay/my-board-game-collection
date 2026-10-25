// Decides whether a store product title is the BGG game we are looking for.
const { decodeXmlEntities, cleanName } = require('./util');

const GAME_ALIASES = {
};

function stripDescriptors(str) {
    return (str || '')
        .replace(/\([^)]*\)/g, ' ')
        .replace(/\[[^\]]*\]/g, ' ')
        .replace(/[\u2013\u2014]/g, '-')
        .replace(/\b(board\s*game|card\s*game|dice\s*game|party\s*game|base\s*game|core\s*game|core\s*box|core\s*set|starter\s*set|new\s*release|pre-?order|english(\s*edition)?|french(\s*edition)?|fran[cç]ais|anglais|bilingual|multilingual|2nd\s*edition|second\s*edition|3rd\s*edition|third\s*edition|edizione(\s*(italiana|inglese|tedesca|francese|spagnola))?|gioco\s*da\s*tavolo)\b/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function normalizeTitle(str) {
    return (str || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '');
}

function isMatch(bggName, shopifyProduct) {
    if (!bggName || !shopifyProduct) return false;
    const shopifyTitle = decodeXmlEntities(shopifyProduct.title || '');
    const shopifyType = shopifyProduct.type || '';
    
    const cleanBgg = cleanName(bggName) || '';

    // 1. Check product type: filter out obvious non-game categories
    const lowerType = shopifyType.toLowerCase();
    const disallowedTypes = ['diecast', 'model', 'accessory', 'accessories', 'paint', 'sleeve', 'sleeves', 'insert', 'organizer', 'organiser', 'playmat', 'mat', 'dice', 'token', 'tokens', 'tcg', 'booster', 'singles', 'single', 'acrylic', 'miniature', 'miniatures', 'puzzle', 'puzzles'];
    if (disallowedTypes.some(type => lowerType.includes(type))) {
        return false;
    }

    // 2. Filter out keywords in Shopify title that are NOT in BGG title
    const disallowedKeywords = ['diecast', 'die-cast', '1/32', '1/24', '1/18', 'keyring', 'plush', 'action figure', 'pop! vinyl', 'insert', 'organizer', 'organiser', 'playmat', 'promo', 'paint', 'sleeves', 'token', 'coins', 'upgrade', 'expansion', 'booster', 'tcg', 'sleeved', 'sleeve-pack', 'acrylic-tokens', 'puzzle', 'puzzles', '1000pc', '1000pcs', '1000-piece', '1000 piece', 'dry erase', 'dry-erase'];
    for (const kw of disallowedKeywords) {
        if (shopifyTitle.toLowerCase().includes(kw) && !cleanBgg.toLowerCase().includes(kw)) {
            return false;
        }
    }

    const nBggClean = normalizeTitle(stripDescriptors(cleanBgg));
    const nShopifyClean = normalizeTitle(stripDescriptors(shopifyTitle));

    // 3. Exact match after stripping store descriptors
    if (nBggClean === nShopifyClean) {
        return true;
    }

    // 4. Check known game aliases
    const aliases = GAME_ALIASES[bggName] || GAME_ALIASES[cleanBgg] || [];
    for (const alias of aliases) {
        if (normalizeTitle(stripDescriptors(alias)) === nShopifyClean) {
            return true;
        }
    }

    // 5. If BGG name has a subtitle, ensure shopifyTitle contains key subtitle words
    if (cleanBgg.includes(':')) {
        const parts = cleanBgg.split(':');
        const mainTitle = normalizeTitle(stripDescriptors(parts[0]));
        const subtitle = parts[1].trim();
        const subWords = subtitle.toLowerCase().split(/\s+/).filter(w => w.length > 2);
        const hasSubtitle = subWords.some(w => shopifyTitle.toLowerCase().includes(w));
        if (!hasSubtitle) {
            return false;
        }
        if (!nShopifyClean.includes(mainTitle)) {
            return false;
        }
        if (normalizeTitle(cleanBgg) === normalizeTitle(shopifyTitle)) {
            return true;
        }
    }

    // 6. Word constraint: prevent single-word BGG titles matching multi-word products (e.g. "Blink" matching "Blink Dogs")
    const wordsBgg = nBggClean ? cleanBgg.toLowerCase().split(/\s+/).filter(Boolean) : [];
    const wordsShopify = nShopifyClean ? stripDescriptors(shopifyTitle).toLowerCase().split(/\s+/).filter(Boolean) : [];

    if (wordsBgg.length === 1 && wordsShopify.length > 1) {
        return false;
    }

    return false;
}

function findBestShopifyMatch(products, gameName) {
    if (!products || !Array.isArray(products) || products.length === 0) return null;
    const cleanBgg = cleanName(gameName);
    const nBgg = normalizeTitle(cleanBgg);
    
    // 1. Exact normalized match first
    const exact = products.find(p => normalizeTitle(cleanName(decodeXmlEntities(p.title || ''))) === nBgg);
    if (exact) return exact;

    // 2. Exact alias match
    const aliases = GAME_ALIASES[gameName] || GAME_ALIASES[cleanBgg] || [];
    for (const alias of aliases) {
        const aliasMatch = products.find(p => normalizeTitle(cleanName(decodeXmlEntities(p.title || ''))) === normalizeTitle(alias));
        if (aliasMatch) return aliasMatch;
    }
    
    // 3. isMatch filter
    return products.find(p => isMatch(gameName, p)) || null;
}

module.exports = { GAME_ALIASES, stripDescriptors, normalizeTitle, isMatch, findBestShopifyMatch };
