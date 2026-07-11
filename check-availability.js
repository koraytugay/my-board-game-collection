const fs = require('fs');
const https = require('https');

const COLLECTION_FILE = 'collection.xml';
const OUTPUT_FILE = 'availability.json';

// Helper to make HTTPS requests in Node and automatically follow redirects
function fetchJson(url) {
    return new Promise((resolve, reject) => {
        const options = {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        };
        https.get(url, options, (res) => {
            if (res.statusCode === 302 || res.statusCode === 301) {
                const redirectUrl = res.headers.location;
                if (redirectUrl) {
                    fetchJson(redirectUrl).then(resolve).catch(reject);
                    return;
                }
            }
            if (res.statusCode !== 200) {
                resolve(null);
                return;
            }

            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    resolve(null);
                }
            });
        }).on('error', (err) => {
            resolve(null);
        });
    });
}

function cleanName(name) {
    return name.replace(/\([^)]*\)/g, '').replace(/[\u2013\u2014]/g, '-').trim();
}

function isMatch(bggName, shopifyProduct) {
    const shopifyTitle = shopifyProduct.title || '';
    const shopifyType = shopifyProduct.type || '';
    
    const cleanBgg = cleanName(bggName);
    const normalize = str => str.toLowerCase().replace(/[^a-z0-9]/g, '');
    const nBgg = normalize(cleanBgg);
    const nShopify = normalize(shopifyTitle);

    // 1. Check product type: filter out obvious non-game categories
    const lowerType = shopifyType.toLowerCase();
    const disallowedTypes = ['accessory', 'accessories', 'paint', 'sleeve', 'sleeves', 'insert', 'organizer', 'organiser', 'playmat', 'mat', 'dice', 'token', 'tokens', 'tcg', 'booster', 'singles', 'single', 'acrylic', 'miniature', 'miniatures'];
    if (disallowedTypes.some(type => lowerType.includes(type))) {
        return false;
    }

    // 2. Filter out keywords in Shopify title that are NOT in BGG title
    const disallowedKeywords = ['insert', 'organizer', 'organiser', 'playmat', 'promo', 'paint', 'sleeves', 'token', 'coins', 'upgrade', 'expansion', 'booster', 'tcg', 'sleeved', 'sleeve-pack', 'acrylic-tokens'];
    for (const kw of disallowedKeywords) {
        if (shopifyTitle.toLowerCase().includes(kw) && !cleanBgg.toLowerCase().includes(kw)) {
            return false;
        }
    }

    // 3. Exact match of normalized titles
    if (nBgg === nShopify) {
        return true;
    }

    // 4. Word length constraint to prevent generic single-word matching (e.g. "Parade" matching "Parade of Hundred Demons")
    const wordsBgg = cleanBgg.toLowerCase().split(/\s+/).filter(Boolean);
    const wordsShopify = shopifyTitle.toLowerCase().split(/\s+/).filter(Boolean);
    if (wordsBgg.length === 1 && wordsShopify.length > 2) {
        return false;
    }

    return nBgg === nShopify || nShopify.startsWith(nBgg) || nBgg.startsWith(nShopify);
}

async function checkAvailability() {
    console.log('Starting board game availability check...');
    if (!fs.existsSync(COLLECTION_FILE)) {
        console.error('collection.xml not found.');
        return;
    }

    const content = fs.readFileSync(COLLECTION_FILE, 'utf8');
    const itemRegex = /<item objecttype="thing" objectid="(\d+)"[^>]*>([\s\S]*?)<\/item>/g;
    let match;
    const wantedGames = [];

    while ((match = itemRegex.exec(content)) !== null) {
        const objectId = match[1];
        const itemContent = match[2];

        // Check if wanttobuy is "1"
        const statusMatch = /<status [^>]*wanttobuy="1"/.exec(itemContent);
        if (statusMatch) {
            const nameMatch = /<name[^>]*>([^<]+)<\/name>/.exec(itemContent);
            if (nameMatch) {
                wantedGames.push({
                    objectId,
                    name: nameMatch[1].trim()
                });
            }
        }
    }

    console.log(`Found ${wantedGames.length} games in Want to Buy list.`);
    const availabilityData = {};

    for (let i = 0; i < wantedGames.length; i++) {
        const game = wantedGames[i];
        console.log(`[${i+1}/${wantedGames.length}] Checking availability for: "${game.name}"...`);
        const query = cleanName(game.name);

        const [bgbRes, fofRes] = await Promise.all([
            fetchJson(`https://www.boardgamebliss.com/search/suggest.json?q=${encodeURIComponent(query)}&resources[type]=product`),
            fetchJson(`https://store.401games.ca/search/suggest.json?q=${encodeURIComponent(query)}&resources[type]=product`)
        ]);

        const availability = {
            boardGameBliss: { available: false, price: null, url: null },
            fourZeroOneGames: { available: false, price: null, url: null }
        };

        // Parse Board Game Bliss results
        if (bgbRes?.resources?.results?.products) {
            const products = bgbRes.resources.results.products;
            const matchProduct = products.find(p => isMatch(game.name, p));
            if (matchProduct) {
                availability.boardGameBliss = {
                    available: matchProduct.available ?? false,
                    price: matchProduct.price || null,
                    url: `https://www.boardgamebliss.com${matchProduct.url}`
                };
            }
        }

        // Parse 401 Games results
        if (fofRes?.resources?.results?.products) {
            const products = fofRes.resources.results.products;
            const matchProduct = products.find(p => isMatch(game.name, p));
            if (matchProduct) {
                availability.fourZeroOneGames = {
                    available: matchProduct.available ?? false,
                    price: matchProduct.price || null,
                    url: `https://store.401games.ca${matchProduct.url}`
                };
            }
        }

        availabilityData[game.objectId] = availability;
        
        // Politeness delay
        await new Promise(r => setTimeout(r, 500));
    }

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(availabilityData, null, 2), 'utf8');
    console.log(`Availability check finished. Saved results to ${OUTPUT_FILE}`);
}

checkAvailability().catch(err => {
    console.error('Fatal error during availability check:', err);
});
