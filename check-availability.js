const fs = require('fs');
const https = require('https');

const COLLECTION_FILE = 'collection.xml';
const OUTPUT_FILE = 'availability.json';

// Helper to make HTTPS requests in Node and automatically follow redirects (JSON response)
function fetchJson(url, redirectCount = 0) {
    if (redirectCount > 5) {
        console.error(`Too many redirects for: ${url}`);
        return Promise.resolve(null);
    }
    return new Promise((resolve, reject) => {
        const options = {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            },
            timeout: 10000 // 10 seconds timeout
        };
        let resolved = false;

        const req = https.get(url, options, (res) => {
            if (res.statusCode === 302 || res.statusCode === 301) {
                const redirectUrl = res.headers.location;
                if (redirectUrl) {
                    if (!resolved) {
                        resolved = true;
                        fetchJson(redirectUrl, redirectCount + 1).then(resolve).catch(reject);
                    }
                    return;
                }
            }
            if (res.statusCode !== 200) {
                console.warn(`[WARNING] fetchJson failed for ${url} with status: ${res.statusCode}`);
                if (!resolved) {
                    resolved = true;
                    resolve(null);
                }
                return;
            }

            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                if (!resolved) {
                    resolved = true;
                    try {
                        resolve(JSON.parse(data));
                    } catch (e) {
                        console.error(`[ERROR] JSON parse failed for ${url}: ${e.message}`);
                        resolve(null);
                    }
                }
            });
        });

        req.on('timeout', () => {
            req.destroy();
            console.error(`[ERROR] Timeout (10s) fetching JSON from: ${url}`);
            if (!resolved) {
                resolved = true;
                resolve(null);
            }
        });

        req.on('error', (err) => {
            console.error(`[ERROR] HTTPS error fetching JSON from ${url}: ${err.message}`);
            if (!resolved) {
                resolved = true;
                resolve(null);
            }
        });
    });
}

// Helper to make HTTPS requests in Node and automatically follow redirects (HTML response)
function fetchHtml(url, redirectCount = 0) {
    if (redirectCount > 5) {
        console.error(`Too many redirects for: ${url}`);
        return Promise.resolve(null);
    }
    return new Promise((resolve, reject) => {
        const options = {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            },
            timeout: 10000 // 10 seconds timeout
        };
        let resolved = false;

        const req = https.get(url, options, (res) => {
            if (res.statusCode === 302 || res.statusCode === 301) {
                const redirectUrl = res.headers.location;
                if (redirectUrl) {
                    if (!resolved) {
                        resolved = true;
                        fetchHtml(redirectUrl, redirectCount + 1).then(resolve).catch(reject);
                    }
                    return;
                }
            }
            if (res.statusCode !== 200) {
                console.warn(`[WARNING] fetchHtml failed for ${url} with status: ${res.statusCode}`);
                if (!resolved) {
                    resolved = true;
                    resolve(null);
                }
                return;
            }

            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                if (!resolved) {
                    resolved = true;
                    resolve(data);
                }
            });
        });

        req.on('timeout', () => {
            req.destroy();
            console.error(`[ERROR] Timeout (10s) fetching HTML from: ${url}`);
            if (!resolved) {
                resolved = true;
                resolve(null);
            }
        });

        req.on('error', (err) => {
            console.error(`[ERROR] HTTPS error fetching HTML from ${url}: ${err.message}`);
            if (!resolved) {
                resolved = true;
                resolve(null);
            }
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

// Parser for GeekStop Games HTML
function parseGeekStopGames(html, gameName) {
    if (!html) return null;
    const regex = /<h3><a href="\/game\.php\?([^"]+)"[^>]*>([^<]+)<\/a>[\s\S]*?<span>\s*\$([0-9.]+)\s*<\/span>[\s\S]*?<span[^>]*style\s*=\s*['\x22][^'\x22]*(?:color:\s*([^;'\x22\s]+))[^'\x22]*['\x22][^>]*>([^<]+)<\/span>/gi;
    let match;
    const products = [];
    while ((match = regex.exec(html)) !== null) {
        const urlParam = match[1];
        const title = match[2].trim();
        const price = match[3].trim();
        const color = match[4] || '';
        const stockText = match[5].trim();
        const available = stockText.toLowerCase().includes('in stock') || color.toLowerCase().includes('green');
        
        products.push({
            title,
            price,
            available,
            url: `https://www.geekstopgames.com/game.php?${urlParam}`,
            type: 'Board Games'
        });
    }
    
    return products.find(p => isMatch(gameName, p)) || null;
}

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
        const title = linkMatch[2].trim();
        
        const priceMatch = /<span class="">\s*\$([0-9.]+)\s*<\/span>/i.exec(cardHtml);
        const price = priceMatch ? priceMatch[1].trim() : null;
        
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

