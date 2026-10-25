// Baseline prices and deal detection (drives the deal badges and alert emails).
const test = require('node:test');
const assert = require('node:assert/strict');
const { computeDealInfo, isPriceUnderThreshold } = require('../lib/deals');

const URL_A = 'https://store.example/products/game';

test('first sighting sets the baseline, no deal', () => {
    assert.deepEqual(computeDealInfo('$50.00', URL_A, true, undefined), { baselinePrice: '$50.00', deal: null });
});

test('a drop of 20% or more from the baseline is a deal', () => {
    const existing = { price: '$50.00', baselinePrice: '$50.00', url: URL_A };
    assert.deepEqual(computeDealInfo('$40.00', URL_A, true, existing), {
        baselinePrice: '$50.00',
        deal: { previousPrice: '$50.00', discountPercent: 20 }
    });
});

test('a smaller drop keeps the old baseline so it cannot erode', () => {
    const existing = { price: '$50.00', baselinePrice: '$50.00', url: URL_A };
    assert.deepEqual(computeDealInfo('$45.00', URL_A, true, existing), { baselinePrice: '$50.00', deal: null });
});

test('a price increase raises the baseline', () => {
    const existing = { price: '$50.00', baselinePrice: '$50.00', url: URL_A };
    assert.deepEqual(computeDealInfo('$55.00', URL_A, true, existing), { baselinePrice: '$55.00', deal: null });
});

test('a different product URL resets the baseline', () => {
    const existing = { price: '$80.00', baselinePrice: '$80.00', url: URL_A };
    assert.deepEqual(computeDealInfo('$40.00', URL_A + '-big-box', true, existing), { baselinePrice: '$40.00', deal: null });
});

test('out of stock keeps the existing baseline', () => {
    const existing = { price: '$40.00', baselinePrice: '$50.00', url: URL_A };
    assert.deepEqual(computeDealInfo('$40.00', URL_A, false, existing), { baselinePrice: '$50.00', deal: null });
});

test('prices of $5 or less are treated as bad matches', () => {
    assert.equal(isPriceUnderThreshold('$5.00'), true);
    assert.equal(isPriceUnderThreshold('$0.38'), true);
    assert.equal(isPriceUnderThreshold('$5.01'), false);
    assert.equal(isPriceUnderThreshold(null), false);
});
