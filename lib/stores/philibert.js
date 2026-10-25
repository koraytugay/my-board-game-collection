// Stock checking for philibert.
const { decodeXmlEntities, cleanName } = require('../util');
const { fetchJson, fetchHtml } = require('../http');
const { isMatch } = require('../matching');

// Stock checker for Philibert using search + stock AJAX API
async function checkPhilibertStock(gameName) {
    try {
        const query = cleanName(gameName);
        const searchUrl = `https://www.philibertnet.com/en/search?search_query=${encodeURIComponent(query)}&submit_search=`;
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

        let inStock = false;
        if (match.pid) {
            try {
                const stockUrl = `https://www.philibertnet.com/en/ajax/stock/${match.pid}`;
                const stockData = await fetchJson(stockUrl);
                if (stockData?.stocks && typeof stockData.stocks[match.pid] === 'boolean') {
                    inStock = stockData.stocks[match.pid];
                }
            } catch (_) {}
        }

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
