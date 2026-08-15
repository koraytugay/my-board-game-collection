const fs = require('fs');
const https = require('https');
const path = require('path');

const COLLECTION_FILE = path.join(__dirname, 'collection.xml');
const DESIGNERS_FILE = path.join(__dirname, 'designers.json');

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

function getGamesFromCollection() {
    if (!fs.existsSync(COLLECTION_FILE)) return [];
    const xml = fs.readFileSync(COLLECTION_FILE, 'utf8');
    const items = xml.match(/<item\b[\s\S]*?<\/item>/g) || [];
    const games = [];

    for (const item of items) {
        const idMatch = item.match(/objectid="(\d+)"/);
        const nameMatch = item.match(/<name[^>]*>([^<]+)<\/name>/);
        const isWanted = item.includes('wanttobuy="1"');
        if (idMatch) {
            games.push({
                objectId: idMatch[1],
                name: nameMatch ? nameMatch[1] : `Game #${idMatch[1]}`,
                isWanted
            });
        }
    }
    return games;
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

    const allGames = getGamesFromCollection();
    // Prioritize wanted games first, then all collection games
    const wantedGames = allGames.filter(g => g.isWanted);
    const missingGames = wantedGames.filter(g => !designersCache[g.objectId] || !Array.isArray(designersCache[g.objectId].designers));

    console.log(`Total wanted games: ${wantedGames.length}. Missing from designers cache: ${missingGames.length}.`);

    if (missingGames.length === 0) {
        console.log('All wanted games already cached in designers.json! Zero requests needed.');
        return;
    }

    let fetchedCount = 0;
    for (let i = 0; i < missingGames.length; i++) {
        const game = missingGames[i];
        console.log(`[${i + 1}/${missingGames.length}] Fetching designers for "${game.name}" (ID: ${game.objectId})...`);
        
        const res = await fetchJson(`https://api.geekdo.com/api/geekitems?objectid=${game.objectId}&objecttype=thing`);
        if (res?.item?.links?.boardgamedesigner) {
            const designers = res.item.links.boardgamedesigner
                .map(d => d.name?.trim())
                .filter(Boolean);
            
            designersCache[game.objectId] = {
                name: game.name,
                designers: designers.length > 0 ? designers : ['(Uncredited)'],
                lastUpdated: new Date().toISOString()
            };
            fetchedCount++;
            console.log(`  -> Found ${designers.length} designer(s): ${designers.join(', ') || 'None'}`);
        } else {
            designersCache[game.objectId] = {
                name: game.name,
                designers: ['(Uncredited)'],
                lastUpdated: new Date().toISOString()
            };
        }

        // Save progress incrementally every 10 games
        if ((i + 1) % 10 === 0 || i === missingGames.length - 1) {
            fs.writeFileSync(DESIGNERS_FILE, JSON.stringify(designersCache, null, 2), 'utf8');
        }

        // Polite delay (400ms) between BGG requests
        await new Promise(r => setTimeout(r, 400));
    }

    fs.writeFileSync(DESIGNERS_FILE, JSON.stringify(designersCache, null, 2), 'utf8');
    console.log(`Finished fetching designers. Saved ${fetchedCount} new entries to ${DESIGNERS_FILE}.`);
}

fetchDesigners().catch(err => {
    console.error('Fatal error fetching designers:', err);
});
