// Checks every wanted game against every store in store-registry.js and writes the results to
// availability.json (or availability-liketohave.json with --like-to-have).
// The store checkers, matching, HTTP and deal logic live in lib/.
const fs = require('fs');
const path = require('path');
const { startRunLog } = require('./lib/run-log');
const { runStats } = require('./lib/run-stats');
const { sleep, decodeXmlEntities, cleanName, writeFileAtomic } = require('./lib/util');
const { fetchJson, fetchHtml } = require('./lib/http');
const { isMatchSkipped } = require('./lib/skip-rules');
const { isPriceUnderThreshold, computeDealInfo } = require('./lib/deals');
const { closeBrowser } = require('./lib/browser');
const { fetchShopifyStore } = require('./lib/stores/shopify');
const { fetchAmazonWithPuppeteer } = require('./lib/stores/amazon');
const { getStoreConfigs } = require('./lib/store-configs');

const isLikeToHave = process.argv.includes('--like-to-have') || process.argv.includes('--liketohave') || process.env.CHECK_TYPE === 'liketohave';
const COLLECTION_FILE = 'collection.xml';
const OUTPUT_FILE = isLikeToHave ? 'availability-liketohave.json' : 'availability.json';
const POLITENESS_DELAY_MS = parseInt(process.env.CHECK_DELAY_MS || '5000', 10);

// --- RUN LOGGING & MONITORING SETUP ---
const runType = isLikeToHave ? 'liketohave' : 'wanttobuy';
const { logFileName, logStream } = startRunLog(runType);
runStats.runType = runType;
runStats.logFileName = logFileName;

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

    // Load skipped store matches list
    let skippedMatches = [];
    const skippedMatchesFile = path.join(__dirname, 'skipped-matches.js');
    if (fs.existsSync(skippedMatchesFile)) {
        try {
            delete require.cache[require.resolve(skippedMatchesFile)];
            skippedMatches = require(skippedMatchesFile);
        } catch (e) {
            console.error('Error reading skipped-matches.js:', e);
        }
    }
    if (!Array.isArray(skippedMatches)) skippedMatches = [];
    console.log(`Loaded ${skippedMatches.length} skipped store match rule(s).`);

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

    // Clean any skipped matches from existingData right away
    for (const [id, stores] of Object.entries(existingData)) {
        const game = wantedGames.find(g => String(g.objectId) === String(id));
        const gameName = game ? game.name : null;
        for (const storeKey of Object.keys(stores)) {
            if (isMatchSkipped(skippedMatches, storeKey, gameName, id)) {
                stores[storeKey] = {
                    available: false,
                    price: null,
                    baselinePrice: null,
                    url: null,
                    lastChecked: new Date().toISOString(),
                    lastCheckSuccess: true
                };
            }
        }
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
        const skippedStores = [];
        const shopifyStoreKeys = [];
        const nonShopifyStoreKeys = [];

        for (const storeKey of storeKeys) {
            // For games that are "Want in Trade" only (not "Want to Buy"), check stock ONLY in bggMarket
            if (game.isWantInTrade && !game.isWantToBuy && storeKey !== 'bggMarket') {
                continue;
            }

            // Check if this store-game match is explicitly skipped/ignored
            if (isMatchSkipped(skippedMatches, storeKey, game.name, game.objectId)) {
                availability[storeKey] = {
                    available: false,
                    price: null,
                    baselinePrice: null,
                    url: null,
                    lastChecked: new Date().toISOString(),
                    lastCheckSuccess: true
                };
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
                if (config.type === 'shopify') {
                    shopifyStoreKeys.push(storeKey);
                } else {
                    nonShopifyStoreKeys.push(storeKey);
                }
            }
        }

        const totalStoresToCheck = shopifyStoreKeys.length + nonShopifyStoreKeys.length;

        if (game.isWantInTrade && !game.isWantToBuy) {
            console.log(`[${i+1}/${wantedGames.length}] "${game.name}" (Want in Trade only): Checking BGG Market only...`);
        } else if (skippedStores.length > 0) {
            console.log(`[${i+1}/${wantedGames.length}] "${game.name}": skipped ${skippedStores.length} stores checked within 6 hours. Checking remaining ${totalStoresToCheck} stores (${shopifyStoreKeys.length} Shopify, ${nonShopifyStoreKeys.length} others)...`);
        } else {
            console.log(`[${i+1}/${wantedGames.length}] "${game.name}": Checking all ${storeKeys.length} stores (${shopifyStoreKeys.length} Shopify, ${nonShopifyStoreKeys.length} others)...`);
        }

        const checkStore = async (storeKey) => {
            const config = storeConfigs[storeKey];
            const existingStoreData = existingData[game.objectId]?.[storeKey];
            try {
                let resultObj = null;

                if (config.type === 'shopify') {
                    resultObj = await fetchShopifyStore(
                        config.baseUrl,
                        query,
                        game.name,
                        config.currencySymbol || '$',
                        config.country || 'CA',
                        config.currency || 'CAD'
                    );
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
        };

        const shopifyRunner = async () => {
            for (let s = 0; s < shopifyStoreKeys.length; s++) {
                if (s > 0) {
                    await sleep(350);
                }
                await checkStore(shopifyStoreKeys[s]);
            }
        };

        const nonShopifyPromises = nonShopifyStoreKeys.map(storeKey => checkStore(storeKey));

        if (totalStoresToCheck > 0) {
            await Promise.all([
                Promise.all(nonShopifyPromises),
                shopifyRunner()
            ]);
        }

        availabilityData[game.objectId] = availability;
        
        // Incremental save every 5 games
        if ((i + 1) % 5 === 0 || i === wantedGames.length - 1) {
            try {
                writeFileAtomic(OUTPUT_FILE, JSON.stringify(availabilityData, null, 2));
            } catch (_) {}
        }

        // Politeness delay
        if (totalStoresToCheck > 0) {
            await new Promise(r => setTimeout(r, POLITENESS_DELAY_MS));
        }
    }

    await closeBrowser();

    writeFileAtomic(OUTPUT_FILE, JSON.stringify(availabilityData, null, 2));
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
