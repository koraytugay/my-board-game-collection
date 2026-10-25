// How each store in store-registry.js is checked.
const { STORE_REGISTRY } = require('../store-registry');
const { KNOWN_SHOPIFY_HOSTS } = require('./http');
const { parseGreatBoardgames } = require('./stores/great-boardgames');
const { parseMiniatureMarket } = require('./stores/miniature-market');
const { parseCardhaus } = require('./stores/cardhaus');
const { parseMeeplemart } = require('./stores/meeplemart');
const { checkPhilibertStock } = require('./stores/philibert');
const { checkChaosCardsStock } = require('./stores/chaos-cards');
const { fetchKbHobbies } = require('./stores/kb-hobbies');
const { getJJCardsProductUrl, parseJJCardsProduct } = require('./stores/jj-cards');
const { parseBoardgamesCa } = require('./stores/boardgames-ca');
const { parseBggMarket } = require('./stores/bgg-market');
const { getElevatedBoardGamesProductUrl, parseElevatedBoardGames } = require('./stores/elevated-board-games');

// Checkers for stores whose registry platform is 'custom' (everything except generic Shopify).
function getCustomStoreConfigs(skippedSellers = []) {
    return {
        greatBoardgames: {
            type: 'html',
            url: (game, query) => `https://www.greatboardgames.ca/search?q=${encodeURIComponent(query)}`,
            parser: (html, gameName) => {
                const match = parseGreatBoardgames(html, gameName);
                if (match) {
                    return {
                        available: match.available,
                        price: match.price,
                        url: match.url
                    };
                }
                return null;
            }
        },
        meeplemart: {
            type: 'html',
            url: (game, query) => `https://www.meeplemart.com/store/Search.aspx?SearchTerms=${encodeURIComponent(query)}`,
            parser: (html, gameName) => {
                const match = parseMeeplemart(html, gameName);
                if (match) {
                    return {
                        available: match.available,
                        price: match.price,
                        url: match.url
                    };
                }
                return null;
            }
        },
        kbHobbies: {
            type: 'custom',
            checker: async (game) => await fetchKbHobbies(game.name)
        },
        miniatureMarket: {
            type: 'html',
            url: (game, query) => `https://www.miniaturemarket.com/search?search=${encodeURIComponent(query)}`,
            parser: (html, gameName) => {
                const match = parseMiniatureMarket(html, gameName);
                if (match) {
                    return {
                        available: match.available,
                        price: match.price,
                        url: match.url
                    };
                }
                return null;
            }
        },
        cardhaus: {
            type: 'html',
            url: (game, query) => `https://www.cardhaus.com/search.php?search_query=${encodeURIComponent(query)}&setCurrencyId=1`,
            parser: (html, gameName) => {
                const match = parseCardhaus(html, gameName);
                if (match) {
                    return {
                        available: match.available,
                        price: match.price,
                        url: match.url
                    };
                }
                return null;
            }
        },
        amazonCa: {
            type: 'puppeteer',
            url: (game) => `https://www.amazon.ca/s?k=${encodeURIComponent(game.name + " board game")}`,
            parser: null
        },
        jjCards: {
            type: 'html',
            url: async (game) => await getJJCardsProductUrl(game.name),
            parser: (html, gameName, targetUrl) => parseJJCardsProduct(html, gameName, targetUrl)
        },
        boardgamesCa: {
            type: 'json',
            url: (game, query) => `https://app.ecwid.com/api/v3/122261030/products?keyword=${encodeURIComponent(query)}&token=public_w37fvtk2kUVuY6X7N2TdhZFLqVLKs68j`,
            parser: (res, gameName) => parseBoardgamesCa(res, gameName)
        },
        elevatedBoardGames: {
            type: 'html',
            url: async (game) => await getElevatedBoardGamesProductUrl(game.name),
            parser: (html, gameName, targetUrl) => parseElevatedBoardGames(html, gameName, targetUrl)
        },
        chaosCards: {
            type: 'custom',
            checker: async (game, existingStoreData) => {
                return await checkChaosCardsStock(game.name);
            }
        },
        philibert: {
            type: 'custom',
            checker: async (game, existingStoreData) => {
                return await checkPhilibertStock(game.name);
            }
        },
        bggMarket: {
            type: 'json',
            url: (game) => `https://api.geekdo.com/api/market/products?ajax=1&browsetype=browse&country=CA&marketdomain=boardgame&nosession=1&objectid=${game.objectId}&objecttype=thing&pageid=1&productstate=active&stock=instock`,
            parser: (res, gameName, targetUrl, existingStoreData) => parseBggMarket(res, gameName, targetUrl, existingStoreData, skippedSellers)
        }
    };
}

const CURRENCY_SYMBOLS = { CAD: '$', USD: '$', GBP: '£', EUR: '€' };

// Builds the config for every store in store-registry.js, in registry order.
function getStoreConfigs(skippedSellers = []) {
    const customConfigs = getCustomStoreConfigs(skippedSellers);
    const configs = {};
    for (const store of STORE_REGISTRY) {
        if (store.platform === 'shopify') {
            configs[store.key] = {
                type: 'shopify',
                baseUrl: store.shopifyUrl || store.url,
                currencySymbol: CURRENCY_SYMBOLS[store.currency],
                country: store.country,
                currency: store.currency
            };
        } else if (customConfigs[store.key]) {
            configs[store.key] = customConfigs[store.key];
        } else {
            throw new Error(`Store "${store.key}" is marked custom in store-registry.js but has no checker in getCustomStoreConfigs()`);
        }
    }
    for (const key of Object.keys(customConfigs)) {
        if (!configs[key]) {
            throw new Error(`Checker "${key}" in getCustomStoreConfigs() has no matching custom entry in store-registry.js`);
        }
    }
    return configs;
}

// Populate KNOWN_SHOPIFY_HOSTS dynamically from store configurations
try {
    const initialConfigs = getStoreConfigs();
    for (const config of Object.values(initialConfigs)) {
        if (config.type === 'shopify' && config.baseUrl) {
            try {
                KNOWN_SHOPIFY_HOSTS.add(new URL(config.baseUrl).hostname);
            } catch (_) {}
        }
    }
} catch (_) {}

module.exports = { getStoreConfigs };
