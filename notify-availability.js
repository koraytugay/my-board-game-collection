const fs = require('fs');
const { execSync } = require('child_process');
const nodemailer = require('nodemailer');

const isRecommended = process.argv.includes('--recommended') || process.env.CHECK_TYPE === 'recommended';
const isDailySummary = process.argv.includes('--daily-summary') || process.env.DAILY_SUMMARY === 'true';
const AVAILABILITY_FILE = isRecommended ? 'availability-recommended.json' : 'availability.json';
const RECOMMENDATIONS_FILE = 'recommendations.json';
const COLLECTION_FILE = 'collection.xml';

const STORE_META = {
    boardGameBliss: { name: 'BoardGameBliss', icon: '🍁' },
    fourZeroOneGames: { name: '401 Games', icon: '🎲' },
    lvlUpGames: { name: 'LVLUP Games', icon: '⚔️' },
    asDesJeux: { name: 'As des Jeux', icon: '🃏' },
    greatBoardgames: { name: 'Great Boardgames', icon: '🏰' },
    meeplemart: { name: 'Meeplemart', icon: '👾' },
    amazonCa: { name: 'Amazon.ca', icon: '🛒' },
    woodForSheep: { name: 'Wood for Sheep', icon: '🐑' },
    faceToFaceGames: { name: 'Face to Face', icon: '🤝' },
    obsidianGames: { name: 'Obsidian Games', icon: '🔮' },
    jjCards: { name: 'J&J Cards', icon: '🎴' },
    boardgamesCa: { name: 'Boardgames.ca', icon: '🎯' },
    screenFreeGames: { name: 'Screen Free Games', icon: '🧩' },
    allSystemsGo: { name: 'All Systems Go', icon: '🚀' },
    tabletopCafe: { name: 'Tabletop Cafe', icon: '☕' },
    elevatedBoardGames: { name: 'Elevated Board Games', icon: '🏔️' },
    buttonShyEtsy: { name: 'Button Shy (Etsy)', icon: '👛' },
    zatu: { name: 'Zatu Games', icon: '🛡️' },
    bggMarket: { name: 'BGG Market', icon: '🏷️' }
};

function getSinceArg() {
    for (let i = 0; i < process.argv.length; i++) {
        if (process.argv[i] === '--since' && process.argv[i + 1]) {
            return process.argv[i + 1];
        } else if (process.argv[i].startsWith('--since=')) {
            return process.argv[i].split('=')[1];
        }
    }
    return process.env.SINCE || '5 hours ago';
}

function getBaselineCommit(file, since = '5 hours ago') {
    // 1. Try finding commit before the cutoff
    try {
        const cmd = `git log --before="${since}" -n 1 --format="%H" -- "${file}"`;
        const sha = execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }).trim();
        if (sha) return sha;
    } catch (e) {}

    // 2. If all commits in history are within the cutoff, get the oldest commit of this file
    try {
        const cmd = `git log --reverse --format="%H" -- "${file}"`;
        const stdout = execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }).trim();
        const firstSha = stdout.split('\n')[0].trim();
        if (firstSha) return firstSha;
    } catch (e) {}

    return 'HEAD';
}

