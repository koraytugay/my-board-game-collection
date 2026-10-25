// Stock checking for jj cards.
const { cleanName } = require('../util');
const { fetchHtml } = require('../http');
const { isMatch } = require('../matching');

let jjCardsSitemapProducts = null;

async function getJJCardsProductUrl(query) {
    if (!jjCardsSitemapProducts) {
        try {
            const xml = await fetchHtml('https://shop.jjcards.com/sitemap.xml');
            if (xml) {
                jjCardsSitemapProducts = [];
                const locRegex = /<loc>(https:\/\/shop\.jjcards\.com\/[^<]+_p_\d+\.html)<\/loc>/gi;
                let match;
                const normalizeStr = str => str.toLowerCase().replace(/[^a-z0-9]/g, '');
                while ((match = locRegex.exec(xml)) !== null) {
                    const url = match[1];
                    const slugMatch = url.match(/shop\.jjcards\.com\/([^\/]+)_p_\d+\.html$/);
                    if (slugMatch) {
                        const rawSlug = slugMatch[1].replace(/-/g, ' ');
                        jjCardsSitemapProducts.push({
                            title: rawSlug,
                            url,
                            normSlug: normalizeStr(rawSlug)
                        });
                    }
                }
            }
        } catch (e) {
            console.error('Error fetching J&J Cards sitemap:', e);
        }
    }
    if (!jjCardsSitemapProducts || jjCardsSitemapProducts.length === 0) return null;

    const cleanQ = cleanName(query);
    const normalizeStr = str => str.toLowerCase().replace(/[^a-z0-9]/g, '');
    const nQ = normalizeStr(cleanQ);

    const match = jjCardsSitemapProducts.find(p => p.normSlug === nQ) ||
                  jjCardsSitemapProducts.find(p => isMatch(query, { title: p.title }));
    return match ? match.url : null;
}

// Parses a J&J Cards product page (found via getJJCardsProductUrl).
function parseJJCardsProduct(html, gameName, targetUrl) {
    if (!html) return null;
    const priceMatch = html.match(/itemprop="price"[^>]*content="([^"]+)"/i) ||
                       html.match(/id="price"[^>]*>\s*\$?([0-9\.]+)/i);
    let price = priceMatch ? priceMatch[1].trim() : null;
    if (price && !price.startsWith('$')) price = `$${price}`;

    const availMatch = html.match(/id="availability"[^>]*>([^<]+)<\/span>/i);
    const availText = availMatch ? availMatch[1].trim() : '';
    const available = /in stock/i.test(availText) && !/out of stock/i.test(availText);

    return {
        available,
        price,
        url: targetUrl
    };
}

module.exports = { getJJCardsProductUrl, parseJJCardsProduct };
