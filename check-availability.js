const fs = require('fs');
const path = require('path');
const https = require('https');
const zlib = require('zlib');

const isLikeToHave = process.argv.includes('--like-to-have') || process.argv.includes('--liketohave') || process.env.CHECK_TYPE === 'liketohave';
const COLLECTION_FILE = 'collection.xml';
const OUTPUT_FILE = isLikeToHave ? 'availability-liketohave.json' : 'availability.json';
const POLITENESS_DELAY_MS = parseInt(process.env.CHECK_DELAY_MS || '5000', 10);
const MIN_PRICE_THRESHOLD = 5.0; // Ignore/treat items priced <= 5 as out of stock / erroneous match

// --- RUN LOGGING & MONITORING SETUP ---
const RUNLOGS_DIR = path.join(__dirname, 'runlogs');
if (!fs.existsSync(RUNLOGS_DIR)) {
    fs.mkdirSync(RUNLOGS_DIR, { recursive: true });
}

function getFormattedTimestamp() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}_${pad(d.getUTCHours())}-${pad(d.getUTCMinutes())}-${pad(d.getUTCSeconds())}Z`;
}

const runType = isLikeToHave ? 'liketohave' : 'wanttobuy';
const logFileName = `${getFormattedTimestamp()}_${runType}.log`;
const logFilePath = path.join(RUNLOGS_DIR, logFileName);
const logStream = fs.createWriteStream(logFilePath, { flags: 'a' });

// Automatically prune logs older than 14 days to keep repo size healthy
function pruneOldLogs(maxDays = 14) {
    try {
        const cutoff = Date.now() - (maxDays * 24 * 60 * 60 * 1000);
        const files = fs.readdirSync(RUNLOGS_DIR);
        for (const file of files) {
            if (file.endsWith('.log')) {
                const p = path.join(RUNLOGS_DIR, file);
                const stat = fs.statSync(p);
                if (stat.mtimeMs < cutoff) {
                    fs.unlinkSync(p);
                }
            }
        }
    } catch (_) {}
}
pruneOldLogs(14);

// Tee console output to log file with timestamps
const origLog = console.log;
const origWarn = console.warn;
const origError = console.error;

function formatLogEntry(level, args) {
    const iso = new Date().toISOString();
    const text = args.map(a => {
        if (typeof a === 'object' && a !== null) {
            try { return JSON.stringify(a); } catch (_) { return String(a); }
        }
        return String(a);
    }).join(' ');
    return `[${iso}] [${level}] ${text}\n`;
}

console.log = (...args) => {
    origLog(...args);
    logStream.write(formatLogEntry('INFO', args));
};
console.warn = (...args) => {
    origWarn(...args);
    logStream.write(formatLogEntry('WARN', args));
};
console.error = (...args) => {
    origError(...args);
    logStream.write(formatLogEntry('ERROR', args));
};

const runStats = {
    startTime: Date.now(),
    storesChecked: 0,
    storesSkipped: 0,
    total429s: 0,
    rateLimitsByHost: {},
    failuresByStore: {},

    record429(hostname, waitSec, headers) {
        this.total429s++;
        if (!this.rateLimitsByHost[hostname]) {
            this.rateLimitsByHost[hostname] = {
                count: 0,
                totalWaitSec: 0,
                lastHeaders: null
            };
        }
        this.rateLimitsByHost[hostname].count++;
        this.rateLimitsByHost[hostname].totalWaitSec += waitSec;
        this.rateLimitsByHost[hostname].lastHeaders = headers;
    },

    recordFailure(storeKey, errorMsg) {
        if (!this.failuresByStore[storeKey]) {
            this.failuresByStore[storeKey] = { count: 0, lastError: errorMsg };
        }
        this.failuresByStore[storeKey].count++;
        this.failuresByStore[storeKey].lastError = errorMsg;
    },

    printSummary(gameCount) {
        const elapsedSec = Math.round((Date.now() - this.startTime) / 1000);
        const mins = Math.floor(elapsedSec / 60);
        const secs = elapsedSec % 60;
        console.log('\n' + '='.repeat(60));
        console.log(`RUN SUMMARY: ${runType.toUpperCase()}`);
        console.log('-'.repeat(60));
        console.log(`Log File:              runlogs/${logFileName}`);
        console.log(`Timestamp (UTC):       ${new Date().toISOString()}`);
        console.log(`Duration:              ${mins}m ${secs}s`);
        console.log(`Games Evaluated:       ${gameCount}`);
        console.log(`Store Checks Made:     ${this.storesChecked}`);
        console.log(`Store Checks Skipped:  ${this.storesSkipped} (6-hour cache)`);
        console.log(`Total 429 Events:      ${this.total429s}`);

        if (Object.keys(this.rateLimitsByHost).length > 0) {
            console.log('\n429 Rate Limits by Host:');
            for (const [host, data] of Object.entries(this.rateLimitsByHost)) {
                console.log(`  - ${host}: ${data.count} hits (total backoff: ${data.totalWaitSec}s, last headers: ${JSON.stringify(data.lastHeaders)})`);
            }
        }

        if (Object.keys(this.failuresByStore).length > 0) {
            console.log('\nStore Fetch Failures:');
            for (const [store, data] of Object.entries(this.failuresByStore)) {
                console.log(`  - ${store}: ${data.count} failures (last error: ${data.lastError})`);
            }
        }
        console.log('='.repeat(60) + '\n');
    }
};

const GAME_ALIASES = {
    'Back to the Future: Back in Time': ['Back to the Future']
};

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

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

let shopifyGlobalCooldownUntil = 0;

async function waitForShopifyCooldown() {
    const now = Date.now();
    if (shopifyGlobalCooldownUntil > now) {
        const waitMs = shopifyGlobalCooldownUntil - now;
        console.log(`[Shopify Cooldown] Pausing ${(waitMs / 1000).toFixed(1)}s to respect rate limits...`);
        await sleep(waitMs);
    }
}

// Helper to make HTTPS requests in Node and automatically follow redirects (JSON response)
function fetchJson(url, redirectCount = 0, customHeaders = {}, retryCount = 0) {
    if (redirectCount > 5) {
        console.error(`Too many redirects for: ${url}`);
        return Promise.resolve(null);
    }
    return new Promise(async (resolve, reject) => {
        const u = new URL(url);
        const isShopify = url.includes('/search/suggest.json');
        if (isShopify) {
            await waitForShopifyCooldown();
        }

        const options = {
            hostname: u.hostname,
            path: u.pathname + u.search,
            headers: {
                ...DEFAULT_HEADERS,
                'Accept': 'application/json, text/plain, */*',
                'Sec-Fetch-Dest': 'empty',
                'Sec-Fetch-Mode': 'cors',
                ...customHeaders
            },
            timeout: 12000 // 12 seconds timeout
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
                    fetchJson(redirectUrl, redirectCount + 1, customHeaders, retryCount).then(resolve).catch(reject);
                }
                return;
            }

            if (res.statusCode === 429 && retryCount < 3) {
                res.resume();
                req.destroy();
                let waitSec = 20 * Math.pow(2, retryCount);
                if (res.headers['retry-after']) {
                    const parsed = parseInt(res.headers['retry-after'], 10);
                    if (!isNaN(parsed) && parsed > 0) {
                        waitSec = Math.min(120, parsed);
                    }
                }
                if (isShopify) {
                    shopifyGlobalCooldownUntil = Date.now() + (waitSec * 1000);
                }
                const retryAfter = res.headers['retry-after'] || null;
                const cfRay = res.headers['cf-ray'] || null;
                const reqId = res.headers['x-request-id'] || null;
                const server = res.headers['server'] || null;
                const shopApiLimit = res.headers['x-shopify-shop-api-call-limit'] || null;
                runStats.record429(u.hostname, waitSec, { retryAfter, cfRay, reqId, server, shopApiLimit });
                console.warn(`[429 RATE LIMIT] Rate limited on ${u.hostname} (retry ${retryCount + 1}/3). Backing off for ${waitSec}s... [server=${server || 'unknown'}, retry-after=${retryAfter || 'none'}, cf-ray=${cfRay || 'none'}]`);
                if (!resolved) {
                    resolved = true;
                    sleep(waitSec * 1000).then(() => {
                        return fetchJson(url, redirectCount, customHeaders, retryCount + 1);
                    }).then(resolve).catch(reject);
                }
                return;
            }

            if (res.statusCode !== 200) {
                console.warn(`[WARNING] fetchJson failed for ${url} with status: ${res.statusCode}`);
                res.resume();
                req.destroy();
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
            console.error(`[ERROR] Timeout (12s) fetching JSON from: ${url}`);
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


// Helper to make HTTPS requests in Node and automatically follow redirects and Akamai challenges (HTML response)
function fetchHtml(url, redirectCount = 0, cookieHeader = '', retryCount = 0) {
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
            timeout: 12000 // 12 seconds timeout
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
                    fetchHtml(redirectUrl, redirectCount + 1, newCookies, retryCount).then(resolve).catch(reject);
                }
                return;
            }

            if (res.statusCode === 429 && retryCount < 3) {
                res.resume();
                req.destroy();
                let waitSec = 20 * Math.pow(2, retryCount);
                if (res.headers['retry-after']) {
                    const parsed = parseInt(res.headers['retry-after'], 10);
                    if (!isNaN(parsed) && parsed > 0) {
                        waitSec = Math.min(120, parsed);
                    }
                }
                const retryAfter = res.headers['retry-after'] || null;
                const cfRay = res.headers['cf-ray'] || null;
                const reqId = res.headers['x-request-id'] || null;
                const server = res.headers['server'] || null;
                runStats.record429(u.hostname, waitSec, { retryAfter, cfRay, reqId, server });
                console.warn(`[429 RATE LIMIT] Rate limited on ${u.hostname} (retry ${retryCount + 1}/3). Backing off for ${waitSec}s... [server=${server || 'unknown'}, retry-after=${retryAfter || 'none'}, cf-ray=${cfRay || 'none'}]`);
                if (!resolved) {
                    resolved = true;
                    sleep(waitSec * 1000).then(() => {
                        return fetchHtml(url, redirectCount, newCookies, retryCount + 1);
                    }).then(resolve).catch(reject);
                }
                return;
            }

            if (res.statusCode !== 200) {
                console.warn(`[WARNING] fetchHtml failed for ${url} with status: ${res.statusCode}`);
                res.resume();
                req.destroy();
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

function parseKbHobbies(res, gameName) {
    const items = res?.data;
    if (!items || !Array.isArray(items) || items.length === 0) return null;
    const products = items.map(item => ({
        title: item.name,
        type: '',
        available: Boolean((item.inventory?.total > 0 || item.inventory?.all_inventory_total > 0) && !item.badges?.out_of_stock && !item.inventory?.all_variations_sold_out),
        price: item.price?.regular_high_formatted || item.price?.high_formatted || (item.price?.high ? `$${item.price.high}` : null),
        url: item.absolute_site_link || (item.site_link ? `https://www.kbhobbies.com/${item.site_link.replace(/^\//, '')}` : null)
    }));
    const match = products.find(p => isMatch(gameName, p));
    if (match) {
        return {
            available: match.available,
            price: match.price,
            url: match.url
        };
    }
    return null;
}

