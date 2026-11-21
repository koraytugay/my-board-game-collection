// Stock checking for philibert.
const { decodeXmlEntities, cleanName } = require('../util');
const { fetchJson, fetchHtml } = require('../http');
const { isMatch } = require('../matching');
const { sleep } = require('../util');

// Philibert's stock AJAX endpoint is behind Akamai and answers 429 to requests that do not look
// like the site's own XHR. It needs X-Requested-With and a Referer; cookies alone do not help.
const MIN_GAP_MS = 1500;
let lastRequestAt = 0;

// Keeps Philibert requests at least MIN_GAP_MS apart, even if several checks overlap.
let throttleChain = Promise.resolve();
function throttle() {
    const turn = throttleChain.then(async () => {
        const wait = lastRequestAt + MIN_GAP_MS - Date.now();
        if (wait > 0) await sleep(wait);
        lastRequestAt = Date.now();
    });
    throttleChain = turn.catch(() => {});
    return turn;
}

// Stock checker for Philibert using search + stock AJAX API
async function checkPhilibertStock(gameName) {
    try {
        const query = cleanName(gameName);
        const searchUrl = `https://www.philibertnet.com/en/search?search_query=${encodeURIComponent(query)}&submit_search=`;
        await throttle();
        const html = await fetchHtml(searchUrl);
        if (!html) throw new Error(`Failed to fetch Philibert HTML for ${gameName}`);

        const cards = html.split(/<div[^>]*class="[^"]*product-card\b[^"]*"[^>]*>/i).slice(1);
        const products = [];

        for (const card of cards) {
            const titleMatch = card.match(/<a[^>]*class="[^"]*product-card__title[^"]*"[^>]*href="([^"]+)"[^>]*>([^<]+)<\/a>/i);
            if (!titleMatch) continue;
            const relativeUrl = titleMatch[1].trim();
            const rawTitle = decodeXmlEntities(titleMatch[2].trim());
            const url = relativeUrl.startsWith('http') ? relativeUrl : `https://www.philibertnet.com${relativeUrl}`;

            const priceMatch = card.match(/class="product-card__price[^"]*"[^>]*>([^<]+)<\/p>/i);
            let price = null;
            if (priceMatch) {
                const rawPrice = priceMatch[1].trim();
                const num = rawPrice.replace(/[^0-9,.]/g, '').replace(',', '.');
                if (num) {
                    price = `€${num}`;
                }
            }

            const pidMatch = card.match(/data-pid="(\d+)"/i);
            const pid = pidMatch ? pidMatch[1] : null;

            products.push({
                title: rawTitle,
                price,
                url,
                pid,
                type: 'Board Games'
            });
        }

        const match = products.find(p => isMatch(gameName, p));
        if (!match) {
            return { available: false, price: null, url: null };
        }

        // A failed stock lookup must surface as a failed check, not as "out of stock".
        if (!match.pid) throw new Error(`Philibert product card has no pid for ${gameName}`);
        // The endpoint returns 502 for a single id but works for a list, so the id is sent twice.
        const stockUrl = `https://www.philibertnet.com/en/ajax/stock/${match.pid},${match.pid}`;
        await throttle();
        const stockData = await fetchJson(stockUrl, 0, {
            'X-Requested-With': 'XMLHttpRequest',
            'Referer': searchUrl
        });
        const inStock = stockData?.stocks?.[match.pid];
        if (typeof inStock !== 'boolean') throw new Error(`Philibert stock lookup failed for ${gameName} (pid ${match.pid})`);

        return {
            available: inStock,
            price: match.price,
            url: match.url
        };
    } catch (err) {
        throw err;
    }
}

module.exports = { checkPhilibertStock };
