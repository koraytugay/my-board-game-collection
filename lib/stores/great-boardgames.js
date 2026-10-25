// Stock checking for great boardgames.
const { decodeXmlEntities } = require('../util');
const { isMatch } = require('../matching');

// Parser for Great Boardgames Waterloo HTML
function parseGreatBoardgames(html, gameName) {
    if (!html) return null;
    
    const cards = html.split('<div class="product card border-0">');
    const products = [];
    
    for (let i = 1; i < cards.length; i++) {
        const cardHtml = cards[i];
        
        const linkMatch = /<a href="(https:\/\/www\.greatboardgames\.ca\/games\/[^"]+)" class="text-dark">([^<]+)<\/a>/i.exec(cardHtml);
        if (!linkMatch) continue;
        
        const url = linkMatch[1];
        const title = decodeXmlEntities(linkMatch[2].trim());
        
        const priceMatch = /<span class="">\s*\$([0-9.]+)\s*<\/span>/i.exec(cardHtml);
        let price = priceMatch ? priceMatch[1].trim() : null;
        if (price && !price.startsWith('$')) price = `$${price}`;
        
        const available = cardHtml.includes('class="btn btn-outline-dark btn-product-left addToCart"') || cardHtml.includes('addToCart');
        
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

module.exports = { parseGreatBoardgames };