function getRecommendedRange() {
    let start = 0;
    let end = null;
    let limit = null;

    if (process.env.REC_START !== undefined) start = parseInt(process.env.REC_START, 10);
    else if (process.env.REC_OFFSET !== undefined) start = parseInt(process.env.REC_OFFSET, 10);

    if (process.env.REC_END !== undefined) {
        if (String(process.env.REC_END).toLowerCase() === 'max' || String(process.env.REC_END).toLowerCase() === 'all') {
            end = Infinity;
        } else {
            end = parseInt(process.env.REC_END, 10);
        }
    } else if (process.env.REC_LIMIT !== undefined) {
        limit = parseInt(process.env.REC_LIMIT, 10);
    }

    const args = process.argv;
    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (arg === '--start' || arg === '--offset') {
            const val = parseInt(args[i + 1], 10);
            if (!isNaN(val)) start = val;
        } else if (arg.startsWith('--start=') || arg.startsWith('--offset=')) {
            const val = parseInt(arg.split('=')[1], 10);
            if (!isNaN(val)) start = val;
        } else if (arg === '--end') {
            const valStr = args[i + 1];
            if (valStr && (valStr.toLowerCase() === 'max' || valStr.toLowerCase() === 'all')) {
                end = Infinity;
            } else {
                const val = parseInt(valStr, 10);
                if (!isNaN(val)) end = val;
            }
        } else if (arg.startsWith('--end=')) {
            const valStr = arg.split('=')[1];
            if (valStr && (valStr.toLowerCase() === 'max' || valStr.toLowerCase() === 'all')) {
                end = Infinity;
            } else {
                const val = parseInt(valStr, 10);
                if (!isNaN(val)) end = val;
            }
        } else if (arg === '--limit') {
            const val = parseInt(args[i + 1], 10);
            if (!isNaN(val)) limit = val;
        } else if (arg.startsWith('--limit=')) {
            const val = parseInt(arg.split('=')[1], 10);
            if (!isNaN(val)) limit = val;
        } else if (arg === '--range' && args[i + 1]) {
            const parts = args[i + 1].split(/[-:]/);
            if (parts.length >= 1 && parts[0] !== '') {
                const s = parseInt(parts[0], 10);
                if (!isNaN(s)) start = s;
            }
            if (parts.length >= 2) {
                if (parts[1].toLowerCase() === 'max' || parts[1].toLowerCase() === 'all' || parts[1] === '') {
                    end = Infinity;
                } else {
                    const e = parseInt(parts[1], 10);
                    if (!isNaN(e)) end = e;
                }
            }
        } else if (arg.startsWith('--range=')) {
            const parts = arg.split('=')[1].split(/[-:]/);
            if (parts.length >= 1 && parts[0] !== '') {
                const s = parseInt(parts[0], 10);
                if (!isNaN(s)) start = s;
            }
            if (parts.length >= 2) {
                if (parts[1].toLowerCase() === 'max' || parts[1].toLowerCase() === 'all' || parts[1] === '') {
                    end = Infinity;
                } else {
                    const e = parseInt(parts[1], 10);
                    if (!isNaN(e)) end = e;
                }
            }
        }
    }

    if (isNaN(start) || start < 0) start = 0;
    if (end === null) {
        if (limit !== null && !isNaN(limit)) {
            end = start + limit;
        } else {
            end = start === 0 ? 100 : Infinity;
        }
    }

    const hasRangeFlag = args.some(a => a.startsWith('--start') || a.startsWith('--offset') || a.startsWith('--range') || a.startsWith('--limit') || a.startsWith('--end')) || process.env.REC_START !== undefined || process.env.REC_OFFSET !== undefined || process.env.REC_RANGE !== undefined;

    return { start, end, hasRangeFlag };
}

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

function getGameDetailsMap() {
    const map = {};
    if (isRecommended && fs.existsSync(RECOMMENDATIONS_FILE)) {
        try {
            const recContent = JSON.parse(fs.readFileSync(RECOMMENDATIONS_FILE, 'utf8'));
            (recContent.recommendations || []).forEach(r => {
                const objectId = String(r.objectId);
                map[objectId] = {
                    name: r.name ? r.name.trim() : `Game #${objectId}`,
                    image: r.image || r.thumbnail || r.coverUrl || '',
                    thumbnail: r.thumbnail || r.coverUrl || r.image || '',
                    year: r.yearPublished || ''
                };
            });
        } catch (e) {
            console.error('Error parsing recommendations.json:', e.message);
        }
    }
    if (fs.existsSync(COLLECTION_FILE)) {
        try {
            const content = fs.readFileSync(COLLECTION_FILE, 'utf8');
            const itemRegex = /<item objecttype="thing" objectid="(\d+)"[^>]*>([\s\S]*?)<\/item>/g;
            let match;
            while ((match = itemRegex.exec(content)) !== null) {
                const objectId = match[1];
                const itemContent = match[2];
                const nameMatch = /<name[^>]*>([^<]+)<\/name>/.exec(itemContent);
                const imageMatch = /<image>([^<]+)<\/image>/.exec(itemContent);
                const thumbMatch = /<thumbnail>([^<]+)<\/thumbnail>/.exec(itemContent);
                const yearMatch = /<yearpublished>([^<]+)<\/yearpublished>/.exec(itemContent);
                if (!map[objectId]) {
                    map[objectId] = {
                        name: nameMatch ? decodeXmlEntities(nameMatch[1].trim()) : `Game #${objectId}`,
                        image: imageMatch ? imageMatch[1] : (thumbMatch ? thumbMatch[1] : ''),
                        thumbnail: thumbMatch ? thumbMatch[1] : (imageMatch ? imageMatch[1] : ''),
                        year: yearMatch ? yearMatch[1] : ''
                    };
                }
            }
        } catch (e) {
            console.error('Error parsing collection.xml:', e.message);
        }
    }
    return map;
}

