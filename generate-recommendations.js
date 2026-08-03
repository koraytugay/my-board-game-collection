const fs = require('fs');
const path = require('path');
const https = require('https');

const COLLECTION_FILE = path.join(__dirname, 'collection.xml');
const OUTPUT_FILE = path.join(__dirname, 'recommendations.json');
const IMAGES_DIR = path.join(__dirname, 'images');
const THUMBNAILS_DIR = path.join(IMAGES_DIR, 'thumbnails');
const FULL_DIR = path.join(IMAGES_DIR, 'full');
const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)';

// Ensure directories exist
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

function getOwnedGamesWithRatings() {
    if (!fs.existsSync(COLLECTION_FILE)) {
        console.error(`Collection file not found at ${COLLECTION_FILE}`);
        return { ownedIds: new Set(), ratedOwnedGames: [] };
    }

    const xmlContent = fs.readFileSync(COLLECTION_FILE, 'utf8');
    const ownedIds = new Set();
    const ratedOwnedGames = [];

    const itemRegex = /<item\b[^>]*objectid="(\d+)"[^>]*subtype="([^"]+)"[^>]*>([\s\S]*?)<\/item>/g;
    let match;

    while ((match = itemRegex.exec(xmlContent)) !== null) {
        const objectId = match[1];
        const subtype = match[2];
        const itemBody = match[3];

        const isOwned = /<status\b[^>]*own="1"/.test(itemBody);
        if (isOwned) {
            ownedIds.add(objectId);

            if (subtype === 'boardgame') {
                const nameMatch = /<name\b[^>]*>([^<]+)<\/name>/.exec(itemBody);
                const name = nameMatch ? nameMatch[1].trim() : 'Unknown Game';

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

    ratedOwnedGames.sort((a, b) => b.userRating - a.userRating);
    return { ownedIds, ratedOwnedGames };
}

async function generateRecommendations() {
    console.log('--- Generating Game Recommendations ---');
    const { ownedIds, ratedOwnedGames } = getOwnedGamesWithRatings();
    console.log(`Found ${ownedIds.size} owned items. ${ratedOwnedGames.length} owned board games rated >= 5.0.`);

    if (ratedOwnedGames.length === 0) {
        fs.writeFileSync(OUTPUT_FILE, JSON.stringify({ generatedAt: new Date().toISOString(), total: 0, recommendations: [] }, null, 2));
        return;
    }

    const gamesToAnalyze = ratedOwnedGames.slice(0, 35);
    console.log(`Analyzing recommendations derived from top ${gamesToAnalyze.length} rated owned games...`);

    const candidateMap = new Map();

    for (let i = 0; i < gamesToAnalyze.length; i++) {
        const source = gamesToAnalyze[i];
        const apiUrl = `https://boardgamegeek.com/api/geekitem/recs?objectid=${source.objectId}&objecttype=boardgame`;
        
        console.log(`[${i + 1}/${gamesToAnalyze.length}] Fetching BGG recs for: "${source.name}" (User Score: ${source.userRating})...`);
        const json = await fetchJson(apiUrl);
        await sleep(350);

        if (!json || !Array.isArray(json.recs)) {
            continue;
        }

        const recs = json.recs;
        for (let recIdx = 0; recIdx < recs.length; recIdx++) {
            const r = recs[recIdx];
            const item = r.item || {};
            const recId = String(item.id || '');

            if (!recId || ownedIds.has(recId)) {
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
                
                // Use standard BGG cover thumbnail/image (r.image), NEVER hero topImage
                let coverUrl = '';
                if (r.image && typeof r.image === 'object') {
                    coverUrl = r.image['src@2x'] || r.image.src || '';
                }

                candidateMap.set(recId, {
                    objectId: recId,
                    name: item.name || 'Unknown Game',
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

    console.log(`\nFound ${candidateMap.size} unique candidate recommendations.`);

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

    candidates.sort((a, b) => b.matchScore - a.matchScore);
    const topRecommendations = candidates.slice(0, 40);

    // Download box cover images for top recommendations locally
    console.log(`Downloading box cover images for top ${topRecommendations.length} recommendations...`);
    for (const rec of topRecommendations) {
        if (!rec.coverUrl) continue;
        try {
            const ext = path.extname(new URL(rec.coverUrl).pathname) || '.jpg';
            const localThumb = path.join(THUMBNAILS_DIR, `${rec.objectId}${ext}`);
            const localFull = path.join(FULL_DIR, `${rec.objectId}${ext}`);

            if (!fs.existsSync(localThumb)) {
                await downloadFile(rec.coverUrl, localThumb);
            }
            if (!fs.existsSync(localFull)) {
                await downloadFile(rec.coverUrl, localFull);
            }

            rec.thumbnail = `images/thumbnails/${rec.objectId}${ext}`;
            rec.image = `images/full/${rec.objectId}${ext}`;
        } catch (e) {
            // Keep remote coverUrl if local download fails
        }
    }

    const outputData = {
        generatedAt: new Date().toISOString(),
        total: topRecommendations.length,
        recommendations: topRecommendations
    };

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(outputData, null, 2), 'utf8');
    console.log(`Saved top ${topRecommendations.length} recommendations to ${OUTPUT_FILE}`);
}

generateRecommendations().catch(err => {
    console.error('Fatal error generating recommendations:', err);
    process.exit(1);
});
