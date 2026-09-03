const fs = require('fs');
const https = require('https');
const path = require('path');

const COLLECTION_FILE = path.join(__dirname, 'collection.xml');
const RECOMMENDATIONS_FILE = path.join(__dirname, 'recommendations.json');
const BEST_AT_FILE = path.join(__dirname, 'best-at.json');

const DEFAULT_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'application/json'
};

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

    // 1. Games from collection.xml (owned games first, then other collection games)
    if (fs.existsSync(COLLECTION_FILE)) {
        const xml = fs.readFileSync(COLLECTION_FILE, 'utf8');
        const items = xml.match(/<item\b[\s\S]*?<\/item>/g) || [];

        // First pass: owned board games (the ones shown on index.html)
        for (const item of items) {
            if (item.includes('subtype="boardgame"') && item.includes('own="1"')) {
                const idMatch = item.match(/objectid="(\d+)"/);
                const nameMatch = item.match(/<name[^>]*>([^<]+)<\/name>/);
                if (idMatch && !gameMap.has(idMatch[1])) {
                    gameMap.set(idMatch[1], {
                        objectId: idMatch[1],
                        name: nameMatch ? nameMatch[1] : `Game #${idMatch[1]}`
                    });
                }
            }
        }

        // Second pass: remaining games from collection.xml
        for (const item of items) {
            const idMatch = item.match(/objectid="(\d+)"/);
            const nameMatch = item.match(/<name[^>]*>([^<]+)<\/name>/);
            if (idMatch && !gameMap.has(idMatch[1])) {
                gameMap.set(idMatch[1], {
                    objectId: idMatch[1],
                    name: nameMatch ? nameMatch[1] : `Game #${idMatch[1]}`
                });
            }
        }
    }

    // 3. Games from recommendations.json
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

function parseBestAt(res) {
    const up = res?.item?.polls?.userplayers;
    const bestAt = [];
    if (up?.best && Array.isArray(up.best)) {
        for (const range of up.best) {
            const min = parseInt(range.min, 10);
            const max = parseInt(range.max, 10);
            if (!isNaN(min) && !isNaN(max)) {
                for (let count = min; count <= max; count++) {
                    const label = count === 1 ? 'Solo' : String(count);
                    if (!bestAt.includes(label)) {
                        bestAt.push(label);
                    }
                }
            }
        }
    }
    return bestAt;
}

async function fetchBestAt() {
    console.log('--- Fetching Board Game Best-At Player Counts ---');
    let cache = {};
    if (fs.existsSync(BEST_AT_FILE)) {
        try {
            cache = JSON.parse(fs.readFileSync(BEST_AT_FILE, 'utf8'));
        } catch {
            cache = {};
        }
    }

    const allGames = getAllTargetGames();
    const missingGames = allGames.filter(g => !cache[g.objectId] || !Array.isArray(cache[g.objectId].bestAt));

    console.log(`Total target games: ${allGames.length}. Missing from best-at cache: ${missingGames.length}.`);

    if (missingGames.length === 0) {
        console.log('All games already cached in best-at.json! Zero requests needed.');
        return;
    }

    let fetchedCount = 0;
    for (let i = 0; i < missingGames.length; i++) {
        const game = missingGames[i];

        const res = await fetchJson(`https://api.geekdo.com/api/dynamicinfo?objectid=${game.objectId}&objecttype=thing`);
        const bestAt = parseBestAt(res);

        cache[game.objectId] = {
            name: game.name,
            bestAt,
            lastUpdated: new Date().toISOString()
        };
        fetchedCount++;
        if ((i + 1) % 10 === 0 || i === missingGames.length - 1 || bestAt.length > 0) {
            console.log(`[${i + 1}/${missingGames.length}] "${game.name}": Best at ${bestAt.length > 0 ? bestAt.join(', ') : 'None'}`);
        }

        // Save progress incrementally every 15 games
        if ((i + 1) % 15 === 0 || i === missingGames.length - 1) {
            fs.writeFileSync(BEST_AT_FILE, JSON.stringify(cache, null, 2), 'utf8');
        }

        // Polite delay (250ms) between requests
        await new Promise(r => setTimeout(r, 250));
    }

    fs.writeFileSync(BEST_AT_FILE, JSON.stringify(cache, null, 2), 'utf8');
    console.log(`Finished fetching Best At player counts. Saved ${fetchedCount} new entries to ${BEST_AT_FILE}.`);
}

fetchBestAt().catch(err => {
    console.error('Fatal error fetching Best At counts:', err);
});