function decodeXmlEntities(str) {
    return str
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#039;/g, "'")
        .replace(/&apos;/g, "'")
        .replace(/&#x27;/g, "'")
        .replace(/&#(\d+);/g, (match, dec) => String.fromCharCode(dec));
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
                    name: decodeXmlEntities(nameMatch[1].trim())
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

        const [bgbRes, fofRes, lvlRes, geekHtml, gbgHtml, meepleHtml, amazonHtml, wfsRes, f2fRes, hairytRes, banditRes] = await Promise.all([
            fetchJson(`https://www.boardgamebliss.com/search/suggest.json?q=${encodeURIComponent(query)}&resources[type]=product`),
            fetchJson(`https://store.401games.ca/search/suggest.json?q=${encodeURIComponent(query)}&resources[type]=product`),
            fetchJson(`https://www.lvlupgames.ca/search/suggest.json?q=${encodeURIComponent(query)}&resources[type]=product`),
            fetchHtml(`https://www.geekstopgames.com/gameSearch.php?search=${encodeURIComponent(query)}`),
            fetchHtml(`https://www.greatboardgames.ca/search?q=${encodeURIComponent(query)}`),
            fetchHtml(`https://www.meeplemart.com/store/Search.aspx?SearchTerms=${encodeURIComponent(query)}`),
            fetchHtml(`https://www.amazon.ca/s?k=${encodeURIComponent(query + " board game")}`),
            fetchJson(`https://www.woodforsheep.ca/search/suggest.json?q=${encodeURIComponent(query)}&resources[type]=product`),
            fetchJson(`https://facetofacegames.com/search/suggest.json?q=${encodeURIComponent(query)}&resources[type]=product`),
            fetchJson(`https://hairyt.com/search/suggest.json?q=${encodeURIComponent(query)}&resources[type]=product`),
            fetchJson(`https://boardgamebandit.ca/search/suggest.json?q=${encodeURIComponent(query)}&resources[type]=product`)
        ]);

        const availability = {
            boardGameBliss: { available: false, price: null, url: null },
            fourZeroOneGames: { available: false, price: null, url: null },
            lvlUpGames: { available: false, price: null, url: null },
            geekStopGames: { available: false, price: null, url: null },
            greatBoardgames: { available: false, price: null, url: null },
            meeplemart: { available: false, price: null, url: null },
            amazonCa: { available: false, price: null, url: null },
            woodForSheep: { available: false, price: null, url: null },
            faceToFaceGames: { available: false, price: null, url: null },
            hairyTarantula: { available: false, price: null, url: null },
            boardGameBandit: { available: false, price: null, url: null }
        };

        // Parse Board Game Bliss
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

        // Parse 401 Games
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

        // Parse LVLUP Games
        if (lvlRes?.resources?.results?.products) {
            const products = lvlRes.resources.results.products;
            const matchProduct = products.find(p => isMatch(game.name, p));
            if (matchProduct) {
                availability.lvlUpGames = {
                    available: matchProduct.available ?? false,
                    price: matchProduct.price || null,
                    url: `https://www.lvlupgames.ca${matchProduct.url}`
                };
            }
        }

        // Parse GeekStop Games
        const geekMatch = parseGeekStopGames(geekHtml, game.name);
        if (geekMatch) {
            availability.geekStopGames = {
                available: geekMatch.available,
                price: geekMatch.price,
                url: geekMatch.url
            };
        }

        // Parse Great Boardgames Waterloo
        const gbgMatch = parseGreatBoardgames(gbgHtml, game.name);
        if (gbgMatch) {
            availability.greatBoardgames = {
                available: gbgMatch.available,
                price: gbgMatch.price,
                url: gbgMatch.url
            };
        }

        // Parse Meeplemart
        const meepleMatch = parseMeeplemart(meepleHtml, game.name);
        if (meepleMatch) {
            availability.meeplemart = {
                available: meepleMatch.available,
                price: meepleMatch.price,
                url: meepleMatch.url
            };
        }

        // Parse Amazon.ca
        const amazonMatch = parseAmazon(amazonHtml, game.name);
        if (amazonMatch) {
            availability.amazonCa = {
                available: amazonMatch.available,
                price: amazonMatch.price,
                url: amazonMatch.url
            };
        }

        // Parse Wood for Sheep
        if (wfsRes?.resources?.results?.products) {
            const products = wfsRes.resources.results.products;
            const matchProduct = products.find(p => isMatch(game.name, p));
            if (matchProduct) {
                availability.woodForSheep = {
                    available: matchProduct.available ?? false,
                    price: matchProduct.price || null,
                    url: `https://www.woodforsheep.ca${matchProduct.url}`
                };
            }
        }

        // Parse Face to Face Games
        if (f2fRes?.resources?.results?.products) {
            const products = f2fRes.resources.results.products;
            const matchProduct = products.find(p => isMatch(game.name, p));
            if (matchProduct) {
                availability.faceToFaceGames = {
                    available: matchProduct.available ?? false,
                    price: matchProduct.price || null,
                    url: `https://facetofacegames.com${matchProduct.url}`
                };
            }
        }

        // Parse Hairy Tarantula
        if (hairytRes?.resources?.results?.products) {
            const products = hairytRes.resources.results.products;
            const matchProduct = products.find(p => isMatch(game.name, p));
            if (matchProduct) {
                availability.hairyTarantula = {
                    available: matchProduct.available ?? false,
                    price: matchProduct.price || null,
                    url: `https://hairyt.com${matchProduct.url}`
                };
            }
        }

        // Parse Board Game Bandit
        if (banditRes?.resources?.results?.products) {
            const products = banditRes.resources.results.products;
            const matchProduct = products.find(p => isMatch(game.name, p));
            if (matchProduct) {
                availability.boardGameBandit = {
                    available: matchProduct.available ?? false,
                    price: matchProduct.price || null,
                    url: `https://boardgamebandit.ca${matchProduct.url}`
                };
            }
        }

        availabilityData[game.objectId] = availability;
        
        // Politeness delay
        await new Promise(r => setTimeout(r, 3000));
    }

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(availabilityData, null, 2), 'utf8');
    console.log(`Availability check finished. Saved results to ${OUTPUT_FILE}`);
}

checkAvailability().catch(err => {
    console.error('Fatal error during availability check:', err);
});
