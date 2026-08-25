const fs = require('fs');
const https = require('https');
const zlib = require('zlib');

const isRecommended = process.argv.includes('--recommended') || process.env.CHECK_TYPE === 'recommended';
const isThinkingAbout = process.argv.includes('--thinking-about') || process.argv.includes('--thinkingabout') || process.env.CHECK_TYPE === 'thinkingabout';
const COLLECTION_FILE = 'collection.xml';
const RECOMMENDATIONS_FILE = 'recommendations.json';
const OUTPUT_FILE = isRecommended ? 'availability-recommended.json' : (isThinkingAbout ? 'availability-thinkingabout.json' : 'availability.json');
const POLITENESS_DELAY_MS = parseInt(process.env.CHECK_DELAY_MS || '5000', 10);
const MIN_PRICE_THRESHOLD = 5.0; // Ignore/treat items priced <= 5 as out of stock / erroneous match

function decodeXmlEntities(str) {
    if (!str) return '';
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

function extractNumericPrice(priceStr) {
    if (!priceStr) return null;
    const clean = String(priceStr).replace(/,/g, '');
    const match = clean.match(/[0-9]+(?:\.[0-9]+)?/);
    return match ? parseFloat(match[0]) : null;
}

function isPriceUnderThreshold(priceStr, threshold = MIN_PRICE_THRESHOLD) {
    const num = extractNumericPrice(priceStr);
    return num !== null && num <= threshold;
}

function computeDealInfo(currentPrice, currentUrl, isAvailable, existingStoreData) {
    if (!isAvailable) {
        return {
            baselinePrice: existingStoreData?.baselinePrice || currentPrice || null,
            deal: null
        };
    }

    const currNum = extractNumericPrice(currentPrice);
    if (!currNum) {
        return { baselinePrice: currentPrice || null, deal: null };
    }

    const prevPrice = existingStoreData?.price;
    const prevUrl = existingStoreData?.url;

    // If product URL changed, this is a different matched product (e.g. expansion / big box / different edition)
    // Reset baseline to the new product
    if (prevUrl && currentUrl && prevUrl !== currentUrl) {
        return { baselinePrice: currentPrice, deal: null };
    }

    let baselinePrice = existingStoreData?.baselinePrice || prevPrice || currentPrice;
    let baselineNum = extractNumericPrice(baselinePrice);

    if (!baselineNum) {
        return { baselinePrice: currentPrice, deal: null };
    }

    // Price went up: update regular baseline price
    if (currNum > baselineNum) {
        return { baselinePrice: currentPrice, deal: null };
    }

    // Calculate discount against baseline
    const discountPercent = Math.round(((baselineNum - currNum) / baselineNum) * 100);

    if (discountPercent >= 20) {
        return {
            baselinePrice,
            deal: {
                previousPrice: baselinePrice,
                discountPercent
            }
        };
    }

    // If price dropped slightly (< 20%), update baseline
    if (currNum < baselineNum && discountPercent < 20) {
        return { baselinePrice: currentPrice, deal: null };
    }

    return { baselinePrice, deal: null };
}

const DEFAULT_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Encoding': 'gzip, deflate, br',
    'Accept-Language': 'en-US,en;q=0.9',
    'Sec-Ch-Ua': '"Chromium";v="128", "Not;A=Brand";v="24", "Google Chrome";v="128"',
    'Sec-Ch-Ua-Mobile': '?0',
    'Sec-Ch-Ua-Platform': '"macOS"',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Sec-Fetch-User': '?1',
    'Upgrade-Insecure-Requests': '1'
};

function getDecompressedStream(res) {
    const encoding = (res.headers['content-encoding'] || '').toLowerCase();
    if (encoding === 'gzip') {
        return res.pipe(zlib.createGunzip());
    } else if (encoding === 'br') {
        return res.pipe(zlib.createBrotliDecompress());
    } else if (encoding === 'deflate') {
        return res.pipe(zlib.createInflate());
    }
    return res;
}