function getPreviousAvailability(baseRef = 'HEAD') {
    // Try reading previous availability from git ref
    try {
        const stdout = execSync(`git show ${baseRef}:${AVAILABILITY_FILE}`, {
            encoding: 'utf8',
            stdio: ['pipe', 'pipe', 'ignore'],
            maxBuffer: 10 * 1024 * 1024
        });
        if (stdout && stdout.trim()) {
            return JSON.parse(stdout);
        }
    } catch (e) {
        // Not in git or first commit, fallback to empty object
    }
    return {};
}

function getCurrentAvailability() {
    if (fs.existsSync(AVAILABILITY_FILE)) {
        try {
            return JSON.parse(fs.readFileSync(AVAILABILITY_FILE, 'utf8'));
        } catch (e) {
            console.error('Error reading current availability.json:', e.message);
        }
    }
    return {};
}

function normalizePrice(price) {
    if (!price && price !== 0) return null;
    const clean = String(price).replace(/[^0-9.]/g, '').trim();
    return clean || null;
}

function formatPrice(price) {
    if (!price && price !== 0) return '';
    let str = String(price).trim();
    if (!str) return '';
    str = str.replace(/\b(CAD|USD|CDN|EUR|GBP)\b/gi, '').trim();
    str = str.replace(/^[A-Za-z]+\$/, '$').trim();
    if (/^[\d,]+(\.\d+)?$/.test(str)) {
        return `$${str}`;
    }
    return str;
}

const MIN_PRICE_CHANGE_THRESHOLD = 5.0;

