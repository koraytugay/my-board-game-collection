const fs = require('fs');
const path = require('path');
const https = require('https');

const COLLECTION_FILE = path.join(__dirname, 'collection.xml');
const OUTPUT_FILE = path.join(__dirname, 'recommendations.json');
const CACHE_FILE = path.join(__dirname, 'bgg-recs-cache.json');
const IMAGES_DIR = path.join(__dirname, 'images');
const THUMBNAILS_DIR = path.join(IMAGES_DIR, 'thumbnails');
const FULL_DIR = path.join(IMAGES_DIR, 'full');
const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)';

// Ensure image directories exist
[IMAGES_DIR, THUMBNAILS_DIR, FULL_DIR].forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
});

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function fetchJson(url) {
    return new Promise((resolve) => {
        const req = https.get(url, {
            headers: {
                'User-Agent': USER_AGENT,
                'Accept': 'application/json'
            }
        }, (res) => {
            if (res.statusCode !== 200) {
                res.resume();
                return resolve(null);
            }
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    resolve(null);
                }
            });
        });
        req.on('error', () => resolve(null));
        req.setTimeout(8000, () => {
            req.destroy();
            resolve(null);
        });
    });
}

function downloadFile(url, dest) {
    return new Promise((resolve) => {
        if (!url || url.trim() === '') {
            return resolve(false);
        }
        if (fs.existsSync(dest)) {
            return resolve(true);
        }
        const file = fs.createWriteStream(dest);
        https.get(url, { headers: { 'User-Agent': USER_AGENT } }, (response) => {
            if (response.statusCode !== 200) {
                file.close();
                fs.unlink(dest, () => {});
                return resolve(false);
            }
            response.pipe(file);
            file.on('finish', () => {
                file.close();
                resolve(true);
            });
        }).on('error', () => {
            fs.unlink(dest, () => {});
            resolve(false);
        });
    });
}

/**
 * Normalize game titles to catch alternative editions / re-releases of excluded games
 */
function normalizeTitle(title) {
    if (!title) return '';
    return title.toLowerCase()
                .replace(/\([^)]*\)/g, '')
                .replace(/[^a-z0-9\s]/g, '')
                .replace(/\s+/g, ' ')
                .trim();
}

/**
 * Extract owned games, rated games, and excluded games (owned, want to play, want to buy, want in trade, wishlist, wishlist priority 5 "Don't Buy", preordered, or prevowned)
 */
function getCollectionData() {
    if (!fs.existsSync(COLLECTION_FILE)) {
        console.error(`Collection file not found at ${COLLECTION_FILE}`);
        return { excludedIds: new Set(), excludedNames: new Set(), ratedOwnedGames: [] };
    }

    const xmlContent = fs.readFileSync(COLLECTION_FILE, 'utf8');
    const excludedIds = new Set();
    const excludedNames = new Set();
    const ratedOwnedGames = [];

    const itemBlockRegex = /<item\b([\s\S]*?)<\/item>/g;
    let match;

    while ((match = itemBlockRegex.exec(xmlContent)) !== null) {
        const itemBody = match[1];
        const idMatch = /objectid="(\d+)"/.exec(itemBody);
        const subtypeMatch = /subtype="([^"]+)"/.exec(itemBody);
        
        const isOwned = /<status\b[^>]*own="1"/.test(itemBody);
        const isWantToPlay = /<status\b[^>]*wanttoplay="1"/.test(itemBody);
        const isWantToBuy = /<status\b[^>]*wanttobuy="1"/.test(itemBody);
        const isWantInTrade = /<status\b[^>]*want="1"/.test(itemBody);
        const isWishlist = /<status\b[^>]*wishlist="1"/.test(itemBody);
        const isWishlist5 = /<status\b[^>]*wishlistpriority="5"/.test(itemBody);
        const isPrevOwned = /<status\b[^>]*prevowned="1"/.test(itemBody);
        const isPreordered = /<status\b[^>]*preordered="1"/.test(itemBody);

        const isExcluded = isOwned || isWantToPlay || isWantToBuy || isWantInTrade || isWishlist || isWishlist5 || isPrevOwned || isPreordered;

        if (idMatch && isExcluded) {
            const objectId = idMatch[1];
            const subtype = subtypeMatch ? subtypeMatch[1] : 'boardgame';
            excludedIds.add(objectId);

            const nameMatch = /<name\b[^>]*>([^<]+)<\/name>/.exec(itemBody);
            if (nameMatch && nameMatch[1]) {
                const rawName = nameMatch[1];
                const normName = normalizeTitle(rawName);
                if (normName) excludedNames.add(normName);

                // Also exclude base title if title has a colon / subtitle
                if (rawName.includes(':')) {
                    const basePart = rawName.split(':')[0].trim();
                    const normBase = normalizeTitle(basePart);
                    if (normBase) excludedNames.add(normBase);
                }

                if (isOwned && subtype === 'boardgame') {
                    const name = rawName.trim();
                    const ratingMatch = /<rating\b[^>]*value="([^"]+)"/.exec(itemBody);
                    let userRating = 0.0;
                    if (ratingMatch && ratingMatch[1] && ratingMatch[1] !== 'N/A') {
                        userRating = parseFloat(ratingMatch[1]) || 0.0;
                    }

                    if (userRating >= 5.0) {
                        ratedOwnedGames.push({ objectId, name, userRating });
                    }
                }
            }
        }
    }

    ratedOwnedGames.sort((a, b) => b.userRating - a.userRating);
    return { excludedIds, excludedNames, ratedOwnedGames };
}

