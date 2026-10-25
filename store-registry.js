// Single source of truth for every store in the pipeline, the website and the alert emails.
// Loaded by the browser via <script src="store-registry.js"> (before api.js) and by Node via require().
//
// Fields:
//   key        - id used in availability JSON files
//   name, flag - display name and flag; the site shows "<flag> <name>" unless `label` is set
//   shortLabel - optional shorter label for the game details popup
//   url        - store homepage (used for links on the site)
//   currency   - CAD, USD, GBP or EUR; drives conversion to CAD
//   platform   - "shopify" stores are checked generically via /search/suggest.json using `country`
//                (and `shopifyUrl` if it differs from `url`); "custom" stores need a checker in
//                getCustomStoreConfigs() in check-availability.js
//   aliases    - extra names accepted in skipped-matches.js (lowercase, letters/digits only)
const STORE_REGISTRY = [
    { key: 'boardGameBliss', name: 'BoardGameBliss', flag: '🇨🇦', url: 'https://www.boardgamebliss.com', currency: 'CAD', platform: 'shopify', country: 'CA', aliases: ['bgb', 'boardgameblisscom'] },
    { key: 'fourZeroOneGames', name: '401 Games', flag: '🇨🇦', url: 'https://store.401games.ca', currency: 'CAD', platform: 'shopify', country: 'CA', aliases: ['401', '401games', 'store401gamesca'] },
    { key: 'lvlUpGames', name: 'LVLUP Games', flag: '🇨🇦', url: 'https://www.lvlupgames.ca', currency: 'CAD', platform: 'shopify', country: 'CA', aliases: ['lvlup', 'lvlupgamesca'] },
    { key: 'asDesJeux', name: 'As des Jeux', flag: '🇨🇦', url: 'https://www.asdesjeux.com', currency: 'CAD', platform: 'shopify', country: 'CA', aliases: ['asdesjeuxcom'] },
    { key: 'greatBoardgames', name: 'Great Boardgames', flag: '🇨🇦', url: 'https://www.greatboardgames.ca', currency: 'CAD', platform: 'custom', aliases: ['gbg', 'greatboardgamesca'] },
    { key: 'meeplemart', name: 'Meeplemart', flag: '🇨🇦', url: 'https://www.meeplemart.com', currency: 'CAD', platform: 'custom', aliases: ['meeplemartcom'] },
    { key: 'kbHobbies', name: 'KB Hobbies', flag: '🇨🇦', url: 'https://kbhobbies.com', currency: 'CAD', platform: 'custom', aliases: ['kbhobbiescom'] },
    { key: 'miniatureMarket', name: 'Miniature Market', flag: '🇺🇸', url: 'https://www.miniaturemarket.com', currency: 'USD', platform: 'custom', aliases: ['miniaturemarketcom'] },
    { key: 'cardhaus', name: 'Cardhaus Games', flag: '🇺🇸', url: 'https://www.cardhaus.com', currency: 'USD', platform: 'custom', aliases: ['cardhausgames', 'cardhauscom'] },
    { key: 'theGameSteward', name: 'The Game Steward', flag: '🇺🇸', url: 'https://thegamesteward.com', currency: 'USD', platform: 'shopify', country: 'US', aliases: ['gamesteward', 'thegamestewardcom'] },
    { key: 'amazonCa', name: 'Amazon.ca', flag: '🇨🇦', url: 'https://www.amazon.ca', currency: 'CAD', platform: 'custom', aliases: ['amazon'] },
    { key: 'woodForSheep', name: 'Wood for Sheep', flag: '🇨🇦', url: 'https://www.woodforsheep.ca', currency: 'CAD', platform: 'shopify', country: 'CA', aliases: ['woodforsheepca'] },
    { key: 'jjCards', name: 'J&J Cards', flag: '🇨🇦', url: 'https://jjcards.com', currency: 'CAD', platform: 'custom', aliases: ['jjcardscom'] },
    { key: 'boardgamesCa', name: 'Boardgames.ca', flag: '🇨🇦', url: 'https://boardgames.ca', currency: 'CAD', platform: 'custom', aliases: ['boardgames'] },
    { key: 'screenFreeGames', name: 'Screen Free Games', flag: '🇨🇦', url: 'https://screenfreegames.com', currency: 'CAD', platform: 'shopify', country: 'CA', shortLabel: '🇨🇦 Screen Free', aliases: ['screenfreegamescom'] },
    { key: 'allSystemsGo', name: 'All Systems Go', flag: '🇨🇦', url: 'https://allsystemsgo.games', currency: 'CAD', platform: 'shopify', country: 'CA', aliases: ['allsystemsgogames'] },
    { key: 'tabletopCafe', name: 'Tabletop Cafe', flag: '🇨🇦', url: 'https://www.tabletopcafe.ca', currency: 'CAD', platform: 'shopify', country: 'CA', aliases: ['tabletopcafeca'] },
    { key: 'elevatedBoardGames', name: 'Elevated Board Games', flag: '🇨🇦', url: 'https://elevatedboardgames.com', currency: 'CAD', platform: 'custom', shortLabel: '🇨🇦 Elevated BG', aliases: ['elevatedboardgamescom'] },
    { key: 'diceHollow', name: 'Dice Hollow', flag: '🇨🇦', url: 'https://www.dicehollow.com', currency: 'CAD', platform: 'shopify', country: 'CA', aliases: ['dicehollowcom'] },
    { key: 'laPioche', name: 'La Pioche', flag: '🇨🇦', url: 'https://boutiquelapioche.com', currency: 'CAD', platform: 'shopify', country: 'CA', aliases: ['boutiquelapioche', 'boutiquelapiochecom'] },
    { key: 'alwaysGames', name: 'Always Games', flag: '🇨🇦', url: 'https://alwaysgames.ca', currency: 'CAD', platform: 'shopify', country: 'CA', aliases: ['alwaysgamesca'] },
    { key: 'legendsWarehouse', name: 'Legends Warehouse', flag: '🇨🇦', url: 'https://legendswarehouse.ca', currency: 'CAD', platform: 'shopify', country: 'CA', aliases: ['legendswarehouseca'] },
    { key: 'boardGameBandit', name: 'Board Game Bandit', flag: '🇨🇦', url: 'https://boardgamebandit.ca', currency: 'CAD', platform: 'shopify', country: 'CA', aliases: ['boardgamebanditca'] },
    { key: 'zatu', name: 'Zatu Games', flag: '🇬🇧', url: 'https://zatu.com', currency: 'GBP', platform: 'shopify', country: 'GB', aliases: ['zatugames', 'zatucom'] },
    { key: 'chaosCards', name: 'Chaos Cards', flag: '🇬🇧', url: 'https://www.chaoscards.co.uk', currency: 'GBP', platform: 'custom', aliases: ['chaoscardsuk', 'chaoscardsnet'] },
    { key: 'philibert', name: 'Philibert', flag: '🇫🇷', url: 'https://www.philibertnet.com', currency: 'EUR', platform: 'custom', aliases: ['philibertnet'] },
    { key: 'bggMarket', name: 'BGG Market', flag: '🏷️', url: 'https://boardgamegeek.com/market', currency: 'CAD', platform: 'custom', label: 'BGG Market', aliases: ['bgg'] }
];

function getStoreLabel(store) {
    return store.label || `${store.flag} ${store.name}`;
}

// Maps a normalized store name (lowercase, letters/digits only) to its store key.
function buildStoreKeyAliases() {
    const aliases = {};
    for (const store of STORE_REGISTRY) {
        aliases[store.key.toLowerCase()] = store.key;
        for (const alias of store.aliases) {
            aliases[alias] = store.key;
        }
    }
    return aliases;
}

if (typeof module !== 'undefined') {
    module.exports = { STORE_REGISTRY, getStoreLabel, buildStoreKeyAliases };
}
