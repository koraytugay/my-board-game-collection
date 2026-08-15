const fs = require('fs');
const { execSync } = require('child_process');
const nodemailer = require('nodemailer');

const AVAILABILITY_FILE = 'availability.json';
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
    zatu: { name: 'Zatu Games', icon: '🛡️' },
    bggMarket: { name: 'BGG Market', icon: '🏷️' }
};

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
                map[objectId] = {
                    name: nameMatch ? decodeXmlEntities(nameMatch[1].trim()) : `Game #${objectId}`,
                    image: imageMatch ? imageMatch[1] : (thumbMatch ? thumbMatch[1] : ''),
                    thumbnail: thumbMatch ? thumbMatch[1] : (imageMatch ? imageMatch[1] : ''),
                    year: yearMatch ? yearMatch[1] : ''
                };
            }
        } catch (e) {
            console.error('Error parsing collection.xml:', e.message);
        }
    }
    return map;
}

function getPreviousAvailability() {
    // Try reading previous availability from git HEAD
    try {
        const stdout = execSync('git show HEAD:availability.json', {
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
    if (!price) return null;
    return String(price).replace(/[^0-9.]/g, '').trim();
}

function formatPrice(price) {
    if (!price) return '';
    const str = String(price).trim();
    if (/^[$€£]/.test(str)) return str;
    return `$${str}`;
}

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
            // 3. Price change for an in-stock game
            else if (wasAvail && isAvail && prev.price && curr.price) {
                const normPrev = normalizePrice(prev.price);
                const normCurr = normalizePrice(curr.price);
                if (normPrev && normCurr && normPrev !== normCurr) {
                    priceChanges.push({
                        gameId,
                        gameName,
                        bggUrl,
                        storeKey,
                        storeName,
                        oldPrice: formatPrice(prev.price),
                        newPrice: formatPrice(curr.price),
                        url: curr.url || bggUrl
                    });
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

function buildEmailSubject(diff, summary) {
    if (diff.totalDiffs === 0) {
        return `🎲 Board Game Stock Check: No changes detected (${summary.inStockCount}/${summary.totalGames} in stock)`;
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
    return `🎲 Board Game Alert: ${parts.join(', ')}`;
}

function buildHtmlBody(diff, gamesMap, summary) {
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
                <h1>🎲 Board Game Stock Update</h1>
                <p>${new Date().toUTCString()}</p>
            </div>
            <div class="content">
    `;

    // If no diffs
    if (diff.totalDiffs === 0) {
        html += `
            <div class="card" style="border-left: 4px solid #4a5568; background: #f7fafc; padding: 18px;">
                <h3 style="margin: 0 0 8px 0; color: #2d3748; font-size: 1.05rem;">✅ Stock Check Completed — No Changes</h3>
                <p style="margin: 0 0 10px 0; color: #4a5568; font-size: 0.95rem;">All <strong>${summary.totalGames} wanted games</strong> were checked across tracked stores. No stock status changes or price updates were detected since the last check.</p>
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
                <a href="https://koraytugay.github.io/my-board-game-collection/wanttobuy.html" target="_blank">View your Want to Buy List</a>
            </div>
        </div>
    </body>
    </html>
    `;

    return html;
}

function buildTextBody(diff, summary) {
    const lines = [`🎲 Board Game Stock Update (${new Date().toUTCString()})\n`];

    if (diff.totalDiffs === 0) {
        lines.push('✅ Stock check completed — no changes detected.');
        lines.push(`All ${summary.totalGames} wanted games were checked across tracked stores.`);
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
    lines.push('View your Want to Buy list: https://koraytugay.github.io/my-board-game-collection/wanttobuy.html');
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
    const gamesMap = getGameDetailsMap();
    const prevData = getPreviousAvailability();
    const currData = getCurrentAvailability();

    const prevCount = Object.keys(prevData).length;
    const currCount = Object.keys(currData).length;
    console.log(`Comparing previous availability (${prevCount} games) with current availability (${currCount} games)...`);

    const diff = computeDiff(prevData, currData, gamesMap);
    const summary = getOverallInStockSummary(currData, gamesMap);

    console.log(`Diff results: ${diff.newlyAvailable.length} newly in stock, ${diff.noLongerAvailable.length} out of stock, ${diff.priceChanges.length} price changes, ${diff.bggMarketNewListings.length} BGG listings.`);

    const subject = buildEmailSubject(diff, summary);
    const htmlBody = buildHtmlBody(diff, gamesMap, summary);
    const textBody = buildTextBody(diff, summary);

    console.log(`Subject: ${subject}`);
    await sendNotificationEmail(subject, htmlBody, textBody);
}

run().catch(err => {
    console.error('Fatal error running stock notification:', err);
    // Don't fail the workflow if email fails
    process.exit(0);
});
