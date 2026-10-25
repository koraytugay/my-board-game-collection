// Stock checking for amazon.
const { isMatch } = require('../matching');
const { getBrowserInstance } = require('../browser');

// Parser for Amazon.ca HTML
function parseAmazon(html, gameName) {
    if (!html) return null;
    
    const items = html.split('data-component-type="s-search-result"');
    const products = [];
    
    for (let i = 1; i < items.length; i++) {
        const itemHtml = items[i];
        
        const asinMatch = /data-asin="([^"]+)"/.exec(itemHtml);
        if (!asinMatch) continue;
        const asin = asinMatch[1];
        
        let title = '';
        const titleMatch = /<span class="a-size-base-plus a-color-base a-text-normal"[^>]*>([^<]+)<\/span>/i.exec(itemHtml)
                        || /<span class="a-size-medium a-color-base a-text-normal"[^>]*>([^<]+)<\/span>/i.exec(itemHtml)
                        || /alt="([^"]+)"/i.exec(itemHtml)
                        || /aria-label="([^"]+)"/i.exec(itemHtml);
        if (titleMatch) {
            title = titleMatch[1].trim();
        }
        
        if (!title) continue;
        
        const brandMatch = /<span class="a-size-base-plus a-color-base">([^<]+)<\/span>/i.exec(itemHtml);
        if (brandMatch) {
            const brand = brandMatch[1].trim();
            if (!title.toLowerCase().includes(brand.toLowerCase())) {
                title = `${brand} - ${title}`;
            }
        }
        
        const priceMatch = /<span class="a-price"[^>]*>\s*<span class="a-offscreen">\s*\$([0-9.]+)\s*<\/span>/i.exec(itemHtml);
        const price = priceMatch ? priceMatch[1].trim() : null;
        
        const available = price !== null;
        
        products.push({
            title,
            price,
            available,
            url: `https://www.amazon.ca/dp/${asin}`,
            type: 'Board Games'
        });
    }
    
    return products.find(p => isMatch(gameName, p)) || null;
}

async function fetchAmazonWithPuppeteer(gameName) {
    const searchUrl = `https://www.amazon.ca/s?k=${encodeURIComponent(gameName + " board game")}`;
    const browser = await getBrowserInstance();
    if (!browser) {
        throw new Error(`Puppeteer browser not available for Amazon`);
    }

    const page = await browser.newPage();
    try {
        await page.setViewport({ width: 1280, height: 800 });

        const response = await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
        if (!response || response.status() !== 200) {
            throw new Error(`Amazon puppeteer returned status ${response ? response.status() : 'null'}`);
        }

        const html = await page.content();
        const match = parseAmazon(html, gameName);
        if (match) {
            return {
                available: match.available,
                price: match.price,
                url: match.url
            };
        }
        return {
            available: false,
            price: null,
            url: searchUrl
        };
    } finally {
        await page.close().catch(() => {});
    }
}

module.exports = { parseAmazon, fetchAmazonWithPuppeteer };
