// Stock checking for Boardgames.ca (Ecwid JSON API).
const { isMatch } = require('../matching');

function parseBoardgamesCa(res, gameName) {
    if (res?.items && Array.isArray(res.items) && res.items.length > 0) {
        const products = res.items.map(item => ({
            title: item.name,
            type: '',
            available: item.inStock ?? false,
            price: item.defaultDisplayedPriceFormatted || (item.price ? `$${item.price}` : null),
            url: item.url || (item.slug ? `https://boardgames.ca/products/${item.slug}` : null)
        }));
        const matchProduct = products.find(p => isMatch(gameName, p));
        if (matchProduct) {
            return {
                available: matchProduct.available,
                price: matchProduct.price,
                url: matchProduct.url
            };
        }
    }
    return null;
}

module.exports = { parseBoardgamesCa };
