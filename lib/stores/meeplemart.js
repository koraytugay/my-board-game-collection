// Stock checking for meeplemart.
const { isMatch } = require('../matching');

// Parser for Meeplemart HTML
function parseMeeplemart(html, gameName) {
    if (!html) return null;
    
    const items = html.split('<div class="CategoryItem">');
    const products = [];
    
    for (let i = 1; i < items.length; i++) {
        const itemHtml = items[i];
        
        const linkMatch = /class="CategoryItemName"><a[^>]*href="([^"]+)"[^>]*>([^<]+)<\/a>/i.exec(itemHtml);
        if (!linkMatch) continue;
        
        const path = linkMatch[1];
        const title = linkMatch[2].trim();
        const url = `https://www.meeplemart.com${path}`;
        
        const priceMatch = /class=[\x27"]CategoryProductPrice[\x27"]>\s*\$([0-9.]+)\s*<\/span>/i.exec(itemHtml);
        const price = priceMatch ? priceMatch[1].trim() : null;
        
        const available = itemHtml.includes('class="CategoryProductAddToCart') || itemHtml.includes('value="Add to Cart"');
        
        products.push({
            title,
            price,
            available,
            url,
            type: 'Board Games'
        });
    }
    
    return products.find(p => isMatch(gameName, p)) || null;
}

module.exports = { parseMeeplemart };
