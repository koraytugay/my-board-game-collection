// Stock checking for cardhaus.
const { decodeXmlEntities } = require('../util');
const { findBestShopifyMatch } = require('../matching');

// Parser for Cardhaus HTML
function parseCardhaus(html, gameName) {
    if (!html) return null;
    const articles = [...html.matchAll(/<article[\s\S]*?<\/article>/g)];
    const products = [];

    for (const artMatch of articles) {
        const art = artMatch[0];
        if (art.includes('${p.id}') || art.includes('${p.name}')) continue;

        const nameMatch = art.match(/data-name="([^"]+)"/) ||
                          art.match(/class="card-title"[^>]*>[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/);
        const title = nameMatch ? decodeXmlEntities(nameMatch[1].trim()) : null;
        if (!title) continue;

        const categoryMatch = art.match(/data-product-category="([^"]+)"/);
        const type = categoryMatch ? categoryMatch[1].trim() : 'Board Games';

        const urlMatch = art.match(/<a\s+[^>]*class="card-figure__link"[^>]*href="([^"]+)"/) ||
                         art.match(/class="card-title"[^>]*>[\s\S]*?<a\s+[^>]*href="([^"]+)"/);
        let url = urlMatch ? decodeXmlEntities(urlMatch[1]) : null;
        if (url) {
            try {
                const pu = new URL(url);
                pu.search = '';
                url = pu.toString();
            } catch (_) {}
        }

        const priceMatch = art.match(/data-product-price-without-tax class="price">([^<]+)<\/span>/) ||
                           art.match(/data-product-price="([^"]+)"/) ||
                           art.match(/class="price price--withoutTax"[^>]*>([^<]+)<\/span>/);
        let price = priceMatch ? priceMatch[1].trim() : null;
        if (price && !price.startsWith('$')) price = `$${price}`;

        const hasAddToCart = /Add to Cart/i.test(art) || /button-type="add-cart"/i.test(art);
        const isNotify = /Notify Me When In Stock/i.test(art);
        const available = hasAddToCart && !isNotify;

        products.push({
            title,
            type,
            price,
            url,
            available
        });
    }

    return findBestShopifyMatch(products, gameName);
}

module.exports = { parseCardhaus };
