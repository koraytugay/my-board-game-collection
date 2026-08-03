const fs = require('fs');
const path = require('path');
const https = require('https');

const COLLECTION_FILE = path.join(__dirname, 'collection.xml');
const OUTPUT_FILE = path.join(__dirname, 'recommendations.json');
const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)';

/**
 * Utility delay helper
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Fetch URL content as JSON
 */
function fetchJson(url) {
    return new Promise((resolve, reject) => {
        const req = https.get(url, {
            headers: {
                'User-Agent': USER_AGENT,
                'Accept': 'application/json'
            }
        }, (res) => {
            if (res.statusCode !== 200) {
                res.resume(); // consume response data to free up memory
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
        req.on('error', (err) => resolve(null));
        req.setTimeout(8000, () => {
            req.destroy();
            resolve(null);
        });
    });
}

/**
 * Parse owned board games and user ratings from collection.xml
 */
function getOwnedGamesWithRatings() {
    if (!fs.existsSync(COLLECTION_FILE)) {
        console.error(`Collection file not found at ${COLLECTION_FILE}`);
        return { ownedIds: new Set(), ratedOwnedGames: [] };
    }

    const xmlContent = fs.readFileSync(COLLECTION_FILE, 'utf8');
    const ownedIds = new Set();
    const ratedOwnedGames = [];

    // Match each <item> block in collection.xml
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

                if (userRating >= 5.0) { // Consider games user rated 5 or higher
                    ratedOwnedGames.push({
                        objectId,
                        name,
                        userRating
                    });
                }
            }
        }
    }

    // Sort owned rated games descending by user rating
    ratedOwnedGames.sort((a, b) => b.userRating - a.userRating);

    return { ownedIds, ratedOwnedGames };
}

/**
 * Calculate recommendation scores and aggregate BGG recs
 */
async function generateRecommendations() {
    console.log('--- Generating Game Recommendations ---');
    const { ownedIds, ratedOwnedGames } = getOwnedGamesWithRatings();
    console.log(`Found ${ownedIds.size} owned items. ${ratedOwnedGames.length} owned board games rated >= 5.0.`);

    if (ratedOwnedGames.length === 0) {
        console.log('No rated owned games found to base recommendations on.');
        fs.writeFileSync(OUTPUT_FILE, JSON.stringify({ generatedAt: new Date().toISOString(), total: 0, recommendations: [] }, null, 2));
        return;
    }

    // Process top 35 rated owned games to get deep recommendations
    const gamesToAnalyze = ratedOwnedGames.slice(0, 35);
    console.log(`Analyzing recommendations derived from top ${gamesToAnalyze.length} rated owned games...`);

    const candidateMap = new Map(); // rec_id -> candidate object

    for (let i = 0; i < gamesToAnalyze.length; i++) {
        const source = gamesToAnalyze[i];
        const apiUrl = `https://boardgamegeek.com/api/geekitem/recs?objectid=${source.objectId}&objecttype=boardgame`;
        
        console.log(`[${i + 1}/${gamesToAnalyze.length}] Fetching BGG recs for: "${source.name}" (User Score: ${source.userRating})...`);
        const json = await fetchJson(apiUrl);
        await sleep(350); // Respectful rate limiting

        if (!json || !Array.isArray(json.recs)) {
            continue;
        }

        const recs = json.recs;
        for (let recIdx = 0; recIdx < recs.length; recIdx++) {
            const r = recs[recIdx];
            const item = r.item || {};
            const recId = String(item.id || '');

            if (!recId || ownedIds.has(recId)) {
                continue; // Skip owned games
            }

            // Calculations:
            // 1. User rating weight: (rating / 10)^2 * 10
            const userWeight = Math.pow(source.userRating / 10.0, 2) * 10.0;
            // 2. Rank weight: decay by rank (1st rec = 1.0, 2nd rec = 0.707, etc.)
            const rankWeight = 1.0 / Math.sqrt(recIdx + 1);
            // 3. Contribution score
            const contributionScore = userWeight * rankWeight;

            if (!candidateMap.has(recId)) {
                const bggRating = parseFloat(r.rating) || 0.0;
                const bggRankVal = r.rank ? parseInt(r.rank) : null;
                const yearPublished = r.yearpublished || 'N/A';
                const description = r.description || '';
                
                // Image handling
                let thumbnail = '';
                if (r.image && typeof r.image === 'object' && r.image.src) {
                    thumbnail = r.image.src;
                } else if (r.topImage && r.topImage.src) {
                    thumbnail = r.topImage.src;
                }

                let fullImage = '';
                if (r.topImage && r.topImage.src) {
                    fullImage = r.topImage.src;
                } else {
                    fullImage = thumbnail;
                }

                candidateMap.set(recId, {
                    objectId: recId,
                    name: item.name || 'Unknown Game',
                    yearPublished,
                    bggRating: Math.round(bggRating * 100) / 100,
                    bggRank: bggRankVal,
                    numVoters: r.numvoters || 0,
                    numFans: r.numfans || 0,
                    thumbnail,
                    image: fullImage,
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

    console.log(`\nFound ${candidateMap.size} unique candidate recommendations across owned games.`);

    // Final scoring calculation
    const candidates = Array.from(candidateMap.values());
    for (const c of candidates) {
        // Synergy multiplier for multiple sources
        const numSources = c.recommendedBy.length;
        const synergyMultiplier = 1.0 + 0.25 * (numSources - 1);
        
        // Quality multiplier based on BGG rating (scaled around 7.0)
        let qualityMultiplier = c.bggRating > 0 ? (c.bggRating / 7.2) : 1.0;
        qualityMultiplier = Math.max(0.85, Math.min(1.25, qualityMultiplier));

        const finalScore = c.rawScore * synergyMultiplier * qualityMultiplier;
        c.matchScore = Math.round(finalScore * 10) / 10;
        
        // Sort candidate sources descending by user rating
        c.recommendedBy.sort((a, b) => b.userRating - a.userRating || a.bggRecRank - b.bggRecRank);
    }

    // Sort candidates descending by match score
    candidates.sort((a, b) => b.matchScore - a.matchScore);

    // Keep top 40 recommendations
    const topRecommendations = candidates.slice(0, 40);

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