function computeDiff(prevData, currData, gamesMap) {
    const newlyAvailable = [];
    const noLongerAvailable = [];
    const priceChanges = [];
    const bggMarketNewListings = [];

    const allGameIds = new Set([...Object.keys(prevData), ...Object.keys(currData)]);

    for (const gameId of allGameIds) {
        const prevStores = prevData[gameId] || {};
        const currStores = currData[gameId] || {};
        const gameInfo = gamesMap[gameId] || { name: `Game #${gameId}`, bggUrl: `https://boardgamegeek.com/boardgame/${gameId}` };
        const gameName = gameInfo.name;
        const bggUrl = `https://boardgamegeek.com/boardgame/${gameId}`;

        const allStoreKeys = new Set([...Object.keys(prevStores), ...Object.keys(currStores)]);

        // Check overall availability across all stores
        const wasInStockAnywhere = Object.entries(prevStores).some(([key, data]) => {
            if (key === 'bggMarket') {
                const active = (Array.isArray(data?.listings) ? data.listings : []).filter(l => !l.ignored);
                return active.length > 0 || (data?.available && !data?.ignored);
            }
            return !!data?.available;
        });

        const isInStockAnywhere = Object.entries(currStores).some(([key, data]) => {
            if (key === 'bggMarket') {
                const active = (Array.isArray(data?.listings) ? data.listings : []).filter(l => !l.ignored);
                return active.length > 0 || (data?.available && !data?.ignored);
            }
            return !!data?.available;
        });

        for (const storeKey of allStoreKeys) {
            const prev = prevStores[storeKey] || {};
            const curr = currStores[storeKey] || {};
            const storeMeta = STORE_META[storeKey] || { name: storeKey, icon: '🏪' };
            const storeName = `${storeMeta.icon} ${storeMeta.name}`;

            if (storeKey === 'bggMarket') {
                // Compare BGG Market listings (only active, non-ignored listings)
                const prevListings = (Array.isArray(prev.listings) ? prev.listings : []).filter(l => !l.ignored);
                const currListings = (Array.isArray(curr.listings) ? curr.listings : []).filter(l => !l.ignored);

                // Detect new listings in BGG Market
                for (const currItem of currListings) {
                    const existsInPrev = prevListings.some(p => p.seller && p.seller.toLowerCase() === currItem.seller.toLowerCase() && p.price === currItem.price);
                    if (!existsInPrev) {
                        bggMarketNewListings.push({
                            gameId,
                            gameName,
                            bggUrl,
                            seller: currItem.seller || 'Unknown',
                            price: currItem.price,
                            condition: currItem.condition || '',
                            url: currItem.url || bggUrl
                        });
                    }
                }
                continue;
            }

            const wasAvail = !!prev.available;
            const isAvail = !!curr.available;

            // 1. Newly in stock
            if (!wasAvail && isAvail) {
                newlyAvailable.push({
                    gameId,
                    gameName,
                    bggUrl,
                    storeKey,
                    storeName,
                    price: formatPrice(curr.price),
                    url: curr.url || bggUrl,
                    wasInStockAnywhere
                });
            }
            // 2. No longer in stock (only if check succeeded to avoid network glitch false alarms)
            else if (wasAvail && !isAvail && curr.lastCheckSuccess !== false) {
                noLongerAvailable.push({
                    gameId,
                    gameName,
                    bggUrl,
                    storeKey,
                    storeName,
                    wasPrice: formatPrice(prev.price),
                    url: prev.url || curr.url || bggUrl,
                    isNowCompletelyOutOfStock: !isInStockAnywhere
                });
            }
            // 3. Price change for an in-stock game (only if change is at least MIN_PRICE_CHANGE_THRESHOLD)
            else if (wasAvail && isAvail && prev.price && curr.price) {
                const normPrev = parseFloat(normalizePrice(prev.price));
                const normCurr = parseFloat(normalizePrice(curr.price));
                if (!isNaN(normPrev) && !isNaN(normCurr)) {
                    const priceDiff = Math.abs(normCurr - normPrev);
                    if (priceDiff >= MIN_PRICE_CHANGE_THRESHOLD) {
                        priceChanges.push({
                            gameId,
                            gameName,
                            bggUrl,
                            storeKey,
                            storeName,
                            oldPrice: formatPrice(prev.price),
                            newPrice: formatPrice(curr.price),
                            priceDiff: priceDiff.toFixed(2),
                            url: curr.url || bggUrl
                        });
                    }
                }
            }
        }
    }

    return {
        newlyAvailable,
        noLongerAvailable,
        priceChanges,
        bggMarketNewListings,
        totalDiffs: newlyAvailable.length + noLongerAvailable.length + priceChanges.length + bggMarketNewListings.length
    };
}

function getOverallInStockSummary(currData, gamesMap) {
    let inStockCount = 0;
    const inStockGames = [];
    for (const [gameId, stores] of Object.entries(currData)) {
        const inStockStores = [];
        for (const [storeKey, storeData] of Object.entries(stores)) {
            if (storeKey === 'bggMarket') {
                const active = (Array.isArray(storeData?.listings) ? storeData.listings : []).filter(l => !l.ignored);
                if (active.length > 0 || (storeData?.available && !storeData?.ignored)) {
                    inStockStores.push(STORE_META[storeKey]?.name || storeKey);
                }
            } else if (storeData?.available) {
                inStockStores.push(STORE_META[storeKey]?.name || storeKey);
            }
        }
        if (inStockStores.length > 0) {
            inStockCount++;
            const gameInfo = gamesMap[gameId] || { name: `Game #${gameId}` };
            inStockGames.push({
                name: gameInfo.name,
                stores: inStockStores
            });
        }
    }
    return { inStockCount, inStockGames, totalGames: Object.keys(currData).length };
}

