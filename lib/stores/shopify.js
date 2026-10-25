// Stock checking for shopify.
const { sleep, cleanName } = require('../util');
const { fetchJson } = require('../http');
const { GAME_ALIASES, findBestShopifyMatch } = require('../matching');

async function fetchShopifyStore(baseUrl, query, gameName, currencySymbol = '$', country = 'CA', currency = 'CAD') {
    const queries = [query];
    const aliases = GAME_ALIASES[gameName] || GAME_ALIASES[cleanName(gameName)] || [];
    for (const a of aliases) {
        if (!queries.includes(a)) queries.push(a);
    }

    let hadSuccessfulResponse = false;
    const countryParam = country ? `&country=${encodeURIComponent(country)}` : '';
    const customHeaders = {};
    if (country && currency) {
        customHeaders['Cookie'] = `localization=${country}; cart_currency=${currency}`;
    }

    for (let qi = 0; qi < queries.length; qi++) {
        if (qi > 0) {
            await sleep(500);
        }
        const q = queries[qi];
        const suggestUrl = `${baseUrl}/search/suggest.json?q=${encodeURIComponent(q)}&resources[type]=product${countryParam}`;
        const suggestRes = await fetchJson(suggestUrl, 0, customHeaders);
        
        if (suggestRes !== null) {
            hadSuccessfulResponse = true;
            if (suggestRes?.resources?.results?.products?.length > 0) {
                const match = findBestShopifyMatch(suggestRes.resources.results.products, gameName);
                if (match) {
                    let priceVal = match.price;
                    if (baseUrl.includes('zatu.com') && match.handle) {
                        try {
                            await sleep(350);
                            const prodData = await fetchJson(`${baseUrl}/products/${match.handle}.json`, 0, customHeaders);
                            if (prodData?.product?.variants?.[0]?.price) {
                                priceVal = prodData.product.variants[0].price;
                            }
                        } catch (_) {}
                    }
                    let price = priceVal ? (String(priceVal).startsWith(currencySymbol) ? String(priceVal) : `${currencySymbol}${priceVal}`) : null;
                    const available = match.available ?? false;
                    return {
                        available,
                        price,
                        url: `${baseUrl}${match.url}`
                    };
                }
            }
        }
    }

    if (!hadSuccessfulResponse) {
        throw new Error(`Shopify fetch failed or timed out for ${baseUrl}`);
    }

    return { available: false, price: null, url: null };
}

module.exports = { fetchShopifyStore };
