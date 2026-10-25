// Stock checking for miniature market.
const { decodeXmlEntities } = require('../util');
const { isMatch } = require('../matching');

// Parser for Miniature Market HTML
function parseMiniatureMarket(html, gameName) {
    if (!html) return null;
    const boxes = html.split(/class="[^"]*card product-box box-[^"]*"/);
    const products = [];
    
    for (let i = 1; i < boxes.length; i++) {
        const boxHtml = boxes[i];
        
        const linkMatch = /<a\s+[^>]*href="([^"]+)"[^>]*class="product-name[^"]*"[^>]*title="([^"]+)"/i.exec(boxHtml)
                       || /<a\s+[^>]*class="product-name[^"]*"[^>]*title="([^"]+)"[^>]*href="([^"]+)"/i.exec(boxHtml)
                       || /class="product-name[^"]*"[^>]*>\s*([^<]+)\s*<\/a>/i.exec(boxHtml);
        if (!linkMatch) continue;
        
        let url = '';
        let title = '';
        if (linkMatch[1].startsWith('http')) {
            url = linkMatch[1];
            title = linkMatch[2] || linkMatch[1];
        } else if (linkMatch[2] && linkMatch[2].startsWith('http')) {
            url = linkMatch[2];
            title = linkMatch[1];
        } else {
            const hrefMatch = /href="([^"]+)"/i.exec(linkMatch[0]);
            url = hrefMatch ? hrefMatch[1] : '';
            title = linkMatch[1];
        }
        title = decodeXmlEntities(title.trim());
        
        const priceMatch = /class="product-price"[^>]*>\s*\$([0-9.]+)\s*<\/span>/i.exec(boxHtml)
                        || /<span class="product-price"[^>]*>\s*\$([0-9.]+)/i.exec(boxHtml)
                        || /\$([0-9\.]+)/i.exec(boxHtml);
        const price = priceMatch ? `$${priceMatch[1].trim()}` : null;
        
        const hasAddToCart = /btn-buy/i.test(boxHtml) || /action="\/checkout\/line-item\/add"/i.test(boxHtml);
        const isOutOfStock = /out of stock/i.test(boxHtml) || /stock-notification/i.test(boxHtml);
        const available = hasAddToCart && !isOutOfStock;
        
        products.push({
            title,
            url,
            price,
            available,
            type: 'Board Games'
        });
    }
    return products.find(p => isMatch(gameName, p)) || null;
}

module.exports = { parseMiniatureMarket };
