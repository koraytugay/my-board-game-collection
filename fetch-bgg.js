const fs = require('fs');
const path = require('path');
const https = require('https');

const BGG_USER = process.env.BGG_USER || 'koraytugay';
const BGG_PASSWORD = process.env.BGG_PASSWORD || '';
const COLLECTION_FILE = path.join(__dirname, 'collection.xml');
const PLAYS_DIR = path.join(__dirname, 'plays');

const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

function writeFileAtomic(filePath, data) {
    const tmpPath = `${filePath}.tmp.${Date.now()}`;
    fs.writeFileSync(tmpPath, data, 'utf8');
    fs.renameSync(tmpPath, filePath);
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function fetchXmlWithRetry(url, name, maxRetries = 15, delayMs = 20000) {
    return new Promise(async (resolve) => {
        const headers = {
            'Accept': 'application/xml',
            'User-Agent': USER_AGENT
        };

        if (BGG_USER && BGG_PASSWORD) {
            headers['Cookie'] = `bggusername=${BGG_USER}; bggpassword=${BGG_PASSWORD}`;
        }

        console.log(`Starting fetch for ${name}...`);

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                const result = await new Promise((resAttempt) => {
                    const req = https.get(url, { headers, timeout: 30000 }, (res) => {
                        let data = '';
                        res.on('data', chunk => { data += chunk; });
                        res.on('end', () => {
                            resAttempt({ statusCode: res.statusCode, body: data });
                        });
                    });

                    req.on('timeout', () => {
                        req.destroy();
                        resAttempt({ statusCode: 0, body: '' });
                    });

                    req.on('error', (err) => {
                        resAttempt({ statusCode: 0, body: '', error: err });
                    });
                });

                if (result.statusCode === 200) {
                    if (result.body.includes('<items') || result.body.includes('<plays')) {
                        console.log(`SUCCESS: ${name} fetched correctly.`);
                        return resolve(result.body);
                    }
                } else if (result.statusCode === 202) {
                    console.log(`BGG is preparing ${name} (202). Sleeping ${delayMs / 1000}s... (Attempt ${attempt}/${maxRetries})`);
                } else {
                    console.log(`Unexpected status ${result.statusCode} for ${name}.`);
                }
            } catch (err) {
                console.error(`Error during fetch for ${name}:`, err.message);
            }

            if (attempt < maxRetries) {
                await sleep(delayMs);
            }
        }

        console.error(`FAILED: Could not fetch ${name} after ${maxRetries} attempts.`);
        resolve(null);
    });
}