async function generateRecommendations() {
    console.log('--- Generating Game Recommendations ---');
    const { excludedIds, excludedNames, ratedOwnedGames } = getCollectionData();
    console.log(`Found ${excludedIds.size} excluded IDs/titles (owned, want in trade, wanttoplay, wanttobuy, wishlist, preordered, or prevowned). ${ratedOwnedGames.length} owned board games rated >= 5.0.`);

    if (ratedOwnedGames.length === 0) {
        fs.writeFileSync(OUTPUT_FILE, JSON.stringify({ generatedAt: new Date().toISOString(), total: 0, recommendations: [] }, null, 2));
        return;
    }

    let recsCache = {};
    if (fs.existsSync(CACHE_FILE)) {
        try {
            recsCache = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
        } catch (_) {
            recsCache = {};
        }
    }

    const gamesToAnalyze = ratedOwnedGames.filter(g => g.userRating >= 7.0);
    console.log(`Analyzing recommendations derived from all ${gamesToAnalyze.length} owned games rated >= 7.0...`);

    const candidateMap = new Map();
    const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

    for (let i = 0; i < gamesToAnalyze.length; i++) {
        const source = gamesToAnalyze[i];
        const cachedEntry = recsCache[source.objectId];
        let recs = null;

        if (cachedEntry && cachedEntry.fetchedAt && (Date.now() - new Date(cachedEntry.fetchedAt).getTime()) < THIRTY_DAYS_MS && Array.isArray(cachedEntry.recs)) {
            console.log(`[${i + 1}/${gamesToAnalyze.length}] [CACHE HIT] Using cached BGG recs for: "${source.name}"`);
            recs = cachedEntry.recs;
        } else {
            const apiUrl = `https://boardgamegeek.com/api/geekitem/recs?objectid=${source.objectId}&objecttype=boardgame`;
            console.log(`[${i + 1}/${gamesToAnalyze.length}] [FETCH] Fetching BGG recs for: "${source.name}" (User Score: ${source.userRating})...`);
            const json = await fetchJson(apiUrl);
            await sleep(300);

            if (json && Array.isArray(json.recs)) {
                recs = json.recs;
                recsCache[source.objectId] = {
                    fetchedAt: new Date().toISOString(),
                    recs: recs
                };
            }
        }

        if (!Array.isArray(recs)) {
            continue;
        }
        for (let recIdx = 0; recIdx < recs.length; recIdx++) {
            const r = recs[recIdx];
            const item = r.item || {};
            const recId = String(item.id || '');
            const recName = item.name || '';
            const normRecName = normalizeTitle(recName);

            // STRICT FILTERING: Exclude if owned, wanttoplay, wanttobuy, prevowned, or marked wishlist priority 5
            if (!recId || excludedIds.has(recId) || excludedNames.has(normRecName)) {
                continue;
            }

            const userWeight = Math.pow(source.userRating / 10.0, 2) * 10.0;
            const rankWeight = 1.0 / Math.sqrt(recIdx + 1);
            const contributionScore = userWeight * rankWeight;

            if (!candidateMap.has(recId)) {
                const bggRating = parseFloat(r.rating) || 0.0;
                const bggRankVal = r.rank ? parseInt(r.rank) : null;
                const yearPublished = r.yearpublished || 'N/A';
                const description = r.description || '';
                
                let coverUrl = '';
                if (r.image && typeof r.image === 'object') {
                    coverUrl = r.image['src@2x'] || r.image.src || '';
                }

                candidateMap.set(recId, {
                    objectId: recId,
                    name: recName || 'Unknown Game',
                    yearPublished,
                    bggRating: Math.round(bggRating * 100) / 100,
                    bggRank: bggRankVal,
                    numVoters: r.numvoters || 0,
                    numFans: r.numfans || 0,
                    coverUrl,
                    thumbnail: coverUrl,
                    image: coverUrl,
                    description,
                    rawScore: 0.0,
                    recommendedBy: []
                });
            }

            const candidate = candidateMap.get(recId);
            candidate.rawScore += contributionScore;
            candidate.recommendedBy.push({
                ownedId: source.objectId,
                ownedName: source.name,
                userRating: source.userRating,
                bggRecRank: recIdx + 1,
                contributionScore: Math.round(contributionScore * 100) / 100
            });
        }
    }

    // Safety pass: Remove any candidate matching excluded IDs or normalized titles
    for (const [id, cand] of candidateMap.entries()) {
        if (excludedIds.has(id) || excludedNames.has(normalizeTitle(cand.name))) {
            candidateMap.delete(id);
        }
    }

    console.log(`\nFound ${candidateMap.size} unique candidate recommendations (after strict exclusion filtering).`);

    const candidates = Array.from(candidateMap.values());
    for (const c of candidates) {
        const numSources = c.recommendedBy.length;
        const synergyMultiplier = 1.0 + 0.25 * (numSources - 1);
        
        let qualityMultiplier = c.bggRating > 0 ? (c.bggRating / 7.2) : 1.0;
        qualityMultiplier = Math.max(0.85, Math.min(1.25, qualityMultiplier));

        const finalScore = c.rawScore * synergyMultiplier * qualityMultiplier;
        c.matchScore = Math.round(finalScore * 10) / 10;
        
        c.recommendedBy.sort((a, b) => b.userRating - a.userRating || a.bggRecRank - b.bggRecRank);
    }

    // Sort descending by match score
    candidates.sort((a, b) => b.matchScore - a.matchScore);

    // Select TOP 400 recommendations AFTER all excluded games are removed
    const topRecommendations = candidates.slice(0, 400);

    console.log(`\nFetching high-resolution 492x600 cover images for top ${topRecommendations.length} recommendations...`);
    for (let i = 0; i < topRecommendations.length; i++) {
        const rec = topRecommendations[i];
        
        const geekUrl = `https://api.geekdo.com/api/geekitems?objectid=${rec.objectId}&objecttype=boardgame`;
        const geekData = await fetchJson(geekUrl);
        await sleep(120);

        let highResUrl = rec.coverUrl;
        if (geekData && geekData.item) {
            if (geekData.item['imageurl@2x']) {
                highResUrl = geekData.item['imageurl@2x'];
            } else if (geekData.item.imageurl) {
                highResUrl = geekData.item.imageurl;
            }
            rec.minPlayers = parseInt(geekData.item.minplayers) || 0;
            rec.maxPlayers = parseInt(geekData.item.maxplayers) || 0;
            rec.playingTime = parseInt(geekData.item.playingtime || geekData.item.maxplaytime || geekData.item.minplaytime) || 0;
        }

        if (highResUrl) {
            try {
                const ext = path.extname(new URL(highResUrl).pathname) || '.jpg';
                const localThumb = path.join(THUMBNAILS_DIR, `${rec.objectId}${ext}`);
                const localFull = path.join(FULL_DIR, `${rec.objectId}${ext}`);

                let thumbExists = fs.existsSync(localThumb);
                let fullExists = fs.existsSync(localFull);

                if (!thumbExists && !fullExists) {
                    const success = await downloadFile(highResUrl, localThumb);
                    if (success) {
                        thumbExists = true;
                        try {
                            fs.copyFileSync(localThumb, localFull);
                            fullExists = true;
                        } catch (_) {}
                    }
                } else if (!thumbExists && fullExists) {
                    try {
                        fs.copyFileSync(localFull, localThumb);
                        thumbExists = true;
                    } catch (_) {}
                } else if (thumbExists && !fullExists) {
                    try {
                        fs.copyFileSync(localThumb, localFull);
                        fullExists = true;
                    } catch (_) {}
                }

                if (thumbExists || fs.existsSync(localThumb)) {
                    rec.thumbnail = `images/thumbnails/${rec.objectId}${ext}`;
                }
                if (fullExists || fs.existsSync(localFull)) {
                    rec.image = `images/full/${rec.objectId}${ext}`;
                }
            } catch (e) {
                console.error(`Error downloading image for ${rec.name}:`, e);
            }
        }
    }

    const outputData = {
        generatedAt: new Date().toISOString(),
        total: topRecommendations.length,
        recommendations: topRecommendations
    };

    fs.writeFileSync(CACHE_FILE, JSON.stringify(recsCache, null, 2), 'utf8');
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(outputData, null, 2), 'utf8');
    console.log(`Saved top ${topRecommendations.length} high-resolution recommendations to ${OUTPUT_FILE}`);
}

generateRecommendations().catch(err => {
    console.error('Fatal error generating recommendations:', err);
    process.exit(1);
});
