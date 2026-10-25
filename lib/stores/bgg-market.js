// Stock checking for the BGG Market (Geekdo API): Canadian sellers only.
const { MIN_PRICE_THRESHOLD } = require('../deals');

function parseBggMarket(res, gameName, targetUrl, existingStoreData, skippedSellers = []) {
    if (res?.products && Array.isArray(res.products) && res.products.length > 0) {
        // Only Canadian sellers
        const caProducts = res.products.filter(p => p.itemlocation_code === 'CA' || p.itemlocation === 'Canada');
        
        const getMarketCadPrice = (priceStr, currency) => {
            const num = parseFloat(priceStr) || 0;
            const cur = (currency || '').toUpperCase();
            if (cur === 'USD') return num * 1.40;
            if (cur === 'EUR') return num * 1.65;
            if (cur === 'GBP') return num * 1.90;
            return num;
        };

        // Filter out sellers in skippedSellers list (case-insensitive) and listings <= $5.0 CAD
        const allowedProducts = caProducts.filter(p => {
            const sellerName = p.linkeduser?.username;
            if (!sellerName) return false;
            if (skippedSellers.some(s => s.toLowerCase() === sellerName.toLowerCase())) return false;
            if (getMarketCadPrice(p.price, p.currency) <= MIN_PRICE_THRESHOLD) return false;
            return true;
        });

        if (allowedProducts.length > 0) {
            const sorted = [...allowedProducts].sort((a, b) => getMarketCadPrice(a.price, a.currency) - getMarketCadPrice(b.price, b.currency));
            const existingListings = Array.isArray(existingStoreData?.listings) ? existingStoreData.listings : [];

            const listings = sorted.map(match => {
                const symbol = match.currencysymbol || '$';
                const seller = match.linkeduser?.username || 'Unknown';

                const existing = existingListings.find(l => l.seller && l.seller.toLowerCase() === seller.toLowerCase());
                const firstSeen = existing?.firstSeen || new Date().toISOString();

                const isIgnored = getMarketCadPrice(match.price, match.currency) <= MIN_PRICE_THRESHOLD;

                return {
                    price: `${symbol}${match.price} ${match.currency}`,
                    seller: seller,
                    condition: match.prettycondition || '',
                    url: `https://boardgamegeek.com${match.producthref}`,
                    firstSeen: firstSeen,
                    ignored: isIgnored
                };
            });

            const activeListings = listings.filter(l => !l.ignored);

            if (activeListings.length > 0) {
                const primary = activeListings[0];
                return {
                    available: true,
                    price: primary.price,
                    url: primary.url,
                    listings: listings
                };
            } else {
                return {
                    available: false,
                    price: null,
                    url: null,
                    listings: listings
                };
            }
        }
    }
    return null;
}

module.exports = { parseBggMarket };
