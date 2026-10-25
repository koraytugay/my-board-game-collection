// Price thresholds, baseline prices and deal detection.
const { extractNumericPrice } = require('./util');

const MIN_PRICE_THRESHOLD = 5.0; // Ignore/treat items priced <= 5 as out of stock / erroneous match

function isPriceUnderThreshold(priceStr, threshold = MIN_PRICE_THRESHOLD) {
    const num = extractNumericPrice(priceStr);
    return num !== null && num <= threshold;
}

function computeDealInfo(currentPrice, currentUrl, isAvailable, existingStoreData) {
    if (!isAvailable) {
        return {
            baselinePrice: existingStoreData?.baselinePrice || currentPrice || null,
            deal: null
        };
    }

    const currNum = extractNumericPrice(currentPrice);
    if (!currNum) {
        return { baselinePrice: currentPrice || null, deal: null };
    }

    const prevPrice = existingStoreData?.price;
    const prevUrl = existingStoreData?.url;

    // If product URL changed, this is a different matched product (e.g. expansion / big box / different edition)
    // Reset baseline to the new product
    if (prevUrl && currentUrl && prevUrl !== currentUrl) {
        return { baselinePrice: currentPrice, deal: null };
    }

    let baselinePrice = existingStoreData?.baselinePrice || prevPrice || currentPrice;
    let baselineNum = extractNumericPrice(baselinePrice);

    if (!baselineNum) {
        return { baselinePrice: currentPrice, deal: null };
    }

    // Price went up: update regular baseline price
    if (currNum > baselineNum) {
        return { baselinePrice: currentPrice, deal: null };
    }

    // Calculate discount against baseline
    const discountPercent = Math.round(((baselineNum - currNum) / baselineNum) * 100);

    if (discountPercent >= 20) {
        return {
            baselinePrice,
            deal: {
                previousPrice: baselinePrice,
                discountPercent
            }
        };
    }

    // Retain baselinePrice when price drops slightly (< 20%) to prevent baseline erosion
    return { baselinePrice, deal: null };
}

module.exports = { MIN_PRICE_THRESHOLD, isPriceUnderThreshold, computeDealInfo };
