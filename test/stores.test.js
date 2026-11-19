// Each store's real checking code (URL building, parsing, matching) run against pages saved
// from the live stores on 2026-10-25. Expected values are what the live run recorded.
const test = require('node:test');
const assert = require('node:assert/strict');
const { checkStore } = require('./store-harness');

const NOT_FOUND = { available: false, price: null, url: null };

// [store key, BGG id, game name, expected result]; null means the parser found no match
const CASES = [
    ['greatBoardgames', '156336', 'Onirim (Second Edition)', { available: false, price: '$27.95', url: 'https://www.greatboardgames.ca/games/onirim' }],
    ['greatBoardgames', '1197', 'Blink', null],
    // the stray "#x3D;..." fragment comes from an HTML entity decodeXmlEntities doesn't handle; the link still works
    ['cardhaus', '156336', 'Onirim (Second Edition)', { available: false, price: '$21.99', url: 'https://www.cardhaus.com/onirim/#x3D;49027f73-40ce-480b-b388-a6140bdb5bcf&search_query&#x3D;Onirim' }],
    ['meeplemart', '196526', 'Coffee Roaster', null],
    ['kbHobbies', '196526', 'Coffee Roaster', { available: false, price: '$52.99', url: 'https://www.kbhobbies.com/product/coffee-roaster/143' }],
    ['kbHobbies', '1197', 'Blink', NOT_FOUND],
    ['elevatedBoardGames', '196526', 'Coffee Roaster', { available: true, price: '$39.99', url: 'https://www.elevatedboardgames.com/product-page/coffee-roaster' }],
    ['boardgamesCa', '304783', "Hadrian's Wall", { available: true, price: '$72.95', url: 'https://boardgames.ca/products/hadrians-wall' }],
    ['boardgamesCa', '383499', 'Witchcraft!', { available: false, price: '$31.95', url: 'https://boardgames.ca/products/witchcraft' }],
    ['boardgamesCa', '1197', 'Blink', null],
    ['philibert', '16986', 'Ubongo', { available: true, price: '€23.95', url: 'https://www.philibertnet.com/en/iello/132888-ubongo-3701551702395.html' }],
    ['philibert', '302388', 'Back to the Future: Back in Time', { available: false, price: '€34.95', url: 'https://www.philibertnet.com/en/funko-games/136888-back-to-the-future-back-in-time-889698689076.html' }],
    ['philibert', '1197', 'Blink', NOT_FOUND],
    ['bggMarket', '1197', 'Blink', null],
    // Shopify stores
    ['boardGameBliss', '16986', 'Ubongo', { available: false, price: '$39.95', url: 'https://www.boardgamebliss.com/products/ubongo-french?_pos=1&_psq=Ubongo&_psid=f9b48adfd&_ss=e' }],
    ['boardGameBliss', '1197', 'Blink', { available: false, price: '$7.95', url: 'https://www.boardgamebliss.com/products/blink-1?_pos=1&_psq=Blink&_psid=4c23e4ec7&_ss=e' }],
    ['zatu', '16986', 'Ubongo', { available: true, price: '£23.95', url: 'https://zatu.com/products/ubongo?_pos=1&_psq=Ubongo&_psid=54a0c849a&_ss=e' }],
    ['zatu', '304783', "Hadrian's Wall", { available: false, price: '£49.20', url: 'https://zatu.com/products/hadrians-wall?_pos=2&_psq=Hadrian%27s+Wall&_psid=c1f21ccb1&_ss=e' }],
    ['asDesJeux', '244995', 'Illusion', { available: true, price: '$22.99', url: 'https://www.asdesjeux.com/products/illusion-vf?_pos=1&_psq=Illusion&_psid=cb2789d47&_ss=e' }],
];

for (const [store, objectId, name, expected] of CASES) {
    test(`${store}: ${name}`, async () => {
        const result = await checkStore(store, { objectId, name });
        if (expected === null) {
            assert.equal(result, null);
        } else {
            assert.deepEqual({ available: Boolean(result.available), price: result.price ?? null, url: result.url ?? null }, expected);
        }
    });
}

test('philibert: if the stock check fails, the check fails instead of reporting out of stock', async () => {
    // the Coffee Roaster search page is saved, but its stock API response deliberately is not
    await assert.rejects(checkStore('philibert', { objectId: '196526', name: 'Coffee Roaster' }), /stock lookup failed/);
});

test('bggMarket: only Canadian sellers count', () => {
    const { getStoreConfigs } = require('../lib/store-configs');
    const listing = (seller, code, price) => ({ price, currency: 'CAD', currencysymbol: 'C$', itemlocation_code: code, linkeduser: { username: seller }, prettycondition: 'New', producthref: `/market/product/${seller}` });
    const res = { products: [listing('usSeller', 'US', '10.00'), listing('caSeller', 'CA', '30.00')] };
    const result = getStoreConfigs([]).bggMarket.parser(res, 'Ubongo', '', undefined);
    assert.deepEqual(result.listings.map(l => l.seller), ['caSeller']);
});

// J&J Cards finds product URLs through a 5 MB sitemap, so its product-page parser is tested directly.
test('jjCards: product page parser reads price and stock', async () => {
    const http = require('../lib/http');
    const { parseJJCardsProduct } = require('../lib/stores/jj-cards');
    const inStock = 'https://shop.jjcards.com/Silver-Board-Game_p_13995.html';
    const outOfStock = 'https://shop.jjcards.com/Ubongo_p_1249.html';
    assert.deepEqual(parseJJCardsProduct(await http.fetchHtml(inStock), 'Silver', inStock), { available: true, price: '$26.99', url: inStock });
    assert.deepEqual(parseJJCardsProduct(await http.fetchHtml(outOfStock), 'Ubongo', outOfStock), { available: false, price: '$39.99', url: outOfStock });
});

test('bggMarket: Ubongo lists Canadian sellers cheapest first', async () => {
    const result = await checkStore('bggMarket', { objectId: '16986', name: 'Ubongo' });
    assert.equal(result.available, true);
    assert.equal(result.price, 'C$20.00 CAD');
    assert.deepEqual(result.listings.map(({ firstSeen, ...listing }) => listing), [
        { price: 'C$20.00 CAD', seller: 'haustor', condition: 'Like New', url: 'https://boardgamegeek.com/market/product/4116336', ignored: false },
        { price: 'C$39.00 CAD', seller: 'JamesJakeJones', condition: 'Very Good', url: 'https://boardgamegeek.com/market/product/3934656', ignored: false }
    ]);
});

test('bggMarket: skipped sellers are left out', async () => {
    const { getStoreConfigs } = require('../lib/store-configs');
    const http = require('../lib/http');
    const config = getStoreConfigs(['HAUSTOR']).bggMarket;  // case-insensitive
    const url = config.url({ objectId: '16986', name: 'Ubongo' });
    const result = config.parser(await http.fetchJson(url), 'Ubongo', url, undefined);
    assert.deepEqual(result.listings.map(l => l.seller), ['JamesJakeJones']);
    assert.equal(result.price, 'C$39.00 CAD');
});
