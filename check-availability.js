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

    // Load existing availability.json to preserve old data and timestamps
    let existingData = {};
    if (fs.existsSync(OUTPUT_FILE)) {
        try {
            existingData = JSON.parse(fs.readFileSync(OUTPUT_FILE, 'utf8'));
        } catch (e) {
            console.error('Error reading existing availability.json:', e);
        }
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
        const query = cleanName(game.name);

        const storeConfigs = {
            boardGameBliss: {
                type: 'json',
                url: `https://www.boardgamebliss.com/search/suggest.json?q=${encodeURIComponent(query)}&resources[type]=product`,
                parser: (res, gameName) => {
                    if (res?.resources?.results?.products) {
                        const products = res.resources.results.products;
                        const matchProduct = products.find(p => isMatch(gameName, p));
                        if (matchProduct) {
                            return {
                                available: matchProduct.available ?? false,
                                price: matchProduct.price || null,
                                url: `https://www.boardgamebliss.com${matchProduct.url}`
                            };
                        }
                    }
                    return null;
                }
            },
            fourZeroOneGames: {
                type: 'json',
                url: `https://store.401games.ca/search/suggest.json?q=${encodeURIComponent(query)}&resources[type]=product`,
                parser: (res, gameName) => {
                    if (res?.resources?.results?.products) {
                        const products = res.resources.results.products;
                        const matchProduct = products.find(p => isMatch(gameName, p));
                        if (matchProduct) {
                            return {
                                available: matchProduct.available ?? false,
                                price: matchProduct.price || null,
                                url: `https://store.401games.ca${matchProduct.url}`
                            };
                        }
                    }
                    return null;
                }
            },
            lvlUpGames: {
                type: 'json',
                url: `https://www.lvlupgames.ca/search/suggest.json?q=${encodeURIComponent(query)}&resources[type]=product`,
                parser: (res, gameName) => {
                    if (res?.resources?.results?.products) {
                        const products = res.resources.results.products;
                        const matchProduct = products.find(p => isMatch(gameName, p));
                        if (matchProduct) {
                            return {
                                available: matchProduct.available ?? false,
                                price: matchProduct.price || null,
                                url: `https://www.lvlupgames.ca${matchProduct.url}`
                            };
                        }
                    }
                    return null;
                }
            },
            asDesJeux: {
                type: 'json',
                url: `https://www.asdesjeux.com/search/suggest.json?q=${encodeURIComponent(query)}&resources[type]=product`,
                parser: (res, gameName) => {
                    if (res?.resources?.results?.products) {
                        const products = res.resources.results.products;
                        const matchProduct = products.find(p => isMatch(gameName, p));
                        if (matchProduct) {
                            return {
                                available: matchProduct.available ?? false,
                                price: matchProduct.price || null,
                                url: `https://www.asdesjeux.com${matchProduct.url}`
                            };
                        }
                    }
                    return null;
                }
            },
            greatBoardgames: {
                type: 'html',
                url: `https://www.greatboardgames.ca/search?q=${encodeURIComponent(query)}`,
                parser: (html, gameName) => {
                    const match = parseGreatBoardgames(html, gameName);
                    if (match) {
                        return {
                            available: match.available,
                            price: match.price,
                            url: match.url
                        };
                    }
                    return null;
                }
            },
            meeplemart: {
                type: 'html',
                url: `https://www.meeplemart.com/store/Search.aspx?SearchTerms=${encodeURIComponent(query)}`,
                parser: (html, gameName) => {
                    const match = parseMeeplemart(html, gameName);
                    if (match) {
                        return {
                            available: match.available,
                            price: match.price,
                            url: match.url
                        };
                    }
                    return null;
                }
            },
            amazonCa: {
                type: 'html',
                url: `https://www.amazon.ca/s?k=${encodeURIComponent(query + " board game")}`,
                parser: (html, gameName) => {
                    const match = parseAmazon(html, gameName);
                    if (match) {
                        return {
                            available: match.available,
                            price: match.price,
                            url: match.url
                        };
                    }
                    return null;
                }
            },
            woodForSheep: {
                type: 'json',
                url: `https://www.woodforsheep.ca/search/suggest.json?q=${encodeURIComponent(query)}&resources[type]=product`,
                parser: (res, gameName) => {
                    if (res?.resources?.results?.products) {
                        const products = res.resources.results.products;
                        const matchProduct = products.find(p => isMatch(gameName, p));
                        if (matchProduct) {
                            return {
                                available: matchProduct.available ?? false,
                                price: matchProduct.price || null,
                                url: `https://www.woodforsheep.ca${matchProduct.url}`
                            };
                        }
                    }
                    return null;
                }
            },
            faceToFaceGames: {
                type: 'json',
                url: `https://facetofacegames.com/search/suggest.json?q=${encodeURIComponent(query)}&resources[type]=product`,
                parser: (res, gameName) => {
                    if (res?.resources?.results?.products) {
                        const products = res.resources.results.products;
                        const matchProduct = products.find(p => isMatch(gameName, p));
                        if (matchProduct) {
                            return {
                                available: matchProduct.available ?? false,
                                price: matchProduct.price || null,
                                url: `https://facetofacegames.com${matchProduct.url}`
                            };
                        }
                    }
                    return null;
                }
            },
            hairyTarantula: {
                type: 'json',
                url: `https://hairyt.com/search/suggest.json?q=${encodeURIComponent(query)}&resources[type]=product`,
                parser: (res, gameName) => {
                    if (res?.resources?.results?.products) {
                        const products = res.resources.results.products;
                        const matchProduct = products.find(p => isMatch(gameName, p));
                        if (matchProduct) {
                            return {
                                available: matchProduct.available ?? false,
                                price: matchProduct.price || null,
                                url: `https://hairyt.com${matchProduct.url}`
                            };
                        }
                    }
                    return null;
                }
            },
            boardGameBandit: {
                type: 'json',
                url: `https://boardgamebandit.ca/search/suggest.json?q=${encodeURIComponent(query)}&resources[type]=product`,
                parser: (res, gameName) => {
                    if (res?.resources?.results?.products) {
                        const products = res.resources.results.products;
                        const matchProduct = products.find(p => isMatch(gameName, p));
                        if (matchProduct) {
                            return {
                                available: matchProduct.available ?? false,
                                price: matchProduct.price || null,
                                url: `https://boardgamebandit.ca${matchProduct.url}`
                            };
                        }
                    }
                    return null;
                }
            }
        };

        const availability = {};
        const fetchPromises = [];
        const storeKeys = Object.keys(storeConfigs);
        const skippedStores = [];

        for (const storeKey of storeKeys) {
            const config = storeConfigs[storeKey];
            const existingStoreData = existingData[game.objectId]?.[storeKey];

            let shouldFetch = true;
            if (existingStoreData && existingStoreData.lastChecked && existingStoreData.lastCheckSuccess !== false) {
                const lastCheckedTime = new Date(existingStoreData.lastChecked).getTime();
                const sixHoursAgo = Date.now() - (6 * 60 * 60 * 1000);
                if (lastCheckedTime > sixHoursAgo) {
                    shouldFetch = false;
                }
            }

            if (!shouldFetch) {
                skippedStores.push(storeKey);
                availability[storeKey] = {
                    available: existingStoreData.available ?? false,
                    price: existingStoreData.price ?? null,
                    url: existingStoreData.url ?? null,
                    lastChecked: existingStoreData.lastChecked,
                    lastCheckSuccess: existingStoreData.lastCheckSuccess ?? true
                };
            } else {
                const fetchPromise = (async () => {
                    try {
                        const res = config.type === 'json' 
                            ? await fetchJson(config.url)
                            : await fetchHtml(config.url);

                        if (res === null) {
                            throw new Error(`Fetch returned null (timeout/error)`);
                        }

                        const parsed = config.parser(res, game.name);
                        if (parsed) {
                            availability[storeKey] = {
                                available: parsed.available,
                                price: parsed.price,
                                url: parsed.url,
                                lastChecked: new Date().toISOString(),
                                lastCheckSuccess: true
                            };
                        } else {
                            availability[storeKey] = {
                                available: false,
                                price: null,
                                url: null,
                                lastChecked: new Date().toISOString(),
                                lastCheckSuccess: true
                            };
                        }
                    } catch (err) {
                        availability[storeKey] = {
                            available: existingStoreData?.available ?? false,
                            price: existingStoreData?.price ?? null,
                            url: existingStoreData?.url ?? null,
                            lastChecked: existingStoreData?.lastChecked ?? null,
                            lastCheckSuccess: false
                        };
                    }
                })();
                fetchPromises.push(fetchPromise);
            }
        }

        if (skippedStores.length > 0) {
            console.log(`[${i+1}/${wantedGames.length}] "${game.name}": skipped ${skippedStores.length} stores checked within 6 hours. Checking remaining ${fetchPromises.length} stores...`);
        } else {
            console.log(`[${i+1}/${wantedGames.length}] "${game.name}": Checking all 11 stores...`);
        }

        if (fetchPromises.length > 0) {
            await Promise.all(fetchPromises);
        }

        availabilityData[game.objectId] = availability;
        
        // Politeness delay
        if (fetchPromises.length > 0) {
            await new Promise(r => setTimeout(r, 3000));
        }
    }

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(availabilityData, null, 2), 'utf8');
    console.log(`Availability check finished. Saved results to ${OUTPUT_FILE}`);
}

checkAvailability().catch(err => {
    console.error('Fatal error during availability check:', err);
});
