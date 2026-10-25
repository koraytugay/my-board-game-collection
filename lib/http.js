// HTTPS fetching for store checks: redirects, decompression, 429 backoff and a shared Shopify cooldown.
const https = require('https');
const zlib = require('zlib');
const { sleep } = require('./util');
const { runStats } = require('./run-stats');

const DEFAULT_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Encoding': 'gzip, deflate, br',
    'Accept-Language': 'en-CA,en-US;q=0.9,en;q=0.8',
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

let shopifyGlobalCooldownUntil = 0;

const KNOWN_SHOPIFY_HOSTS = new Set([
    'www.boardgamebliss.com',
    'store.401games.ca',
    'www.lvlupgames.ca',
    'www.asdesjeux.com',
    'thegamesteward.com',
    'www.woodforsheep.ca',
    'screenfreegames.com',
    'allsystemsgo.games',
    'www.tabletopcafe.ca',
    'www.dicehollow.com',
    'boutiquelapioche.com',
    'alwaysgames.ca',
    'legendswarehouse.ca',
    'boardgamebandit.ca',
    'zatu.com'
]);

function isShopifyRequest(url, hostname) {
    if (url && (url.includes('/search/suggest.json') || url.includes('.myshopify.com'))) return true;
    if (hostname && KNOWN_SHOPIFY_HOSTS.has(hostname)) return true;
    return false;
}

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
        const isShopify = isShopifyRequest(url, u.hostname);
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
                const jitterMs = Math.floor(Math.random() * 2500);
                const totalWaitMs = (waitSec * 1000) + jitterMs;
                if (isShopify) {
                    shopifyGlobalCooldownUntil = Math.max(shopifyGlobalCooldownUntil, Date.now() + totalWaitMs);
                }
                const retryAfter = res.headers['retry-after'] || null;
                const cfRay = res.headers['cf-ray'] || null;
                const reqId = res.headers['x-request-id'] || null;
                const server = res.headers['server'] || null;
                const shopApiLimit = res.headers['x-shopify-shop-api-call-limit'] || null;
                runStats.record429(u.hostname, waitSec, { retryAfter, cfRay, reqId, server, shopApiLimit });
                console.warn(`[429 RATE LIMIT] Rate limited on ${u.hostname} (retry ${retryCount + 1}/3). Backing off for ${(totalWaitMs / 1000).toFixed(1)}s (incl. jitter)... [server=${server || 'unknown'}, retry-after=${retryAfter || 'none'}, cf-ray=${cfRay || 'none'}]`);
                if (!resolved) {
                    resolved = true;
                    sleep(totalWaitMs).then(async () => {
                        if (isShopify) {
                            await waitForShopifyCooldown();
                        }
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
                const jitterMs = Math.floor(Math.random() * 2500);
                const totalWaitMs = (waitSec * 1000) + jitterMs;
                const retryAfter = res.headers['retry-after'] || null;
                const cfRay = res.headers['cf-ray'] || null;
                const reqId = res.headers['x-request-id'] || null;
                const server = res.headers['server'] || null;
                runStats.record429(u.hostname, waitSec, { retryAfter, cfRay, reqId, server });
                console.warn(`[429 RATE LIMIT] Rate limited on ${u.hostname} (retry ${retryCount + 1}/3). Backing off for ${(totalWaitMs / 1000).toFixed(1)}s (incl. jitter)... [server=${server || 'unknown'}, retry-after=${retryAfter || 'none'}, cf-ray=${cfRay || 'none'}]`);
                if (!resolved) {
                    resolved = true;
                    sleep(totalWaitMs).then(() => {
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

module.exports = { DEFAULT_HEADERS, getDecompressedStream, KNOWN_SHOPIFY_HOSTS, isShopifyRequest, waitForShopifyCooldown, fetchJson, fetchHtml };