function buildEmailSubject(diff, summary, range, isDaily) {
    let defaultPrefix;
    if (isDaily) {
        defaultPrefix = '🎲 [Recommended Games Daily Stock Summary]';
    } else if (isRecommended) {
        let rangeLabel = '';
        if (range && range.hasRangeFlag) {
            const startNum = range.start + 1;
            const endNum = range.end === Infinity ? '400+' : range.end;
            rangeLabel = ` (#${startNum}-${endNum})`;
        }
        defaultPrefix = `🎲 [Recommended Games Stock Alert${rangeLabel}]`;
    } else {
        defaultPrefix = '🎲 Board Game Alert';
    }

    if (diff.totalDiffs === 0) {
        return isDaily
            ? `${defaultPrefix} No changes detected (${summary.inStockCount}/${summary.totalGames} in stock)`
            : isRecommended
                ? `${defaultPrefix} No changes detected (${summary.inStockCount}/${summary.totalGames} in stock)`
                : `🎲 Board Game Stock Check: No changes detected (${summary.inStockCount}/${summary.totalGames} in stock)`;
    }

    const parts = [];
    if (diff.newlyAvailable.length > 0) {
        parts.push(`🟢 ${diff.newlyAvailable.length} in stock`);
    }
    if (diff.noLongerAvailable.length > 0) {
        parts.push(`🔴 ${diff.noLongerAvailable.length} out of stock`);
    }
    if (diff.priceChanges.length > 0) {
        parts.push(`🏷️ ${diff.priceChanges.length} price change${diff.priceChanges.length > 1 ? 's' : ''}`);
    }
    if (diff.bggMarketNewListings.length > 0) {
        parts.push(`📦 ${diff.bggMarketNewListings.length} BGG listing${diff.bggMarketNewListings.length > 1 ? 's' : ''}`);
    }
    return `${defaultPrefix}: ${parts.join(', ')}`;
}

