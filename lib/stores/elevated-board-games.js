// Stock checking for elevated board games.
const { decodeXmlEntities, cleanName } = require('../util');
const { fetchHtml } = require('../http');
const { isMatch } = require('../matching');

let elevatedBoardGamesSitemapProducts = null;

async function getElevatedBoardGamesProductUrl(query) {
    if (!elevatedBoardGamesSitemapProducts) {
        try {
            const xml = await fetchHtml('https://www.elevatedboardgames.com/store-products-sitemap.xml');
            if (xml) {
                elevatedBoardGamesSitemapProducts = [];
                const urlBlocks = xml.split('<url>').slice(1);
                const normalizeStr = str => str.toLowerCase().replace(/[^a-z0-9]/g, '');

                for (const block of urlBlocks) {
                    const locMatch = /<loc>(https:\/\/www\.elevatedboardgames\.com\/product-page\/([^<]+))<\/loc>/i.exec(block);
                    if (!locMatch) continue;
                    const url = locMatch[1];
                    const slug = locMatch[2];

                    let title = '';
                    const titleMatch = /<image:title>([^<]+)<\/image:title>/i.exec(block);
                    if (titleMatch) {
                        title = decodeXmlEntities(titleMatch[1].replace(/\s+(board|card)\s+game$/i, '').trim());
                    }
                    if (!title) {
                        title = slug.replace(/-/g, ' ');
                    }

                    elevatedBoardGamesSitemapProducts.push({
                        title,
                        rawSlug: slug.replace(/-/g, ' '),
                        url,
                        normTitle: normalizeStr(title),
                        normSlug: normalizeStr(slug.replace(/-/g, ' '))
                    });
                }
            }
        } catch (e) {
            console.error('Error fetching Elevated Board Games sitemap:', e);
        }
    }
    if (!elevatedBoardGamesSitemapProducts || elevatedBoardGamesSitemapProducts.length === 0) return null;

    const cleanQ = cleanName(query);
    const normalizeStr = str => str.toLowerCase().replace(/[^a-z0-9]/g, '');
    const nQ = normalizeStr(cleanQ);

    const match = elevatedBoardGamesSitemapProducts.find(p => p.normSlug === nQ || p.normTitle === nQ) ||
                  elevatedBoardGamesSitemapProducts.find(p => isMatch(query, { title: p.title })) ||
                  elevatedBoardGamesSitemapProducts.find(p => isMatch(query, { title: p.rawSlug }));

    return match ? match.url : null;
}

function parseElevatedBoardGames(html, gameName, targetUrl) {
    if (!html) return null;

    // Check JSON-LD schema
    const jsonLdMatch = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/i.exec(html);
    if (jsonLdMatch) {
        try {
            const data = JSON.parse(jsonLdMatch[1]);
            if (data && (data['@type'] === 'Product' || data['@type'] === 'product')) {
                const offer = data.offers || data.Offers;
                let price = offer?.price ? `$${offer.price}` : null;
                const availabilityUrl = offer?.availability || offer?.Availability || '';
                const available = availabilityUrl.toLowerCase().includes('instock') && !availabilityUrl.toLowerCase().includes('outofstock');
                return {
                    available,
                    price,
                    url: targetUrl
                };
            }
        } catch (e) {
            console.error('Error parsing Elevated Board Games JSON-LD:', e);
        }
    }

    // Fallback to HTML parsing
    const priceMatch = html.match(/itemprop="price"[^>]*content="([^"]+)"/i) ||
                       html.match(/class="[^"]*price[^"]*"[^>]*>\s*\$?([0-9\.]+)/i);
    let price = priceMatch ? priceMatch[1].trim() : null;
    if (price && !price.startsWith('$')) price = `$${price}`;

    const isOutOfStock = /out of stock/i.test(html);
    const isAddToCart = /add to cart/i.test(html);

    return {
        available: isAddToCart && !isOutOfStock,
        price,
        url: targetUrl
    };
}

module.exports = { getElevatedBoardGamesProductUrl, parseElevatedBoardGames };
