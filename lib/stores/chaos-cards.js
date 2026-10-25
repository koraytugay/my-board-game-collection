// Stock checking for chaos cards.
const { cleanName } = require('../util');
const { isPriceUnderThreshold } = require('../deals');
const { getBrowserInstance } = require('../browser');

async function checkChaosCardsStock(gameName) {
    const browser = await getBrowserInstance();
    if (!browser) throw new Error(`Puppeteer browser not available for Chaos Cards`);
    const page = await browser.newPage();
    try {
        await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36');
        const query = cleanName(gameName);
        const searchUrl = `https://www.chaoscards.co.uk/`;
        const response = await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
        if (!response || response.status() !== 200) {
            throw new Error(`Chaos Cards search page returned status ${response ? response.status() : 'null'}`);
        }
        await page.type('#header_search_search_for', query);
        await page.keyboard.press('Enter');
        await new Promise(r => setTimeout(r, 3000));

        const match = await page.evaluate((targetName) => {
            const clean = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
            const targetClean = clean(targetName);
            const disallowedKeywords = ['led', 'leds', 'paint', 'sleeves', 'brush', 'dice', 'mat', 'tokens', 'coins', 'booster', 'binder', 'deck box', 'album', 'case', 'marker', 'bits'];
            const items = [];
            document.querySelectorAll('a[href*="-p"], a[href*="/products/"], a[href*="/shop/board-games/"]').forEach(a => {
                const title = a.innerText.trim();
                const lowerTitle = title.toLowerCase();
                if (disallowedKeywords.some(kw => lowerTitle.includes(kw) && !targetName.toLowerCase().includes(kw))) {
                    return;
                }
                const nTitle = clean(title);
                const isExact = nTitle === targetClean;
                const isWordMatch = targetClean.length > 5 && nTitle.includes(targetClean);
                if (isExact || isWordMatch) {
                    const parent = a.closest('.product, .item, li, div') || a;
                    const priceMatch = parent.innerText.match(/£\s*([0-9]+(?:\.[0-9]{2})?)/);
                    const isOos = parent.innerText.toLowerCase().includes('out of stock');
                    items.push({
                        title,
                        price: priceMatch ? `£${priceMatch[1]}` : null,
                        available: !isOos,
                        url: a.href
                    });
                }
            });
            return items[0] || null;
        }, gameName);

        if (match && !isPriceUnderThreshold(match.price)) {
            return {
                available: match.available,
                price: match.price,
                url: match.url
            };
        }
        return { available: false, price: null, url: null };
    } finally {
        await page.close().catch(() => {});
    }
}

module.exports = { checkChaosCardsStock };