function buildHtmlBody(diff, gamesMap, summary, range, isDaily) {
    const listTitle = isRecommended ? 'Recommended Games' : 'Want to Buy';
    const listUrl = isRecommended 
        ? 'https://koraytugay.github.io/my-board-game-collection/recommended.html' 
        : 'https://koraytugay.github.io/my-board-game-collection/wanttobuy.html';
    const headerTitle = isDaily
        ? '🎲 Recommended Games Daily Stock Summary'
        : isRecommended 
            ? `🎲 Recommended Games Stock Update${range && range.hasRangeFlag ? ` (#${range.start + 1} - ${range.end === Infinity ? '400+' : range.end})` : ''}` 
            : '🎲 Board Game Stock Update';

    let html = `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f4f6f8; color: #2d3748; margin: 0; padding: 20px; line-height: 1.5; }
            .container { max-width: 650px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.06); border: 1px solid #e2e8f0; }
            .header { background: #1a202c; color: #ffffff; padding: 24px; text-align: center; }
            .header h1 { margin: 0 0 6px 0; font-size: 1.4rem; font-weight: 700; }
            .header p { margin: 0; font-size: 0.9rem; color: #a0aec0; }
            .content { padding: 24px; }
            .section-title { font-size: 1.1rem; font-weight: 700; margin: 24px 0 12px 0; padding-bottom: 8px; border-bottom: 2px solid #edf2f7; display: flex; align-items: center; gap: 8px; }
            .section-title:first-child { margin-top: 0; }
            .card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px 16px; margin-bottom: 12px; display: flex; flex-direction: column; gap: 6px; }
            .card-header { display: flex; justify-content: space-between; align-items: center; }
            .game-title { font-weight: 700; font-size: 1rem; color: #1a202c; text-decoration: none; }
            .game-title:hover { text-decoration: underline; color: #2b6cb0; }
            .badge-instock { background: #c6f6d5; color: #22543d; font-size: 0.75rem; font-weight: bold; padding: 3px 8px; border-radius: 9999px; }
            .badge-outofstock { background: #fed7d7; color: #742a2a; font-size: 0.75rem; font-weight: bold; padding: 3px 8px; border-radius: 9999px; }
            .badge-allout { background: #e53e3e; color: #ffffff; font-size: 0.75rem; font-weight: bold; padding: 3px 8px; border-radius: 9999px; }
            .badge-price { background: #e2e8f0; color: #2d3748; font-size: 0.75rem; font-weight: bold; padding: 3px 8px; border-radius: 9999px; }
            .meta-line { font-size: 0.9rem; color: #4a5568; display: flex; justify-content: space-between; align-items: center; }
            .btn { display: inline-block; background: #3182ce; color: #ffffff !important; padding: 6px 14px; font-size: 0.85rem; font-weight: 600; text-decoration: none; border-radius: 6px; margin-top: 4px; text-align: center; }
            .btn:hover { background: #2b6cb0; }
            .footer { background: #edf2f7; color: #718096; padding: 16px; text-align: center; font-size: 0.8rem; border-top: 1px solid #e2e8f0; }
            .footer a { color: #4a5568; text-decoration: underline; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>${headerTitle}</h1>
                <p>${new Date().toUTCString()}</p>
            </div>
            <div class="content">
    `;

    // If no diffs
    if (diff.totalDiffs === 0) {
        html += `
            <div class="card" style="border-left: 4px solid #4a5568; background: #f7fafc; padding: 18px;">
                <h3 style="margin: 0 0 8px 0; color: #2d3748; font-size: 1.05rem;">✅ Stock Check Completed — No Changes</h3>
                <p style="margin: 0 0 10px 0; color: #4a5568; font-size: 0.95rem;">All <strong>${summary.totalGames} ${isRecommended ? 'recommended' : 'wanted'} games</strong> were checked across tracked stores. No stock status changes or price updates were detected since the last check.</p>
                <p style="margin: 0; color: #718096; font-size: 0.9rem;">Currently, <strong>${summary.inStockCount} game${summary.inStockCount === 1 ? '' : 's'}</strong> remain in stock across tracked stores.</p>
            </div>
        `;
    }

    // 1. Newly Available
    if (diff.newlyAvailable.length > 0) {
        html += `<div class="section-title">🟢 Newly In Stock (${diff.newlyAvailable.length})</div>`;
        for (const item of diff.newlyAvailable) {
            html += `
                <div class="card" style="border-left: 4px solid #38a169;">
                    <div class="card-header">
                        <a href="${item.bggUrl}" target="_blank" class="game-title">${item.gameName}</a>
                        <span class="badge-instock">IN STOCK</span>
                    </div>
                    <div class="meta-line">
                        <span><strong>Store:</strong> ${item.storeName}</span>
                        ${item.price ? `<span><strong>Price:</strong> ${item.price}</span>` : ''}
                    </div>
                    <div>
                        <a href="${item.url}" target="_blank" class="btn">View Store & Buy &rarr;</a>
                    </div>
                </div>
            `;
        }
    }

    // 2. Price Changes
    if (diff.priceChanges.length > 0) {
        html += `<div class="section-title">🏷️ Price Changes (${diff.priceChanges.length})</div>`;
        for (const item of diff.priceChanges) {
            html += `
                <div class="card" style="border-left: 4px solid #3182ce;">
                    <div class="card-header">
                        <a href="${item.bggUrl}" target="_blank" class="game-title">${item.gameName}</a>
                        <span class="badge-price">PRICE UPDATE</span>
                    </div>
                    <div class="meta-line">
                        <span><strong>Store:</strong> ${item.storeName}</span>
                        <span><strong>Price:</strong> <span style="text-decoration: line-through; color: #a0aec0;">${item.oldPrice}</span> &rarr; <strong style="color: #2b6cb0;">${item.newPrice}</strong></span>
                    </div>
                    <div>
                        <a href="${item.url}" target="_blank" class="btn">View Store &rarr;</a>
                    </div>
                </div>
            `;
        }
    }

    // 3. Out of Stock
    if (diff.noLongerAvailable.length > 0) {
        html += `<div class="section-title">🔴 No Longer In Stock (${diff.noLongerAvailable.length})</div>`;
        for (const item of diff.noLongerAvailable) {
            html += `
                <div class="card" style="border-left: 4px solid #e53e3e;">
                    <div class="card-header">
                        <a href="${item.bggUrl}" target="_blank" class="game-title">${item.gameName}</a>
                        ${item.isNowCompletelyOutOfStock ? '<span class="badge-allout">ALL STORES OUT</span>' : '<span class="badge-outofstock">OUT OF STOCK</span>'}
                    </div>
                    <div class="meta-line">
                        <span><strong>Sold out at:</strong> ${item.storeName}</span>
                        ${item.wasPrice ? `<span><strong>Was:</strong> ${item.wasPrice}</span>` : ''}
                    </div>
                    ${item.isNowCompletelyOutOfStock ? '<div style="font-size: 0.8rem; color: #e53e3e; font-weight: 600;">⚠️ This game is now out of stock across all checked stores.</div>' : ''}
                </div>
            `;
        }
    }

    // 4. BGG Market Listings
    if (diff.bggMarketNewListings.length > 0) {
        html += `<div class="section-title">📦 New BGG Market Listings (${diff.bggMarketNewListings.length})</div>`;
        for (const item of diff.bggMarketNewListings) {
            html += `
                <div class="card" style="border-left: 4px solid #dd6b20;">
                    <div class="card-header">
                        <a href="${item.bggUrl}" target="_blank" class="game-title">${item.gameName}</a>
                        <span class="badge-instock">BGG MARKET</span>
                    </div>
                    <div class="meta-line">
                        <span><strong>Seller:</strong> ${item.seller} ${item.condition ? `(${item.condition})` : ''}</span>
                        <span><strong>Price:</strong> ${item.price}</span>
                    </div>
                    <div>
                        <a href="${item.url}" target="_blank" class="btn">View BGG Listing &rarr;</a>
                    </div>
                </div>
            `;
        }
    }

    html += `
            </div>
            <div class="footer">
                This automated alert was generated by your Board Game Collection tracker.<br>
                <a href="${listUrl}" target="_blank">View your ${listTitle} List</a>
            </div>
        </div>
    </body>
    </html>
    `;

    return html;
}

function buildTextBody(diff, summary) {
    const listTitle = isRecommended ? 'Recommended Games' : 'Want to Buy';
    const listUrl = isRecommended 
        ? 'https://koraytugay.github.io/my-board-game-collection/recommended.html' 
        : 'https://koraytugay.github.io/my-board-game-collection/wanttobuy.html';
    const title = isRecommended ? '🎲 Recommended Games Stock Update' : '🎲 Board Game Stock Update';
    const lines = [`${title} (${new Date().toUTCString()})\n`];

    if (diff.totalDiffs === 0) {
        lines.push('✅ Stock check completed — no changes detected.');
        lines.push(`All ${summary.totalGames} ${isRecommended ? 'recommended' : 'wanted'} games were checked across tracked stores.`);
        lines.push(`Currently, ${summary.inStockCount}/${summary.totalGames} games remain in stock.`);
        lines.push('');
    }

    if (diff.newlyAvailable.length > 0) {
        lines.push(`🟢 NEWLY IN STOCK (${diff.newlyAvailable.length}):`);
        for (const item of diff.newlyAvailable) {
            lines.push(`- ${item.gameName}`);
            lines.push(`  Store: ${item.storeName} | Price: ${item.price || 'N/A'}`);
            lines.push(`  Link: ${item.url}`);
        }
        lines.push('');
    }

    if (diff.priceChanges.length > 0) {
        lines.push(`🏷️ PRICE CHANGES (${diff.priceChanges.length}):`);
        for (const item of diff.priceChanges) {
            lines.push(`- ${item.gameName}`);
            lines.push(`  Store: ${item.storeName} | Price: ${item.oldPrice} -> ${item.newPrice}`);
            lines.push(`  Link: ${item.url}`);
        }
        lines.push('');
    }

    if (diff.noLongerAvailable.length > 0) {
        lines.push(`🔴 NO LONGER IN STOCK (${diff.noLongerAvailable.length}):`);
        for (const item of diff.noLongerAvailable) {
            const extra = item.isNowCompletelyOutOfStock ? ' [COMPLETELY OUT OF STOCK ACROSS ALL STORES]' : '';
            lines.push(`- ${item.gameName} (Sold out at ${item.storeName})${extra}`);
        }
        lines.push('');
    }

    if (diff.bggMarketNewListings.length > 0) {
        lines.push(`📦 NEW BGG MARKET LISTINGS (${diff.bggMarketNewListings.length}):`);
        for (const item of diff.bggMarketNewListings) {
            lines.push(`- ${item.gameName} from seller ${item.seller} for ${item.price}`);
            lines.push(`  Link: ${item.url}`);
        }
        lines.push('');
    }

    lines.push('---');
    lines.push(`View your ${listTitle} list: ${listUrl}`);
    return lines.join('\n');
}

async function sendNotificationEmail(subject, htmlBody, textBody) {
    const icloudEmail = process.env.ICLOUD_EMAIL;
    const icloudPassword = process.env.ICLOUD_APP_PASSWORD;
    const recipientEmail = process.env.NOTIFICATION_EMAIL || icloudEmail;

    if (!icloudEmail || !icloudPassword) {
        console.log('[INFO] ICLOUD_EMAIL or ICLOUD_APP_PASSWORD secret is not configured. Skipping email dispatch.');
        return;
    }

    console.log(`[INFO] Preparing email notification via iCloud SMTP (from: ${icloudEmail} to: ${recipientEmail})...`);

    const transporter = nodemailer.createTransport({
        host: 'smtp.mail.me.com',
        port: 587,
        secure: false, // Port 587 uses STARTTLS
        auth: {
            user: icloudEmail,
            pass: icloudPassword
        }
    });

    const mailOptions = {
        from: `"Board Game Collection" <${icloudEmail}>`,
        to: recipientEmail,
        subject: subject,
        text: textBody,
        html: htmlBody
    };

    try {
        const info = await transporter.sendMail(mailOptions);
        console.log(`[SUCCESS] Notification email sent successfully! Message ID: ${info.messageId}`);
    } catch (err) {
        console.error(`[ERROR] Failed to send email via iCloud SMTP:`, err.message);
    }
}

async function run() {
    console.log('--- Checking for board game stock diffs ---');
    const range = isRecommended ? getRecommendedRange() : null;
    let baseRef = 'HEAD';

    if (isDailySummary) {
        const since = getSinceArg();
        baseRef = getBaselineCommit(AVAILABILITY_FILE, since);
        console.log(`[Daily Summary] Comparing current recommended games availability against baseline commit ${baseRef} (before ${since})...`);
    } else if (range && range.hasRangeFlag) {
        const endDisplay = range.end === Infinity ? '400+' : range.end;
        console.log(`Recommended games check batch: #${range.start + 1} to #${endDisplay}`);
    }

    const gamesMap = getGameDetailsMap();
    const prevData = getPreviousAvailability(baseRef);
    const currData = getCurrentAvailability();

    const prevCount = Object.keys(prevData).length;
    const currCount = Object.keys(currData).length;
    console.log(`Comparing previous availability (${prevCount} games, ref: ${baseRef}) with current availability (${currCount} games)...`);

    const diff = computeDiff(prevData, currData, gamesMap);
    const summary = getOverallInStockSummary(currData, gamesMap);

    console.log(`Diff results: ${diff.newlyAvailable.length} newly in stock, ${diff.noLongerAvailable.length} out of stock, ${diff.priceChanges.length} price changes, ${diff.bggMarketNewListings.length} BGG listings.`);

    const subject = buildEmailSubject(diff, summary, range, isDailySummary);
    const htmlBody = buildHtmlBody(diff, gamesMap, summary, range, isDailySummary);
    const textBody = buildTextBody(diff, summary);

    console.log(`Subject: ${subject}`);
    await sendNotificationEmail(subject, htmlBody, textBody);
}

run().catch(err => {
    console.error('Fatal error running stock notification:', err);
    // Don't fail the workflow if email fails
    process.exit(0);
});
