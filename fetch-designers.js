const fs = require('fs');
const https = require('https');
const path = require('path');

const COLLECTION_FILE = path.join(__dirname, 'collection.xml');
const RECOMMENDATIONS_FILE = path.join(__dirname, 'recommendations.json');
const DESIGNERS_FILE = path.join(__dirname, 'designers.json');

const DEFAULT_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'application/json'
};

function writeFileAtomic(filePath, data) {
    const tmpPath = `${filePath}.tmp.${Date.now()}`;
    fs.writeFileSync(tmpPath, data, 'utf8');
    fs.renameSync(tmpPath, filePath);
}

function fetchJson(url) {
    return new Promise((resolve) => {
        const u = new URL(url);
        const options = {
            hostname: u.hostname,
            path: u.pathname + u.search,
            headers: DEFAULT_HEADERS,
            timeout: 10000
        };

        const req = https.get(options, (res) => {
            if (res.statusCode !== 200) {
                resolve(null);
                return;
            }
            let data = '';
            res.on('data', chunk => { data += chunk; });
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch {
                    resolve(null);
                }
            });
        });

        req.on('timeout', () => {
            req.destroy();
            resolve(null);
        });

        req.on('error', () => {
            resolve(null);
        });
    });
}

function getAllTargetGames() {
    const gameMap = new Map();

    // 1. Games from collection.xml (exclude Wishlist Priority 5 "Don't Buy" rejected games)
    if (fs.existsSync(COLLECTION_FILE)) {
        const xml = fs.readFileSync(COLLECTION_FILE, 'utf8');
        const items = xml.match(/<item\b[\s\S]*?<\/item>/g) || [];

        for (const item of items) {
            if (item.includes('wishlistpriority="5"')) continue;
            const idMatch = item.match(/objectid="(\d+)"/);
            const nameMatch = item.match(/<name[^>]*>([^<]+)<\/name>/);
            if (idMatch) {
                gameMap.set(idMatch[1], {
                    objectId: idMatch[1],
                    name: nameMatch ? nameMatch[1] : `Game #${idMatch[1]}`
                });
            }
        }
    }

    // 2. Games from recommendations.json
    if (fs.existsSync(RECOMMENDATIONS_FILE)) {
        try {
            const recData = JSON.parse(fs.readFileSync(RECOMMENDATIONS_FILE, 'utf8'));
            const recList = recData.recommendations || [];
            for (const r of recList) {
                if (r.objectId && !gameMap.has(String(r.objectId))) {
                    gameMap.set(String(r.objectId), {
                        objectId: String(r.objectId),
                        name: r.name || `Game #${r.objectId}`
                    });
                }
            }
        } catch (e) {
            console.warn('Could not read recommendations.json:', e.message);
        }
    }

    return Array.from(gameMap.values());
}

async function fetchDesigners() {
    console.log('--- Fetching Board Game Designers ---');
    let designersCache = {};
    if (fs.existsSync(DESIGNERS_FILE)) {
        try {
            designersCache = JSON.parse(fs.readFileSync(DESIGNERS_FILE, 'utf8'));
        } catch {
            designersCache = {};
        }
    }

    const allGames = getAllTargetGames();
    const activeIdSet = new Set(allGames.map(g => String(g.objectId)));

    // Prune entries no longer in collection or recommendations (with safety guard)
    if (allGames.length >= 50) {
        let prunedCount = 0;
        for (const cachedId of Object.keys(designersCache)) {
            if (!activeIdSet.has(cachedId)) {
                delete designersCache[cachedId];
                prunedCount++;
            }
        }
        if (prunedCount > 0) {
            console.log(`Pruned ${prunedCount} orphaned game(s) from designers cache.`);
            writeFileAtomic(DESIGNERS_FILE, JSON.stringify(designersCache, null, 2));
        }
    }

    const missingGames = allGames.filter(g => !designersCache[g.objectId] || !Array.isArray(designersCache[g.objectId].designers));

    console.log(`Total target games (collection + recommendations): ${allGames.length}. Missing from designers cache: ${missingGames.length}.`);

    if (missingGames.length === 0) {
        console.log('All games already cached in designers.json! Zero requests needed.');
        return;
    }

    let fetchedCount = 0;
    for (let i = 0; i < missingGames.length; i++) {
        const game = missingGames[i];
        console.log(`[${i + 1}/${missingGames.length}] Fetching designers for "${game.name}" (ID: ${game.objectId})...`);
        
        const res = await fetchJson(`https://api.geekdo.com/api/geekitems?objectid=${game.objectId}&objecttype=thing`);
        if (res && res.item) {
            const designerLinks = res.item.links?.boardgamedesigner || [];
            const designers = designerLinks
                .map(d => d.name?.trim())
                .filter(Boolean);
            
            designersCache[game.objectId] = {
                name: game.name,
                designers: designers.length > 0 ? designers : ['(Uncredited)'],
                lastUpdated: new Date().toISOString()
            };
            fetchedCount++;
            console.log(`  -> Found ${designers.length} designer(s): ${designers.join(', ') || '(Uncredited)'}`);
        } else {
            console.warn(`  -> Failed to fetch designer info for "${game.name}" (ID: ${game.objectId}). Will retry on next run.`);
        }

        // Save progress incrementally every 10 games
        if ((i + 1) % 10 === 0 || i === missingGames.length - 1) {
            writeFileAtomic(DESIGNERS_FILE, JSON.stringify(designersCache, null, 2));
        }

        // Polite delay (400ms) between BGG requests
        await new Promise(r => setTimeout(r, 400));
    }

    writeFileAtomic(DESIGNERS_FILE, JSON.stringify(designersCache, null, 2));
    console.log(`Finished fetching designers. Saved ${fetchedCount} new entries to ${DESIGNERS_FILE}.`);
}

fetchDesigners().catch(err => {
    console.error('Fatal error fetching designers:', err);
});