// Helper to make HTTPS requests in Node and automatically follow redirects (JSON response)
function fetchJson(url, redirectCount = 0, customHeaders = {}) {
    if (redirectCount > 5) {
        console.error(`Too many redirects for: ${url}`);
        return Promise.resolve(null);
    }
    return new Promise((resolve, reject) => {
        const u = new URL(url);
        const options = {
            hostname: u.hostname,
            path: u.pathname + u.search,
            headers: { ...DEFAULT_HEADERS, ...customHeaders },
            timeout: 10000 // 10 seconds timeout
        };
        let resolved = false;

        const req = https.get(options, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                let redirectUrl = res.headers.location;
                if (redirectUrl.startsWith('/')) {
                    redirectUrl = `${u.protocol}//${u.host}${redirectUrl}`;
                }
                if (!resolved) {
                    resolved = true;
                    fetchJson(redirectUrl, redirectCount + 1, customHeaders).then(resolve).catch(reject);
                }
                return;
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
            const stream = getDecompressedStream(res);
            stream.on('data', (chunk) => { data += chunk; });
            stream.on('end', () => {
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
            stream.on('error', (err) => {
                console.error(`[ERROR] Stream decompress error for JSON ${url}: ${err.message}`);
                if (!resolved) {
                    resolved = true;
                    resolve(null);
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

let buttonShyShopId = null;
let buttonShyListingsCache = null;

async function fetchButtonShyEtsyListings(apiKey) {
    if (buttonShyListingsCache) return buttonShyListingsCache;
    try {
        if (!buttonShyShopId) {
            const shopRes = await fetchJson('https://openapi.etsy.com/v3/application/shops?shop_name=ButtonShyGames', 0, {
                'x-api-key': apiKey
            });
            if (shopRes?.results?.[0]?.shop_id) {
                buttonShyShopId = shopRes.results[0].shop_id;
            } else if (shopRes?.shop_id) {
                buttonShyShopId = shopRes.shop_id;
            }
        }
        
        const shopId = buttonShyShopId || 'ButtonShyGames';
        const listingsRes = await fetchJson(`https://openapi.etsy.com/v3/application/shops/${shopId}/listings/active?limit=100`, 0, {
            'x-api-key': apiKey
        });
        
        buttonShyListingsCache = listingsRes?.results || [];
        if (buttonShyListingsCache.length > 0) {
            console.log(`[Button Shy Etsy] Fetched ${buttonShyListingsCache.length} active listings from Etsy API.`);
        }
        return buttonShyListingsCache;
    } catch (err) {
        console.error(`[Button Shy Etsy] Error fetching shop listings:`, err.message);
        return [];
    }
}

// Helper to make HTTPS requests in Node and automatically follow redirects and Akamai challenges (HTML response)
function fetchHtml(url, redirectCount = 0, cookieHeader = '') {
    if (redirectCount > 5) {
        console.error(`Too many redirects for: ${url}`);
        return Promise.resolve(null);
    }
    return new Promise((resolve, reject) => {
        const u = new URL(url);
        const reqHeaders = { ...DEFAULT_HEADERS };
        if (cookieHeader) {
            reqHeaders['Cookie'] = cookieHeader;
        }

        const options = {
            hostname: u.hostname,
            path: u.pathname + u.search,
            headers: reqHeaders,
            timeout: 10000 // 10 seconds timeout
        };
        let resolved = false;

        const req = https.get(options, (res) => {
            const setCookies = res.headers['set-cookie'];
            let newCookies = cookieHeader;
            if (setCookies) {
                const parsedCookies = setCookies.map(c => c.split(';')[0]).join('; ');
                newCookies = newCookies ? `${newCookies}; ${parsedCookies}` : parsedCookies;
            }

            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                let redirectUrl = res.headers.location;
                if (redirectUrl.startsWith('/')) {
                    redirectUrl = `${u.protocol}//${u.host}${redirectUrl}`;
                }
                if (!resolved) {
                    resolved = true;
                    fetchHtml(redirectUrl, redirectCount + 1, newCookies).then(resolve).catch(reject);
                }
                return;
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
            const stream = getDecompressedStream(res);
            stream.on('data', (chunk) => { data += chunk; });
            stream.on('end', () => {
                if (!resolved) {
                    resolved = true;
                    // Check for Akamai bot verification refresh tag
                    const verifyMatch = /URL=\x27([^\x27]*bm-verify[^\x27]*)\x27/i.exec(data) || /URL="([^"]*bm-verify[^"]*)"/i.exec(data);
                    if (verifyMatch && redirectCount < 5) {
                        let verifyPath = verifyMatch[1];
                        if (verifyPath.startsWith('/')) {
                            verifyPath = `${u.protocol}//${u.host}${verifyPath}`;
                        }
                        fetchHtml(verifyPath, redirectCount + 1, newCookies).then(resolve).catch(reject);
                        return;
                    }
                    resolve(data);
                }
            });
            stream.on('error', (err) => {
                console.error(`[ERROR] Stream decompress error for HTML ${url}: ${err.message}`);
                if (!resolved) {
                    resolved = true;
                    resolve(null);
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

let kbHobbiesSitemapProducts = null;

async function getKbHobbiesProduct(query) {
    if (!kbHobbiesSitemapProducts) {
        try {
            const xml = await fetchHtml('https://www.kbhobbies.com/sitemap.xml');
            if (xml) {
                kbHobbiesSitemapProducts = [];
                const locRegex = /<loc>(https:\/\/www\.kbhobbies\.com\/product\/([^\/]+)\/([^<]+))<\/loc>/gi;
                let match;
                const normalizeStr = str => str.toLowerCase().replace(/[^a-z0-9]/g, '');
                while ((match = locRegex.exec(xml)) !== null) {
                    const url = match[1];
                    const slug = match[2];
                    const productId = match[3];
                    const rawTitle = slug.replace(/-/g, ' ');
                    kbHobbiesSitemapProducts.push({
                        title: rawTitle,
                        slug,
                        productId,
                        url,
                        normTitle: normalizeStr(rawTitle)
                    });
                }
            }
        } catch (e) {
            console.error('Error fetching KB Hobbies sitemap:', e);
        }
    }
    if (!kbHobbiesSitemapProducts || kbHobbiesSitemapProducts.length === 0) return null;

    const cleanQ = cleanName(query);
    const normalizeStr = str => str.toLowerCase().replace(/[^a-z0-9]/g, '');
    const nQ = normalizeStr(cleanQ);

    const match = kbHobbiesSitemapProducts.find(p => p.normTitle === nQ) ||
                  kbHobbiesSitemapProducts.find(p => isMatch(query, { title: p.title }));
    return match || null;
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

const GAME_ALIASES = {
    'Back to the Future: Back in Time': ['Back to the Future']
};

function isMatch(bggName, shopifyProduct) {
    const shopifyTitle = decodeXmlEntities(shopifyProduct.title || '');
    const shopifyType = shopifyProduct.type || '';
    
    const cleanBgg = cleanName(bggName);
    const normalize = str => str.toLowerCase().replace(/[^a-z0-9]/g, '');
    const nBgg = normalize(cleanBgg);
    const nShopify = normalize(shopifyTitle);

    // 1. Check product type: filter out obvious non-game categories
    const lowerType = shopifyType.toLowerCase();
    const disallowedTypes = ['diecast', 'model', 'accessory', 'accessories', 'paint', 'sleeve', 'sleeves', 'insert', 'organizer', 'organiser', 'playmat', 'mat', 'dice', 'token', 'tokens', 'tcg', 'booster', 'singles', 'single', 'acrylic', 'miniature', 'miniatures', 'puzzle', 'puzzles'];
    if (disallowedTypes.some(type => lowerType.includes(type))) {
        return false;
    }

    // 2. Filter out keywords in Shopify title that are NOT in BGG title
    const disallowedKeywords = ['diecast', 'die-cast', '1/32', '1/24', '1/18', 'keyring', 'plush', 'action figure', 'pop! vinyl', 'insert', 'organizer', 'organiser', 'playmat', 'promo', 'paint', 'sleeves', 'token', 'coins', 'upgrade', 'expansion', 'booster', 'tcg', 'sleeved', 'sleeve-pack', 'acrylic-tokens', 'puzzle', 'puzzles', '1000pc', '1000pcs', '1000-piece', '1000 piece'];
    for (const kw of disallowedKeywords) {
        if (shopifyTitle.toLowerCase().includes(kw) && !cleanBgg.toLowerCase().includes(kw)) {
            return false;
        }
    }

    // 3. Exact match of normalized titles
    if (nBgg === nShopify) {
        return true;
    }

    // 4. Check known game aliases
    const aliases = GAME_ALIASES[bggName] || GAME_ALIASES[cleanBgg] || [];
    for (const alias of aliases) {
        if (normalize(alias) === nShopify) {
            return true;
        }
    }

    // 5. If BGG name has a subtitle, ensure shopifyTitle contains key subtitle words
    if (cleanBgg.includes(':')) {
        const parts = cleanBgg.split(':');
        const subtitle = parts[1].trim();
        const subWords = subtitle.toLowerCase().split(/\s+/).filter(w => w.length > 2);
        const hasSubtitle = subWords.some(w => shopifyTitle.toLowerCase().includes(w));
        if (!hasSubtitle) {
            return false;
        }
    }

    // 6. Word constraint to prevent generic single-word matching (e.g. "Parade" matching "Parade of Hundred Demons", "Barista" matching "Baristart")
    const wordsBgg = cleanBgg.toLowerCase().split(/\s+/).filter(Boolean);
    const wordsShopify = shopifyTitle.toLowerCase().split(/\s+/).filter(Boolean);
    if (wordsBgg.length === 1) {
        if (wordsShopify.length > 2) return false;
        return normalize(wordsBgg[0]) === normalize(wordsShopify[0]);
    }
    if (wordsShopify.length === 1 && wordsBgg.length > 1) {
        return false;
    }

    return nBgg === nShopify || nShopify.startsWith(nBgg) || nBgg.startsWith(nShopify);
}

function findBestShopifyMatch(products, gameName) {
    if (!products || !Array.isArray(products) || products.length === 0) return null;
    const normalize = str => str.toLowerCase().replace(/[^a-z0-9]/g, '');
    const cleanBgg = cleanName(gameName);
    const nBgg = normalize(cleanBgg);
    
    // 1. Exact normalized match first
    const exact = products.find(p => normalize(cleanName(decodeXmlEntities(p.title || ''))) === nBgg);
    if (exact) return exact;

    // 2. Exact alias match
    const aliases = GAME_ALIASES[gameName] || GAME_ALIASES[cleanBgg] || [];
    for (const alias of aliases) {
        const aliasMatch = products.find(p => normalize(cleanName(decodeXmlEntities(p.title || ''))) === normalize(alias));
        if (aliasMatch) return aliasMatch;
    }
    
    // 3. isMatch filter
    return products.find(p => isMatch(gameName, p)) || null;
}

async function fetchShopifyStore(baseUrl, query, gameName, currencySymbol = '$') {
    const queries = [query];
    const aliases = GAME_ALIASES[gameName] || GAME_ALIASES[cleanName(gameName)] || [];
    for (const a of aliases) {
        if (!queries.includes(a)) queries.push(a);
    }

    let hadSuccessfulResponse = false;

    for (const q of queries) {
        const suggestUrl = `${baseUrl}/search/suggest.json?q=${encodeURIComponent(q)}&resources[type]=product`;
        const suggestRes = await fetchJson(suggestUrl);
        
        if (suggestRes !== null) {
            hadSuccessfulResponse = true;
            if (suggestRes?.resources?.results?.products?.length > 0) {
                const match = findBestShopifyMatch(suggestRes.resources.results.products, gameName);
                if (match) {
                    let price = match.price ? (match.price.startsWith(currencySymbol) ? match.price : `${currencySymbol}${match.price}`) : null;
                    const available = match.available ?? false;
                    return {
                        available,
                        price,
                        url: `${baseUrl}${match.url}`
                    };
                }
            }
        }
    }

    if (!hadSuccessfulResponse) {
        throw new Error(`Shopify fetch failed or timed out for ${baseUrl}`);
    }

    return { available: false, price: null, url: null };
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

// Stock checker for Philibert using search + stock AJAX API
async function checkPhilibertStock(gameName) {
    try {
        const query = cleanName(gameName);
        const searchUrl = `https://www.philibertnet.com/en/search?search_query=${encodeURIComponent(query)}&submit_search=`;
        const html = await fetchHtml(searchUrl);
        if (!html) return { available: false, price: null, url: null };

        const cards = html.split(/<div[^>]*class="[^"]*product-card\b[^"]*"[^>]*>/i).slice(1);
        const products = [];

        for (const card of cards) {
            const titleMatch = card.match(/<a[^>]*class="[^"]*product-card__title[^"]*"[^>]*href="([^"]+)"[^>]*>([^<]+)<\/a>/i);
            if (!titleMatch) continue;
            const relativeUrl = titleMatch[1].trim();
            const rawTitle = decodeXmlEntities(titleMatch[2].trim());
            const url = relativeUrl.startsWith('http') ? relativeUrl : `https://www.philibertnet.com${relativeUrl}`;

            const priceMatch = card.match(/class="product-card__price[^"]*"[^>]*>([^<]+)<\/p>/i);
            let price = null;
            if (priceMatch) {
                const rawPrice = priceMatch[1].trim();
                const num = rawPrice.replace(/[^0-9,.]/g, '').replace(',', '.');
                if (num) {
                    price = `€${num}`;
                }
            }

            const pidMatch = card.match(/data-pid="(\d+)"/i);
            const pid = pidMatch ? pidMatch[1] : null;

            products.push({
                title: rawTitle,
                price,
                url,
                pid,
                type: 'Board Games'
            });
        }

        const match = products.find(p => isMatch(gameName, p));
        if (!match) {
            return { available: false, price: null, url: null };
        }

        let inStock = false;
        if (match.pid) {
            try {
                const stockUrl = `https://www.philibertnet.com/en/ajax/stock/${match.pid}`;
                const stockData = await fetchJson(stockUrl);
                if (stockData?.stocks && typeof stockData.stocks[match.pid] === 'boolean') {
                    inStock = stockData.stocks[match.pid];
                }
            } catch (_) {}
        }

        return {
            available: inStock,
            price: match.price,
            url: match.url
        };
    } catch (err) {
        return { available: false, price: null, url: null };
    }
}

let globalBrowser = null;

async function getBrowserInstance() {
    if (!globalBrowser) {
        try {
            const puppeteer = require('puppeteer');
            globalBrowser = await puppeteer.launch({
                headless: true,
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-blink-features=AutomationControlled',
                    '--user-agent=Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'
                ]
            });
        } catch (e) {
            console.error('[ERROR] Could not launch Puppeteer:', e.message);
            globalBrowser = null;
        }
    }
    return globalBrowser;
}

async function fetchAmazonWithPuppeteer(gameName) {
    const searchUrl = `https://www.amazon.ca/s?k=${encodeURIComponent(gameName + " board game")}`;
    try {
        const browser = await getBrowserInstance();
        if (!browser) {
            return { available: false, price: null, url: searchUrl };
        }

        const page = await browser.newPage();
        await page.setViewport({ width: 1280, height: 800 });

        const response = await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
        if (!response || response.status() !== 200) {
            await page.close();
            return { available: false, price: null, url: searchUrl };
        }

        const html = await page.content();
        await page.close();

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
    } catch (err) {
        console.warn(`[WARNING] Puppeteer Amazon fetch error for "${gameName}": ${err.message}`);
        return {
            available: false,
            price: null,
            url: searchUrl
        };
    }
}

function getRecommendedRange() {
    let start = 0;
    let end = null;
    let limit = null;

    if (process.env.REC_START !== undefined) start = parseInt(process.env.REC_START, 10);
    else if (process.env.REC_OFFSET !== undefined) start = parseInt(process.env.REC_OFFSET, 10);

    if (process.env.REC_END !== undefined) {
        if (String(process.env.REC_END).toLowerCase() === 'max' || String(process.env.REC_END).toLowerCase() === 'all') {
            end = Infinity;
        } else {
            end = parseInt(process.env.REC_END, 10);
        }
    } else if (process.env.REC_LIMIT !== undefined) {
        limit = parseInt(process.env.REC_LIMIT, 10);
    }

    const args = process.argv;
    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (arg === '--start' || arg === '--offset') {
            const val = parseInt(args[i + 1], 10);
            if (!isNaN(val)) start = val;
        } else if (arg.startsWith('--start=') || arg.startsWith('--offset=')) {
            const val = parseInt(arg.split('=')[1], 10);
            if (!isNaN(val)) start = val;
        } else if (arg === '--end') {
            const valStr = args[i + 1];
            if (valStr && (valStr.toLowerCase() === 'max' || valStr.toLowerCase() === 'all')) {
                end = Infinity;
            } else {
                const val = parseInt(valStr, 10);
                if (!isNaN(val)) end = val;
            }
        } else if (arg.startsWith('--end=')) {
            const valStr = arg.split('=')[1];
            if (valStr && (valStr.toLowerCase() === 'max' || valStr.toLowerCase() === 'all')) {
                end = Infinity;
            } else {
                const val = parseInt(valStr, 10);
                if (!isNaN(val)) end = val;
            }
        } else if (arg === '--limit') {
            const val = parseInt(args[i + 1], 10);
            if (!isNaN(val)) limit = val;
        } else if (arg.startsWith('--limit=')) {
            const val = parseInt(arg.split('=')[1], 10);
            if (!isNaN(val)) limit = val;
        } else if (arg === '--range' && args[i + 1]) {
            const parts = args[i + 1].split(/[-:]/);
            if (parts.length >= 1 && parts[0] !== '') {
                const s = parseInt(parts[0], 10);
                if (!isNaN(s)) start = s;
            }
            if (parts.length >= 2) {
                if (parts[1].toLowerCase() === 'max' || parts[1].toLowerCase() === 'all' || parts[1] === '') {
                    end = Infinity;
                } else {
                    const e = parseInt(parts[1], 10);
                    if (!isNaN(e)) end = e;
                }
            }
        } else if (arg.startsWith('--range=')) {
            const parts = arg.split('=')[1].split(/[-:]/);
            if (parts.length >= 1 && parts[0] !== '') {
                const s = parseInt(parts[0], 10);
                if (!isNaN(s)) start = s;
            }
            if (parts.length >= 2) {
                if (parts[1].toLowerCase() === 'max' || parts[1].toLowerCase() === 'all' || parts[1] === '') {
                    end = Infinity;
                } else {
                    const e = parseInt(parts[1], 10);
                    if (!isNaN(e)) end = e;
                }
            }
        }
    }

    if (isNaN(start) || start < 0) start = 0;
    if (end === null) {
        if (limit !== null && !isNaN(limit)) {
            end = start + limit;
        } else {
            end = start === 0 ? 100 : Infinity;
        }
    }

    return { start, end };
}

async function checkAvailability() {
    console.log(`Starting ${isRecommended ? 'recommended games' : (isThinkingAbout ? 'thinking about games' : 'board game')} availability check...`);
    if (!isRecommended && !fs.existsSync(COLLECTION_FILE)) {
        console.error('collection.xml not found.');
        return;
    }
    if (isRecommended && !fs.existsSync(RECOMMENDATIONS_FILE)) {
        console.error('recommendations.json not found.');
        return;
    }

    // Load existing availability file to preserve old data and timestamps
    let existingData = {};
    if (fs.existsSync(OUTPUT_FILE)) {
        try {
            existingData = JSON.parse(fs.readFileSync(OUTPUT_FILE, 'utf8'));
        } catch (e) {
            console.error(`Error reading existing ${OUTPUT_FILE}:`, e);
        }
    }

    // Load skipped sellers list
    let skippedSellers = [];
    if (fs.existsSync('skipped-sellers.json')) {
        try {
            skippedSellers = JSON.parse(fs.readFileSync('skipped-sellers.json', 'utf8'));
        } catch (e) {
            console.error('Error reading skipped-sellers.json:', e);
        }
    } else if (fs.existsSync('skipped-sellers.js')) {
        try {
            skippedSellers = require('./skipped-sellers.js');
        } catch (e) {
            console.error('Error reading skipped-sellers.js:', e);
        }
    }
    if (!Array.isArray(skippedSellers)) skippedSellers = [];
    console.log(`Loaded ${skippedSellers.length} skipped seller(s).`);

    const wantedGames = [];

    if (isRecommended) {
        try {
            const recData = JSON.parse(fs.readFileSync(RECOMMENDATIONS_FILE, 'utf8'));
            const recList = recData.recommendations || [];
            const range = getRecommendedRange();
            const sliced = range.end === Infinity 
                ? recList.slice(range.start) 
                : recList.slice(range.start, range.end);

            sliced.forEach(r => {
                if (r.objectId && r.name) {
                    wantedGames.push({
                        objectId: String(r.objectId),
                        name: r.name.trim()
                    });
                }
            });
            const endDisplay = range.end === Infinity ? Math.max(400, recList.length) : range.end;
            console.log(`Loaded ${wantedGames.length} games (range: ${range.start} - ${endDisplay}, total: ${recList.length}) from ${RECOMMENDATIONS_FILE}.`);
        } catch (e) {
            console.error('Error reading recommendations.json:', e);
            return;
        }
    } else if (isThinkingAbout) {
        const content = fs.readFileSync(COLLECTION_FILE, 'utf8');
        const itemRegex = /<item objecttype="thing" objectid="(\d+)"[^>]*>([\s\S]*?)<\/item>/g;
        let match;

        while ((match = itemRegex.exec(content)) !== null) {
            const objectId = match[1];
            const itemContent = match[2];

            const statusMatch = /<status\s+([^>]+)\/>/.exec(itemContent);
            if (statusMatch) {
                const statusStr = statusMatch[1];
                const isWishlist = /wishlist="1"/.test(statusStr);
                const isThinking = isWishlist && (/wishlistpriority="4"/.test(statusStr) || !/wishlistpriority=/.test(statusStr));
                if (isThinking) {
                    const nameMatch = /<name[^>]*>([^<]+)<\/name>/.exec(itemContent);
                    if (nameMatch) {
                        wantedGames.push({
                            objectId,
                            name: decodeXmlEntities(nameMatch[1].trim()),
                            isWantToBuy: true,
                            isWantInTrade: false
                        });
                    }
                }
            }
        }
        console.log(`Found ${wantedGames.length} games in Thinking About list.`);
    } else {
        const content = fs.readFileSync(COLLECTION_FILE, 'utf8');
        const itemRegex = /<item objecttype="thing" objectid="(\d+)"[^>]*>([\s\S]*?)<\/item>/g;
        let match;

        while ((match = itemRegex.exec(content)) !== null) {
            const objectId = match[1];
            const itemContent = match[2];

            const statusMatch = /<status\s+([^>]+)\/>/.exec(itemContent);
            if (statusMatch) {
                const statusStr = statusMatch[1];
                const isWantToBuy = /wanttobuy="1"/.test(statusStr);
                const isWantInTrade = /want="1"/.test(statusStr);
                if (isWantToBuy || isWantInTrade) {
                    const nameMatch = /<name[^>]*>([^<]+)<\/name>/.exec(itemContent);
                    if (nameMatch) {
                        wantedGames.push({
                            objectId,
                            name: decodeXmlEntities(nameMatch[1].trim()),
                            isWantToBuy,
                            isWantInTrade
                        });
                    }
                }
            }
        }

        const wtbCount = wantedGames.filter(g => g.isWantToBuy).length;
        const tradeOnlyCount = wantedGames.filter(g => g.isWantInTrade && !g.isWantToBuy).length;
        console.log(`Found ${wantedGames.length} games in Wanted list (${wtbCount} Want to Buy, ${tradeOnlyCount} Want in Trade only).`);
    }
    const availabilityData = { ...existingData };

    for (let i = 0; i < wantedGames.length; i++) {
        const game = wantedGames[i];
        const query = cleanName(game.name);

        const storeConfigs = {
            boardGameBliss: {
                type: 'shopify',
                baseUrl: 'https://www.boardgamebliss.com',
                currencySymbol: '$'
            },
            fourZeroOneGames: {
                type: 'shopify',
                baseUrl: 'https://store.401games.ca',
                currencySymbol: '$'
            },
            lvlUpGames: {
                type: 'shopify',
                baseUrl: 'https://www.lvlupgames.ca',
                currencySymbol: '$'
            },
            asDesJeux: {
                type: 'shopify',
                baseUrl: 'https://www.asdesjeux.com',
                currencySymbol: '$'
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
            kbHobbies: {
                type: 'custom',
                checker: async (game) => {
                    const prod = await getKbHobbiesProduct(game.name);
                    if (!prod) {
                        return { available: false, price: null, url: null };
                    }
                    const skusRes = await fetchJson(`https://cdn5.editmysite.com/app/store/api/v28/editor/users/151297753/sites/680972496472648272/products/${prod.productId}/skus`);
                    if (skusRes === null) {
                        throw new Error(`Failed to fetch KB Hobbies SKU for ${prod.productId}`);
                    }
                    const sku = skusRes?.data?.[0];
                    const inventory = typeof sku?.inventory === 'number' ? sku.inventory : 0;
                    const available = inventory > 0;
                    let price = sku?.price?.current_formatted || (sku?.price?.current ? `$${sku.price.current}` : null);
                    if (price && !price.startsWith('$')) price = `$${price}`;
                    return {
                        available,
                        price,
                        url: prod.url
                    };
                }
            },
            miniatureMarket: {
                type: 'html',
                url: `https://www.miniaturemarket.com/search?search=${encodeURIComponent(query)}`,
                parser: (html, gameName) => {
                    const match = parseMiniatureMarket(html, gameName);
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
                type: 'puppeteer',
                url: (game) => `https://www.amazon.ca/s?k=${encodeURIComponent(game.name + " board game")}`,
                parser: null
            },
            woodForSheep: {
                type: 'shopify',
                baseUrl: 'https://www.woodforsheep.ca',
                currencySymbol: '$'
            },
            faceToFaceGames: {
                type: 'shopify',
                baseUrl: 'https://facetofacegames.com',
                currencySymbol: '$'
            },
            obsidianGames: {
                type: 'shopify',
                baseUrl: 'https://obsidiangames.ca',
                currencySymbol: '$'
            },
            jjCards: {
                type: 'html',
                url: async (game) => await getJJCardsProductUrl(game.name),
                parser: (html, gameName, targetUrl) => {
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
            },
            boardgamesCa: {
                type: 'json',
                url: `https://app.ecwid.com/api/v3/122261030/products?keyword=${encodeURIComponent(query)}&token=public_w37fvtk2kUVuY6X7N2TdhZFLqVLKs68j`,
                parser: (res, gameName) => {
                    if (res?.items && Array.isArray(res.items) && res.items.length > 0) {
                        const products = res.items.map(item => ({
                            title: item.name,
                            type: '',
                            available: item.inStock ?? false,
                            price: item.defaultDisplayedPriceFormatted || (item.price ? `$${item.price}` : null),
                            url: item.url || (item.slug ? `https://boardgames.ca/products/${item.slug}` : null)
                        }));
                        const matchProduct = products.find(p => isMatch(gameName, p));
                        if (matchProduct) {
                            return {
                                available: matchProduct.available,
                                price: matchProduct.price,
                                url: matchProduct.url
                            };
                        }
                    }
                    return null;
                }
            },
            screenFreeGames: {
                type: 'shopify',
                baseUrl: 'https://screenfreegames.com',
                currencySymbol: '$'
            },
            allSystemsGo: {
                type: 'shopify',
                baseUrl: 'https://allsystemsgo.games',
                currencySymbol: '$'
            },
            tabletopCafe: {
                type: 'shopify',
                baseUrl: 'https://www.tabletopcafe.ca',
                currencySymbol: '$'
            },
            elevatedBoardGames: {
                type: 'html',
                url: async (game) => await getElevatedBoardGamesProductUrl(game.name),
                parser: (html, gameName, targetUrl) => parseElevatedBoardGames(html, gameName, targetUrl)
            },
            diceHollow: {
                type: 'shopify',
                baseUrl: 'https://www.dicehollow.com',
                currencySymbol: '$'
            },
            zatu: {
                type: 'shopify',
                baseUrl: 'https://zatu.com',
                currencySymbol: '£'
            },
            philibert: {
                type: 'custom',
                checker: async (game, existingStoreData) => {
                    return await checkPhilibertStock(game.name);
                }
            },
            bggMarket: {
                type: 'json',
                url: (game) => `https://api.geekdo.com/api/market/products?ajax=1&browsetype=browse&country=CA&marketdomain=boardgame&nosession=1&objectid=${game.objectId}&objecttype=thing&pageid=1&productstate=active&stock=instock`,
                parser: (res, gameName, targetUrl, existingStoreData) => {
                    if (res?.products && Array.isArray(res.products) && res.products.length > 0) {
                        // Only Canadian sellers
                        const caProducts = res.products.filter(p => p.itemlocation_code === 'CA' || p.itemlocation === 'Canada');
                        
                        // Filter out sellers in skippedSellers list (case-insensitive) and listings <= $5.0
                        const allowedProducts = caProducts.filter(p => {
                            const sellerName = p.linkeduser?.username;
                            if (!sellerName) return false;
                            if (skippedSellers.some(s => s.toLowerCase() === sellerName.toLowerCase())) return false;
                            if (isPriceUnderThreshold(p.price)) return false;
                            return true;
                        });

                        if (allowedProducts.length > 0) {
                            const sorted = [...allowedProducts].sort((a, b) => parseFloat(a.price) - parseFloat(b.price));
                            const existingListings = Array.isArray(existingStoreData?.listings) ? existingStoreData.listings : [];

                            const listings = sorted.map(match => {
                                const symbol = match.currencysymbol || '$';
                                const seller = match.linkeduser?.username || 'Unknown';

                                const existing = existingListings.find(l => l.seller && l.seller.toLowerCase() === seller.toLowerCase());
                                const firstSeen = existing?.firstSeen || new Date().toISOString();

                                const isIgnored = isPriceUnderThreshold(match.price);

                                return {
                                    price: `${symbol}${match.price} ${match.currency}`,
                                    seller: seller,
                                    condition: match.prettycondition || '',
                                    url: `https://boardgamegeek.com${match.producthref}`,
                                    firstSeen: firstSeen,
                                    ignored: isIgnored
                                };
                            });

                            const activeListings = listings.filter(l => !l.ignored);

                            if (activeListings.length > 0) {
                                const primary = activeListings[0];
                                return {
                                    available: true,
                                    price: primary.price,
                                    url: primary.url,
                                    listings: listings
                                };
                            } else {
                                return {
                                    available: false,
                                    price: null,
                                    url: null,
                                    listings: listings
                                };
                            }
                        }
                    }
                    return null;
                }
            },
            buttonShyEtsy: {
                type: 'custom',
                checker: async (game, existingStoreData) => {
                    const apiKey = process.env.ETSY_API_KEY;
                    if (!apiKey) {
                        return existingStoreData || { available: false, price: null, url: 'https://www.etsy.com/shop/ButtonShyGames' };
                    }
                    const listings = await fetchButtonShyEtsyListings(apiKey);
                    if (!listings || listings.length === 0) {
                        return { available: false, price: null, url: 'https://www.etsy.com/shop/ButtonShyGames' };
                    }
                    
                    const match = listings.find(l => {
                        const title = l.title || '';
                        return isMatch(game.name, { title: title });
                    });
                    
                    if (match && (match.quantity > 0 || match.state === 'active')) {
                        const priceNum = match.price ? (match.price.amount / (match.price.divisor || 100)).toFixed(2) : null;
                        const currency = match.price?.currency_code || 'USD';
                        const priceStr = priceNum ? `$${priceNum} ${currency}` : null;
                        return {
                            available: true,
                            price: priceStr,
                            url: match.url || `https://www.etsy.com/listing/${match.listing_id}`
                        };
                    }
                    
                    return {
                        available: false,
                        price: null,
                        url: 'https://www.etsy.com/shop/ButtonShyGames'
                    };
                }
            }
        };

        const availability = {};
        const fetchPromises = [];
        const storeKeys = Object.keys(storeConfigs);
        const skippedStores = [];

        for (const storeKey of storeKeys) {
            // For games that are "Want in Trade" only (not "Want to Buy"), check stock ONLY in bggMarket
            if (game.isWantInTrade && !game.isWantToBuy && storeKey !== 'bggMarket') {
                continue;
            }

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
                let available = existingStoreData.available ?? false;
                if (available && isPriceUnderThreshold(existingStoreData.price)) {
                    available = false;
                }
                let listings = existingStoreData.listings;
                if (Array.isArray(listings)) {
                    listings = listings.map(l => {
                        if (isPriceUnderThreshold(l.price)) return { ...l, ignored: true };
                        return l;
                    });
                    const activeListings = listings.filter(l => !l.ignored);
                    if (activeListings.length === 0) available = false;
                }
                const { baselinePrice, deal } = computeDealInfo(existingStoreData.price, existingStoreData.url, available, existingStoreData);
                availability[storeKey] = {
                    available,
                    price: existingStoreData.price ?? null,
                    baselinePrice: baselinePrice ?? null,
                    ...(deal ? { deal } : {}),
                    url: existingStoreData.url ?? null,
                    ...(listings ? { listings } : {}),
                    lastChecked: existingStoreData.lastChecked,
                    lastCheckSuccess: existingStoreData.lastCheckSuccess ?? true
                };
            } else {
                const fetchPromise = (async () => {
                    try {
                        let resultObj = null;

                        if (config.type === 'shopify') {
                            resultObj = await fetchShopifyStore(config.baseUrl, query, game.name, config.currencySymbol || '$');
                        } else if (config.type === 'custom' && typeof config.checker === 'function') {
                            resultObj = await config.checker(game, existingStoreData);
                        } else {
                            const targetUrl = typeof config.url === 'function' ? await config.url(game) : config.url;
                            if (!targetUrl) {
                                resultObj = { available: false, price: null, url: null };
                            } else if (config.type === 'puppeteer') {
                                const pResult = await fetchAmazonWithPuppeteer(game.name);
                                resultObj = pResult || { available: false, price: null, url: targetUrl };
                            } else {
                                const res = config.type === 'json' 
                                    ? await fetchJson(targetUrl)
                                    : await fetchHtml(targetUrl);

                                if (res === null) {
                                    throw new Error(`Fetch returned null (timeout/error)`);
                                }
                                resultObj = config.parser(res, game.name, targetUrl, existingStoreData);
                            }
                        }

                        if (resultObj) {
                            let available = Boolean(resultObj.available);
                            let price = resultObj.price ?? null;
                            let url = resultObj.url ?? null;
                            let listings = resultObj.listings;

                            if (available && isPriceUnderThreshold(price)) {
                                available = false;
                            }

                            if (Array.isArray(listings)) {
                                listings = listings.map(l => {
                                    if (isPriceUnderThreshold(l.price)) return { ...l, ignored: true };
                                    return l;
                                });
                                const activeListings = listings.filter(l => !l.ignored);
                                if (activeListings.length === 0) available = false;
                            }

                            const { baselinePrice, deal } = computeDealInfo(price, url, available, existingStoreData);

                            availability[storeKey] = {
                                available,
                                price,
                                baselinePrice: baselinePrice ?? null,
                                ...(deal ? { deal } : {}),
                                url,
                                ...(listings ? { listings } : {}),
                                lastChecked: new Date().toISOString(),
                                lastCheckSuccess: true
                            };
                        } else {
                            availability[storeKey] = {
                                available: false,
                                price: null,
                                baselinePrice: existingStoreData?.baselinePrice ?? null,
                                url: null,
                                lastChecked: new Date().toISOString(),
                                lastCheckSuccess: true
                            };
                        }
                    } catch (err) {
                        let available = existingStoreData?.available ?? false;
                        if (available && isPriceUnderThreshold(existingStoreData?.price)) {
                            available = false;
                        }
                        availability[storeKey] = {
                            available,
                            price: existingStoreData?.price ?? null,
                            baselinePrice: existingStoreData?.baselinePrice ?? null,
                            ...(existingStoreData?.deal ? { deal: existingStoreData.deal } : {}),
                            url: existingStoreData?.url ?? null,
                            ...(existingStoreData?.listings ? { listings: existingStoreData.listings } : {}),
                            lastChecked: existingStoreData?.lastChecked ?? null,
                            lastCheckSuccess: false
                        };
                    }
                })();
                fetchPromises.push(fetchPromise);
            }
        }

        if (game.isWantInTrade && !game.isWantToBuy) {
            console.log(`[${i+1}/${wantedGames.length}] "${game.name}" (Want in Trade only): Checking BGG Market only...`);
        } else if (skippedStores.length > 0) {
            console.log(`[${i+1}/${wantedGames.length}] "${game.name}": skipped ${skippedStores.length} stores checked within 6 hours. Checking remaining ${fetchPromises.length} stores...`);
        } else {
            console.log(`[${i+1}/${wantedGames.length}] "${game.name}": Checking all ${storeKeys.length} stores...`);
        }

        if (fetchPromises.length > 0) {
            await Promise.all(fetchPromises);
        }

        availabilityData[game.objectId] = availability;
        
        // Politeness delay
        if (fetchPromises.length > 0) {
            await new Promise(r => setTimeout(r, POLITENESS_DELAY_MS));
        }
    }

    if (globalBrowser) {
        try {
            await globalBrowser.close();
        } catch (_) {}
    }

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(availabilityData, null, 2), 'utf8');
    console.log(`Availability check finished. Saved results to ${OUTPUT_FILE}`);
}

checkAvailability().catch(err => {
    console.error('Fatal error during availability check:', err);
});