async function fetchKbHobbies(gameName) {
    const clean = cleanName(gameName);
    const queries = [clean];
    const withoutArticle = clean.replace(/^(the|a|an)\s+/i, '');
    if (withoutArticle !== clean && !queries.includes(withoutArticle)) {
        queries.push(withoutArticle);
    }
    const aliases = GAME_ALIASES[gameName] || GAME_ALIASES[clean] || [];
    for (const a of aliases) {
        if (!queries.includes(a)) queries.push(a);
    }

    for (let qi = 0; qi < queries.length; qi++) {
        if (qi > 0) await sleep(200);
        const q = queries[qi];
        let page = 1;
        let totalPages = 1;
        while (page <= totalPages && page <= 3) {
            if (page > 1) await sleep(200);
            const url = `https://cdn5.editmysite.com/app/store/api/v28/editor/users/151297753/sites/680972496472648272/products?q=${encodeURIComponent(q)}&per_page=200&page=${page}`;
            const res = await fetchJson(url);
            if (res !== null) {
                const match = parseKbHobbies(res, gameName);
                if (match) return match;
                totalPages = res?.meta?.pagination?.total_pages || 1;
            } else {
                break;
            }
            page++;
        }
    }
    return { available: false, price: null, url: null };
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

function isMatch(bggName, shopifyProduct) {
    if (!bggName || !shopifyProduct) return false;
    const shopifyTitle = decodeXmlEntities(shopifyProduct.title || '');
    const shopifyType = shopifyProduct.type || '';
    
    const cleanBgg = cleanName(bggName) || '';
    const normalize = str => (str || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const nBgg = normalize(cleanBgg);
    const nShopify = normalize(shopifyTitle);

    // 1. Check product type: filter out obvious non-game categories
    const lowerType = shopifyType.toLowerCase();
    const disallowedTypes = ['diecast', 'model', 'accessory', 'accessories', 'paint', 'sleeve', 'sleeves', 'insert', 'organizer', 'organiser', 'playmat', 'mat', 'dice', 'token', 'tokens', 'tcg', 'booster', 'singles', 'single', 'acrylic', 'miniature', 'miniatures', 'puzzle', 'puzzles'];
    if (disallowedTypes.some(type => lowerType.includes(type))) {
        return false;
    }

    // 2. Filter out keywords in Shopify title that are NOT in BGG title
    const disallowedKeywords = ['diecast', 'die-cast', '1/32', '1/24', '1/18', 'keyring', 'plush', 'action figure', 'pop! vinyl', 'insert', 'organizer', 'organiser', 'playmat', 'promo', 'paint', 'sleeves', 'token', 'coins', 'upgrade', 'expansion', 'booster', 'tcg', 'sleeved', 'sleeve-pack', 'acrylic-tokens', 'puzzle', 'puzzles', '1000pc', '1000pcs', '1000-piece', '1000 piece', 'dry erase', 'dry-erase'];
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

    for (let qi = 0; qi < queries.length; qi++) {
        if (qi > 0) {
            await sleep(350);
        }
        const q = queries[qi];
        const suggestUrl = `${baseUrl}/search/suggest.json?q=${encodeURIComponent(q)}&resources[type]=product`;
        const suggestRes = await fetchJson(suggestUrl);
        
        if (suggestRes !== null) {
            hadSuccessfulResponse = true;
            if (suggestRes?.resources?.results?.products?.length > 0) {
                const match = findBestShopifyMatch(suggestRes.resources.results.products, gameName);
                if (match) {
                    let priceVal = match.price;
                    if (baseUrl.includes('zatu.com') && match.handle) {
                        try {
                            const prodData = await fetchJson(`${baseUrl}/products/${match.handle}.json`);
                            if (prodData?.product?.variants?.[0]?.price) {
                                priceVal = prodData.product.variants[0].price;
                            }
                        } catch (_) {}
                    }
                    let price = priceVal ? (String(priceVal).startsWith(currencySymbol) ? String(priceVal) : `${currencySymbol}${priceVal}`) : null;
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

// Parser for Cardhaus HTML
function parseCardhaus(html, gameName) {
    if (!html) return null;
    const articles = [...html.matchAll(/<article[\s\S]*?<\/article>/g)];
    const products = [];

    for (const artMatch of articles) {
        const art = artMatch[0];
        if (art.includes('${p.id}') || art.includes('${p.name}')) continue;

        const nameMatch = art.match(/data-name="([^"]+)"/) ||
                          art.match(/class="card-title"[^>]*>[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/);
        const title = nameMatch ? decodeXmlEntities(nameMatch[1].trim()) : null;
        if (!title) continue;

        const categoryMatch = art.match(/data-product-category="([^"]+)"/);
        const type = categoryMatch ? categoryMatch[1].trim() : 'Board Games';

        const urlMatch = art.match(/<a\s+[^>]*class="card-figure__link"[^>]*href="([^"]+)"/) ||
                         art.match(/class="card-title"[^>]*>[\s\S]*?<a\s+[^>]*href="([^"]+)"/);
        let url = urlMatch ? decodeXmlEntities(urlMatch[1]) : null;
        if (url) {
            try {
                const pu = new URL(url);
                pu.search = '';
                url = pu.toString();
            } catch (_) {}
        }

        const priceMatch = art.match(/data-product-price-without-tax class="price">([^<]+)<\/span>/) ||
                           art.match(/data-product-price="([^"]+)"/) ||
                           art.match(/class="price price--withoutTax"[^>]*>([^<]+)<\/span>/);
        let price = priceMatch ? priceMatch[1].trim() : null;
        if (price && !price.startsWith('$')) price = `$${price}`;

        const hasAddToCart = /Add to Cart/i.test(art) || /button-type="add-cart"/i.test(art);
        const isNotify = /Notify Me When In Stock/i.test(art);
        const available = hasAddToCart && !isNotify;

        products.push({
            title,
            type,
            price,
            url,
            available
        });
    }

    return findBestShopifyMatch(products, gameName);
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
        if (!html) throw new Error(`Failed to fetch Philibert HTML for ${gameName}`);

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
        throw err;
    }
}

function fetchJsonPost(url, postData, customHeaders = {}) {
    return new Promise((resolve) => {
        const u = new URL(url);
        const options = {
            hostname: u.hostname,
            path: u.pathname + u.search,
            method: 'POST',
            headers: {
                ...DEFAULT_HEADERS,
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData),
                ...customHeaders
            },
            timeout: 10000
        };
        const req = https.request(options, (res) => {
            if (res.statusCode !== 200) return resolve(null);
            let data = '';
            const stream = getDecompressedStream(res);
            stream.on('data', chunk => { data += chunk; });
            stream.on('end', () => {
                try { resolve(JSON.parse(data)); } catch (_) { resolve(null); }
            });
            stream.on('error', () => resolve(null));
        });
        req.on('timeout', () => { req.destroy(); resolve(null); });
        req.on('error', () => resolve(null));
        req.write(postData);
        req.end();
    });
}

function isMatchCrowdfinder(bggName, product) {
    const title = decodeXmlEntities(product.name || '');
    const cleanBgg = cleanName(bggName);
    const normalize = str => str.toLowerCase().replace(/[^a-z0-9]/g, '');
    const nBgg = normalize(cleanBgg);
    const nTitle = normalize(title);

    const disallowedKeywords = ['promo', 'expansion', 'extension', 'insert', 'organizer', 'playmat', 'sleeves', 'upgrade', 'mug', 'kids', 'mini-expansion', 'mat', 'tokens', 'coins'];
    for (const kw of disallowedKeywords) {
        if (title.toLowerCase().includes(kw) && !cleanBgg.toLowerCase().includes(kw)) {
            return false;
        }
    }

    if (nBgg === nTitle) return true;

    const wordsBgg = cleanBgg.toLowerCase().split(/\s+/).filter(Boolean);
    const wordsTitle = title.toLowerCase().split(/\s+/).filter(Boolean);

    if (wordsBgg.length === 1 && wordsTitle.length > 1) {
        return normalize(wordsBgg[0]) === normalize(wordsTitle[0]);
    }

    const allWordsPresent = wordsBgg.every(wb => wordsTitle.some(wt => wt === wb || normalize(wt) === normalize(wb)));
    if (!allWordsPresent) return false;

    return true;
}

async function checkCrowdfinderStock(gameName) {
    try {
        const q = cleanName(gameName);
        const postData = JSON.stringify({ search: q });
        const res = await fetchJsonPost('https://www.crowdfinder.be/api/crowdfinder/product', postData);
        if (res === null) {
            throw new Error(`Failed to fetch Crowdfinder API for ${gameName}`);
        }
        const products = res?.data || [];
        if (!products.length) return { available: false, price: null, url: null };
        const match = products.find(p => isMatchCrowdfinder(gameName, p));
        if (match) {
            const priceNum = match.reduced_price || match.price;
            if (isPriceUnderThreshold(priceNum)) return { available: false, price: null, url: null };
            const slug = (match.name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
            return {
                available: (match.stock > 0),
                price: priceNum ? `€${Number(priceNum).toFixed(2)}` : null,
                url: `https://www.crowdfinder.be/product/${match.id}-${slug}`
            };
        }
        return { available: false, price: null, url: null };
    } catch (err) {
        throw err;
    }
}


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

function getStoreConfigs(skippedSellers = []) {
    return {
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
            url: (game, query) => `https://www.greatboardgames.ca/search?q=${encodeURIComponent(query)}`,
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
            url: (game, query) => `https://www.meeplemart.com/store/Search.aspx?SearchTerms=${encodeURIComponent(query)}`,
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
            checker: async (game) => await fetchKbHobbies(game.name)
        },
        miniatureMarket: {
            type: 'html',
            url: (game, query) => `https://www.miniaturemarket.com/search?search=${encodeURIComponent(query)}`,
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
        cardhaus: {
            type: 'html',
            url: (game, query) => `https://www.cardhaus.com/search.php?search_query=${encodeURIComponent(query)}&setCurrencyId=1`,
            parser: (html, gameName) => {
                const match = parseCardhaus(html, gameName);
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
        theGameSteward: {
            type: 'shopify',
            baseUrl: 'https://thegamesteward.com',
            currencySymbol: '$'
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
            url: (game, query) => `https://app.ecwid.com/api/v3/122261030/products?keyword=${encodeURIComponent(query)}&token=public_w37fvtk2kUVuY6X7N2TdhZFLqVLKs68j`,
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
        laPioche: {
            type: 'shopify',
            baseUrl: 'https://boutiquelapioche.com',
            currencySymbol: '$'
        },
        alwaysGames: {
            type: 'shopify',
            baseUrl: 'https://alwaysgames.ca',
            currencySymbol: '$'
        },
        legendsWarehouse: {
            type: 'shopify',
            baseUrl: 'https://legendswarehouse.ca',
            currencySymbol: '$'
        },
        boardGameBandit: {
            type: 'shopify',
            baseUrl: 'https://boardgamebandit.ca',
            currencySymbol: '$'
        },
        crowdfinder: {
            type: 'custom',
            checker: async (game, existingStoreData) => {
                return await checkCrowdfinderStock(game.name);
            }
        },
        chaosCards: {
            type: 'custom',
            checker: async (game, existingStoreData) => {
                return await checkChaosCardsStock(game.name);
            }
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
        }
    };
}

async function checkAvailability() {
    console.log(`Starting ${isLikeToHave ? 'like to have games' : 'board game'} availability check...`);
    if (!fs.existsSync(COLLECTION_FILE)) {
        console.error('collection.xml not found.');
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
    }
    if (!Array.isArray(skippedSellers)) skippedSellers = [];
    console.log(`Loaded ${skippedSellers.length} skipped seller(s).`);

    const wantedGames = [];

    if (isLikeToHave) {
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
                const isLike = isWishlist && /wishlistpriority="3"/.test(statusStr);
                if (isLike) {
                    const nameMatch = /<name[^>]*>([^<]+)<\/name>/.exec(itemContent);
                    if (nameMatch) {
                        wantedGames.push({
                            objectId,
                            name: decodeXmlEntities(nameMatch[1].trim()),
                            isWantToBuy: true,
                            isWantInTrade: false,
                            isLikeToHave: true
                        });
                    }
                }
            }
        }
        console.log(`Found ${wantedGames.length} games in Like to Have list.`);
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

    let availabilityData = {};
    const activeIds = new Set(wantedGames.map(g => g.objectId));
    for (const id of activeIds) {
        if (existingData[id]) {
            availabilityData[id] = existingData[id];
        }
    }

    const storeConfigs = getStoreConfigs(skippedSellers);
    const storeKeys = Object.keys(storeConfigs);

    for (let i = 0; i < wantedGames.length; i++) {
        const game = wantedGames[i];
        const query = cleanName(game.name);

        const availability = {};
        const fetchPromises = [];
        const skippedStores = [];
        let shopifyStoreIndex = 0;

        for (const storeKey of storeKeys) {
            // For games that are "Want in Trade" only (not "Want to Buy"), check stock ONLY in bggMarket
            if (game.isWantInTrade && !game.isWantToBuy && storeKey !== 'bggMarket') {
                continue;
            }

            const config = storeConfigs[storeKey];
            const existingStoreData = existingData[game.objectId]?.[storeKey];

            // Skip fetching if checked within the last 6 hours (regardless of whether in-stock or out-of-stock).
            let shouldFetch = true;
            if (existingStoreData && existingStoreData.lastChecked && existingStoreData.lastCheckSuccess !== false) {
                const lastCheckedTime = new Date(existingStoreData.lastChecked).getTime();
                const sixHoursAgo = Date.now() - (6 * 60 * 60 * 1000);
                if (lastCheckedTime > sixHoursAgo) {
                    shouldFetch = false;
                }
            }

            if (!shouldFetch) {
                runStats.storesSkipped++;
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
                runStats.storesChecked++;
                const staggerDelay = config.type === 'shopify' ? (shopifyStoreIndex++ * 150) : 0;
                const fetchPromise = (async () => {
                    if (staggerDelay > 0) {
                        await sleep(staggerDelay);
                    }
                    try {
                        let resultObj = null;

                        if (config.type === 'shopify') {
                            resultObj = await fetchShopifyStore(config.baseUrl, query, game.name, config.currencySymbol || '$');
                        } else if (config.type === 'custom' && typeof config.checker === 'function') {
                            resultObj = await config.checker(game, existingStoreData);
                        } else {
                            const targetUrl = typeof config.url === 'function' ? await config.url(game, query) : config.url;
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
                        runStats.recordFailure(storeKey, err.message);
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
        
        // Incremental save every 5 games
        if ((i + 1) % 5 === 0 || i === wantedGames.length - 1) {
            try {
                fs.writeFileSync(OUTPUT_FILE, JSON.stringify(availabilityData, null, 2), 'utf8');
            } catch (_) {}
        }

        // Politeness delay
        if (fetchPromises.length > 0) {
            await new Promise(r => setTimeout(r, POLITENESS_DELAY_MS));
        }
    }

    if (globalBrowser) {
        try {
            await globalBrowser.close();
            if (typeof globalBrowser.process === 'function' && globalBrowser.process()) {
                globalBrowser.process().kill('SIGKILL');
            }
        } catch (_) {}
    }

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(availabilityData, null, 2), 'utf8');
    console.log(`Availability check finished. Saved results to ${OUTPUT_FILE}`);
    runStats.printSummary(wantedGames.length);
    logStream.end(() => {
        process.exit(0);
    });
}

checkAvailability().catch(err => {
    console.error('Fatal error during availability check:', err);
    try {
        runStats.printSummary(0);
        logStream.end(() => {
            process.exit(1);
        });
    } catch (_) {
        process.exit(1);
    }
});
