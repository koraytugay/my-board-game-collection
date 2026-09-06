// skipped-matches.js
// List of [store-name, game-name] pairs to ignore/skip during availability checks.
//
// Structure:
// An array of arrays: [[store-name, game-name], [store-name, game-name], ...]
// - store-name: Store key (e.g. 'laPioche', 'boardGameBliss') or store display name (e.g. 'La Pioche', '401 Games') - case-insensitive
// - game-name:  Game title as on BGG (e.g. "Hadrian's Wall") or BGG object ID (e.g. '304783') - case-insensitive
//
// Examples:
//   ['La Pioche', "Hadrian's Wall"]
//   ['401 Games', "Ark Nova"]

const SKIPPED_MATCHES = [
    ['La Pioche', "Hadrian's Wall"]
];

if (typeof module !== 'undefined' && module.exports) {
    module.exports = SKIPPED_MATCHES;
}
