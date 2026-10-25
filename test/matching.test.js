// Title matching: is this store product the BGG game we want?
const test = require('node:test');
const assert = require('node:assert/strict');
const { isMatch, findBestShopifyMatch } = require('../lib/matching');

const product = (title, type = '') => ({ title, type });

// [BGG name, store title, store product type]
const SHOULD_MATCH = [
    ['Blink', 'Blink'],
    ['Blink', 'Blink Board Game'],
    ['Tiwanaku', 'TIWANAKU'],
    ["Hadrian's Wall", "HADRIAN'S WALL"],
    ["Hadrian's Wall", 'Hadrian’s Wall'],
    ['Onirim (Second Edition)', 'Onirim'],
    ['Onirim (Second Edition)', 'Onirim - Second Edition'],
    ['Onirim (Second Edition)', 'Onirim 2nd Edition'],
    ['Fugitive (Second Edition)', 'Fugitive (Second Edition)'],
    ['Joan of Arc: Orléans Draw & Write', 'Joan of Arc: Orléans - Draw &amp; Write'],
    ['Kronologic: Paris 1920', 'Kronologic: Paris 1920'],
    ['Dungeon Mayhem: Monster Madness', 'Dungeon Mayhem: Monster Madness'],
    ['Silver', 'SILVER BOARD GAME'],
    ['Coffee Roaster', 'Coffee Roaster Board Game'],
    ['Coffee Roaster', 'Coffee Roaster', 'Board Games'],
    ['Skara Brae', 'Skara Brae (English Edition)'],
    ['A Gentle Rain', 'A Gentle Rain (Hobby Edition)'],
    ['Ubongo', 'Ubongo Board Game (English)'],
    ['Witchcraft!', 'Witchcraft!'],
    ['Back to the Future: Back in Time', 'Back to the Future: Back in Time']
];

const SHOULD_NOT_MATCH = [
    // single-word titles must not match longer products
    ['Blink', 'Blink Dogs'],
    ['Silver', 'Silver Bolt (MID-258) Foil'],
    ['Ubongo', 'Ubongo Junior'],
    // trading card singles
    ['Blink', 'Blinkmoth Nexus [Darksteel]'],
    ['Illusion', 'Illusion // Reality [Apocalypse]'],
    ['The Duke', 'The Duke, Rebel Sentry [Avatar]'],
    ['Witchcraft!', 'Witchcrafter Madame Verre - MAMO-EN031 Ultra Rare'],
    // expansions and other games in the same series
    ['The Duke', "The Duke: Lord's Legacy"],
    ['Lairs', 'Lairs: Deeper Dungeons'],
    ['Lairs', 'Lairs - Kickstarter Edition + Deeper Dungeon Expansion'],
    ['Fantastic Factories', 'Fantastic Factories: Subterfuge'],
    ['Fantastic Factories: Manufactions', 'Fantastic Factories: Subterfuge'],
    ['Kronologic: Paris 1920', 'Kronologic: Cuzco 1450'],
    ['Dungeon Mayhem: Monster Madness', "Dungeon Mayhem: Battle for Baldur's Gate"],
    ['Back to the Future: Back in Time', 'Back to the Future: Dice Through Time'],
    ['Regicide Legacy', 'Regicide Legacy - Reset Box'],
    // different games that share a word
    ['Batman: The Animated Series Dice Game', 'Batman: Gotham City Strategy Game'],
    ['Rome: Fate of an Empire', 'Rome In A Day'],
    // accessories, by title or by product type
    ['Coffee Roaster', 'Coffee Roaster Card Sleeves'],
    ['Coffee Roaster', 'Coffee Roaster Insert'],
    ['Coffee Roaster', 'Coffee Roaster', 'Sleeves'],
    ['Coffee Roaster', 'Coffee Roaster', 'Accessories'],
    ['Parade', 'Parade Puzzle 1000 Piece'],
    // accessories whose descriptor is in brackets: stripping the brackets alone would leave an exact match
    ['Coffee Roaster', 'Coffee Roaster (Sleeves)'],
    ['Coffee Roaster', 'Coffee Roaster (Insert)'],
    ['Coffee Roaster', 'Coffee Roaster (Organizer)'],
    ['Ubongo', 'Ubongo [TCG]'],
    ['Ubongo', 'Ubongo (Booster)'],
    ['Ubongo', 'Ubongo (Promo)'],
    ['Ubongo', 'Ubongo (Expansion)'],
    ['Ubongo', 'Ubongo (Playmat)'],
    ['Ubongo', 'Ubongo (1000 piece puzzle)'],
    // foreign-language editions that aren't stripped as descriptors
    ['Skara Brae', 'Skara Brae - Édition française']
];

// Real listings the matcher currently misses; flip to SHOULD_MATCH once handled.
const KNOWN_MISSES = [
    ['A Gentle Rain', 'A Gentle Rain: Hobby Edition (Core Game)'],
    ['The Search for Planet X', 'Search for Planet X'],
    ['Joan of Arc: Orléans Draw & Write', 'Joan of Arc Orleans Draw and Write']
];

for (const [bgg, title, type] of SHOULD_MATCH) {
    test(`matches: "${bgg}" ~ "${title}"${type ? ` [${type}]` : ''}`, () => {
        assert.equal(isMatch(bgg, product(title, type)), true);
    });
}

for (const [bgg, title, type] of SHOULD_NOT_MATCH) {
    test(`rejects: "${bgg}" vs "${title}"${type ? ` [${type}]` : ''}`, () => {
        assert.equal(isMatch(bgg, product(title, type)), false);
    });
}

for (const [bgg, title] of KNOWN_MISSES) {
    test(`known miss: "${bgg}" ~ "${title}"`, { todo: 'matcher does not handle this yet' }, () => {
        assert.equal(isMatch(bgg, product(title)), true);
    });
}

test('findBestShopifyMatch prefers the exact title over near misses', () => {
    const pick = (game, titles) => findBestShopifyMatch(titles.map(t => product(t)), game)?.title ?? null;
    assert.equal(pick('Blink', ['Blink Dogs', 'Blinkmoth Nexus', 'Blink']), 'Blink');
    assert.equal(pick('The Duke', ["The Duke: Lord's Legacy", 'The Duke']), 'The Duke');
    assert.equal(pick('Onirim (Second Edition)', ['Onirim: The Dark Side', 'Onirim']), 'Onirim');
    assert.equal(pick('Kronologic: Paris 1920', ['Kronologic: Cuzco 1450', 'Kronologic: Paris 1920']), 'Kronologic: Paris 1920');
});

test('findBestShopifyMatch returns null when nothing matches', () => {
    assert.equal(findBestShopifyMatch([product('Silver Bolt'), product('Silver Erne')], 'Silver'), null);
    assert.equal(findBestShopifyMatch([], 'Silver'), null);
});