function getMonthRange(year, month) {
    const y = year;
    const m = String(month).padStart(2, '0');
    const start = `${y}-${m}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const end = `${y}-${m}-${String(lastDay).padStart(2, '0')}`;
    const target = `${y}-${m}`;
    return { target, start, end };
}

async function run() {
    console.log(`========================================`);
    console.log(`  BGG Fetcher for user: ${BGG_USER}`);
    console.log(`========================================`);

    // Ensure plays directory exists
    if (!fs.existsSync(PLAYS_DIR)) {
        fs.mkdirSync(PLAYS_DIR, { recursive: true });
    }

    // 1. Fetch Collection Endpoints (wishlist=1 already returns all priorities)
    const collectionEndpoints = [
        { name: 'Wishlist Items', url: `https://boardgamegeek.com/xmlapi2/collection?username=${encodeURIComponent(BGG_USER)}&stats=1&wishlist=1` },
        { name: 'Want in Trade Items', url: `https://boardgamegeek.com/xmlapi2/collection?username=${encodeURIComponent(BGG_USER)}&stats=1&want=1` },
        { name: 'For Trade Items', url: `https://boardgamegeek.com/xmlapi2/collection?username=${encodeURIComponent(BGG_USER)}&stats=1&trade=1` },
        { name: 'Expansions', url: `https://boardgamegeek.com/xmlapi2/collection?username=${encodeURIComponent(BGG_USER)}&stats=1&subtype=boardgameexpansion` },
        { name: 'Base Games', url: `https://boardgamegeek.com/xmlapi2/collection?username=${encodeURIComponent(BGG_USER)}&stats=1&subtype=boardgame` }
    ];

    const itemMap = new Map();
    let allEndpointsSucceeded = true;

    for (const endpoint of collectionEndpoints) {
        const xml = await fetchXmlWithRetry(endpoint.url, endpoint.name);
        if (!xml) {
            console.error(`ERROR: Endpoint "${endpoint.name}" failed to fetch.`);
            allEndpointsSucceeded = false;
            break;
        }
        const matches = xml.match(/<item\b[\s\S]*?<\/item>/g) || [];
        for (const item of matches) {
            const idMatch = item.match(/objectid="(\d+)"/);
            if (idMatch) {
                const id = idMatch[1];
                if (!itemMap.has(id) || item.includes('fortrade="1"') || item.includes('wishlist="1"')) {
                    itemMap.set(id, item);
                }
            }
        }
        await sleep(2000);
    }

    if (!allEndpointsSucceeded) {
        throw new Error(`One or more collection endpoints failed to fetch. Preserving existing ${COLLECTION_FILE} without overwriting.`);
    }

    if (itemMap.size > 0) {
        const items = Array.from(itemMap.values());
        const xml = `<?xml version="1.0" encoding="utf-8"?><items totalitems="${items.length}">${items.join('\n')}</items>`;
        writeFileAtomic(COLLECTION_FILE, xml);
        console.log(`Successfully merged ${items.length} unique items into ${COLLECTION_FILE}`);
    } else {
        throw new Error(`Zero collection items retrieved. Preserving existing ${COLLECTION_FILE}.`);
    }

    // 2. Fetch Plays for Previous Month and Current Month (with full pagination)
    const now = new Date();
    const curYear = now.getUTCFullYear();
    const curMonth = now.getUTCMonth() + 1; // 1-12

    let prevYear = curYear;
    let prevMonth = curMonth - 1;
    if (prevMonth === 0) {
        prevMonth = 12;
        prevYear -= 1;
    }

    const prevRange = getMonthRange(prevYear, prevMonth);
    const curRange = getMonthRange(curYear, curMonth);

    const monthsToFetch = [prevRange, curRange];

    for (const m of monthsToFetch) {
        console.log(`Fetching plays for ${m.target} (${m.start} to ${m.end})...`);
        let page = 1;
        let totalPlays = null;
        const allPlayMatches = [];
        let rootAttributes = '';

        while (true) {
            const playsUrl = `https://boardgamegeek.com/xmlapi2/plays?username=${encodeURIComponent(BGG_USER)}&mindate=${m.start}&maxdate=${m.end}&page=${page}`;
            const playsXml = await fetchXmlWithRetry(playsUrl, `Plays for ${m.target} (page ${page})`);
            if (!playsXml) {
                console.warn(`Could not fetch plays for ${m.target} (page ${page}). Skipping this month update to preserve data.`);
                break;
            }

            if (totalPlays === null) {
                const totalMatch = playsXml.match(/<plays\b([^>]*\btotal="(\d+)"[^>]*)>/);
                if (totalMatch) {
                    rootAttributes = totalMatch[1];
                    totalPlays = parseInt(totalMatch[2], 10) || 0;
                }
            }

            const playMatches = playsXml.match(/<play\b[\s\S]*?<\/play>/g) || [];
            allPlayMatches.push(...playMatches);

            // BGG paginates at 100 plays per page
            if (totalPlays !== null && allPlayMatches.length < totalPlays && playMatches.length > 0) {
                page++;
                await sleep(4000);
            } else {
                break;
            }
        }

        if (allPlayMatches.length > 0) {
            const targetFile = path.join(PLAYS_DIR, `${m.target}.xml`);
            const cleanedAttrs = (rootAttributes || `username="${BGG_USER}"`)
                .replace(/\bpage="\d+"/, 'page="1"')
                .replace(/\btotal="\d+"/, `total="${allPlayMatches.length}"`);
            const mergedXml = `<?xml version="1.0" encoding="utf-8"?><plays ${cleanedAttrs}>\n${allPlayMatches.join('\n')}\n</plays>`;
            writeFileAtomic(targetFile, mergedXml);
            console.log(`Saved ${allPlayMatches.length} plays to ${targetFile}`);
        }
        await sleep(5000);
    }

    console.log('BGG data fetch completed.');
}

run().catch((err) => {
    console.error('Fatal error in BGG fetcher:', err);
    process.exit(1);
});
