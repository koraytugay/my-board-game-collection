const USERNAME = 'koraytugay';
const COLLECTION_XML_FILE = 'collection.xml';

async function getCollection(onlyOwned = true) {
    try {
        const response = await fetch(COLLECTION_XML_FILE);

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const xmlText = await response.text();
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlText, 'text/xml');

        const errorNode = xmlDoc.querySelector('parsererror');
        if (errorNode) {
            throw new Error('Error parsing XML response');
        }

        let rawItems = Array.from(xmlDoc.querySelectorAll('item'));

        // Deduplicate items by objectid, prioritizing boardgameexpansion subtype
        const itemMap = new Map();
        rawItems.forEach(item => {
            const id = item.getAttribute('objectid');
            const subtype = item.getAttribute('subtype');
            if (!itemMap.has(id) || subtype === 'boardgameexpansion') {
                itemMap.set(id, item);
            }
        });
        let items = Array.from(itemMap.values());

        if (onlyOwned === 'wanttoplay') {
            items = items.filter(item => {
                const status = item.querySelector('status');
                const isWantToPlay = status && status.getAttribute('wanttoplay') === '1';
                const subtype = item.getAttribute('subtype');
                const isValidType = subtype === 'boardgame' || subtype === 'boardgameexpansion';
                return isWantToPlay && isValidType;
            });
        } else if (onlyOwned === 'wanttobuy') {
            items = items.filter(item => {
                const status = item.querySelector('status');
                const isWantToBuy = status && status.getAttribute('wanttobuy') === '1';
                const subtype = item.getAttribute('subtype');
                const isValidType = subtype === 'boardgame' || subtype === 'boardgameexpansion';
                return isWantToBuy && isValidType;
            });
        } else if (onlyOwned === 'wantintrade' || onlyOwned === 'want') {
            items = items.filter(item => {
                const status = item.querySelector('status');
                const isWantInTrade = status && status.getAttribute('want') === '1';
                const subtype = item.getAttribute('subtype');
                const isValidType = subtype === 'boardgame' || subtype === 'boardgameexpansion';
                return isWantInTrade && isValidType;
            });
        } else if (onlyOwned === 'liketohave') {
            items = items.filter(item => {
                const status = item.querySelector('status');
                const isWishlist = status && status.getAttribute('wishlist') === '1';
                const priority = status ? status.getAttribute('wishlistpriority') : null;
                const isLikeToHave = isWishlist && priority === '3';
                const subtype = item.getAttribute('subtype');
                const isValidType = subtype === 'boardgame' || subtype === 'boardgameexpansion';
                return isLikeToHave && isValidType;
            });
        } else if (onlyOwned === 'thinkingabout' || onlyOwned === 'thinkingaboutit' || onlyOwned === 'wishlist') {
            items = items.filter(item => {
                const status = item.querySelector('status');
                const isWishlist = status && status.getAttribute('wishlist') === '1';
                const priority = status ? status.getAttribute('wishlistpriority') : null;
                const isThinking = isWishlist && (priority === '4' || (!priority && onlyOwned === 'wishlist'));
                const subtype = item.getAttribute('subtype');
                const isValidType = subtype === 'boardgame' || subtype === 'boardgameexpansion';
                return isThinking && isValidType;
            });
        } else if (onlyOwned === 'wanttosell' || onlyOwned === 'forsale' || onlyOwned === 'fortrade') {
            items = items.filter(item => {
                const status = item.querySelector('status');
                const isForSale = status && status.getAttribute('fortrade') === '1';
                const subtype = item.getAttribute('subtype');
                const isValidType = subtype === 'boardgame' || subtype === 'boardgameexpansion';
                return isForSale && isValidType;
            });
        } else if (onlyOwned === true) {
            items = items.filter(item => {
                const status = item.querySelector('status');
                const isOwned = status && status.getAttribute('own') === '1';
                const isBoardGame = item.getAttribute('subtype') === 'boardgame';
                return isOwned && isBoardGame;
            });
        }

        if (items.length === 0) {
            return [];
        }

        return items.map(item => {
            const name = item.querySelector('name')?.textContent || 'Unknown Game';
            const yearPublished = item.querySelector('yearpublished')?.textContent || 'N/A';
            const thumbnail = item.querySelector('thumbnail')?.textContent || '';
            const image = item.querySelector('image')?.textContent || thumbnail;
            const objectId = item.getAttribute('objectid');
            const comment = item.querySelector('comment')?.textContent || '';

            // Resolve local images
            const getLocalPath = (url, type) => {
                if (!url) return '';
                try {
                    const urlObj = new URL(url);
                    const ext = urlObj.pathname.split('.').pop() || 'jpg';
                    return `images/${type}/${objectId}.${ext}`;
                } catch (e) {
                    return url;
                }
            };

            const localThumbnail = getLocalPath(thumbnail, 'thumbnails');
            const localImage = getLocalPath(image, 'full');

            const minPlayers = parseInt(item.querySelector('stats')?.getAttribute('minplayers')) || 0;
            const maxPlayers = parseInt(item.querySelector('stats')?.getAttribute('maxplayers')) || 0;
            const playingTime = parseInt(item.querySelector('stats')?.getAttribute('playingtime')) || 0;
            const numPlays = parseInt(item.querySelector('numplays')?.textContent) || 0;
            const ratingValue = item.querySelector('stats rating average')?.getAttribute('value') || '0';
            const rating = parseFloat(ratingValue) || 0;
            const myRatingValue = item.querySelector('stats rating')?.getAttribute('value') || '0';
            const myRating = parseFloat(myRatingValue) || 0;

            const status = item.querySelector('status');
            const isForSale = status ? status.getAttribute('fortrade') === '1' : false;
            const isWantToBuy = status ? status.getAttribute('wanttobuy') === '1' : false;
            const isWantInTrade = status ? status.getAttribute('want') === '1' : false;
            const isWantToPlay = status ? status.getAttribute('wanttoplay') === '1' : false;
            const isOwned = status ? status.getAttribute('own') === '1' : false;
            const isWishlist = status ? status.getAttribute('wishlist') === '1' : false;
            const wishlistPriority = status ? parseInt(status.getAttribute('wishlistpriority'), 10) || null : null;
            const isLikeToHave = isWishlist && wishlistPriority === 3;
            const isThinkingAboutIt = isWishlist && (wishlistPriority === 4 || wishlistPriority === null);
            const wishlistComment = status ? (status.getAttribute('wishlistcomment') || '') : '';

            return {
                name,
                yearPublished,
                thumbnail: localThumbnail || thumbnail,
                image: localImage || image || localThumbnail || thumbnail,
                minPlayers,
                maxPlayers,
                playingTime,
                numPlays,
                objectId,
                rating,
                myRating,
                comment,
                isForSale,
                isWantToBuy,
                isWantInTrade,
                isWantToPlay,
                isOwned,
                isWishlist,
                wishlistPriority,
                isLikeToHave,
                isThinkingAboutIt,
                wishlistComment
            };
        });
    } catch (error) {
        console.error('Error fetching collection:', error);
        throw error;
    }
}

async function getPlaysForMonth(year, month) {
    const monthStr = String(month + 1).padStart(2, '0');
    const fileName = `plays/${year}-${monthStr}.xml`;
    
    try {
        const response = await fetch(fileName);

        if (!response.ok) {
            if (response.status === 404) return [];
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const xmlText = await response.text();
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlText, 'text/xml');

        const plays = xmlDoc.querySelectorAll('play');
        return Array.from(plays).map(play => {
            return {
                id: play.getAttribute('id'),
                date: play.getAttribute('date'),
                quantity: parseInt(play.getAttribute('quantity')) || 1,
                gameName: play.querySelector('item')?.getAttribute('name') || 'Unknown Game',
                gameId: play.querySelector('item')?.getAttribute('objectid'),
                location: play.getAttribute('location') || ''
            };
        });
    } catch (error) {
        console.warn(`Could not load plays for ${year}-${monthStr}:`, error);
        return [];
    }
}

async function getLastPlayDates() {
    const dates = {};
    const now = new Date();
    const fetchPromises = [];

    // Fetch last 12 months of plays in parallel
    for (let i = 0; i < 12; i++) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        fetchPromises.push(getPlaysForMonth(d.getFullYear(), d.getMonth()));
    }

    const allMonthlyPlays = await Promise.all(fetchPromises);
    
    allMonthlyPlays.forEach(plays => {
        plays.forEach(play => {
            const gameId = play.gameId;
            if (!dates[gameId] || play.date > dates[gameId]) {
                dates[gameId] = play.date;
            }
        });
    });

    return dates;
}

function calculateHIndex(games) {
    const plays = games.map(g => g.numPlays).sort((a, b) => b - a);
    let hIndex = 0;
    for (let i = 0; i < plays.length; i++) {
        if (plays[i] >= i + 1) {
            hIndex = i + 1;
        } else {
            break;
        }
    }
    return hIndex;
}

// --- Shared Store Definitions & Price Formatting ---
const STORES = STORE_REGISTRY.map(store => ({ key: store.key, name: getStoreLabel(store), url: store.url }));

function getStoreCurrency(storeKey) {
    return STORE_REGISTRY.find(store => store.key === storeKey)?.currency || null;
}

function formatPrice(price, storeKey = null) {
    if (!price && price !== 0) return '';
    const str = String(price).trim();
    if (!str) return '';

    const clean = str.replace(/,/g, '');
    const match = clean.match(/[0-9]+(?:\.[0-9]+)?/);
    if (!match) return str;
    const num = parseFloat(match[0]);
    if (isNaN(num)) return str;

    const storeCurrency = getStoreCurrency(storeKey);
    let cadPrice;
    if (str.includes('€') || /\bEUR\b/i.test(str) || storeCurrency === 'EUR') {
        cadPrice = num * 1.65;
    } else if (str.includes('£') || /\bGBP\b/i.test(str) || storeCurrency === 'GBP') {
        cadPrice = num * 1.90;
    } else if (/\bUSD\b/i.test(str) || /\$US\b/i.test(str) || /US\$/i.test(str) || storeCurrency === 'USD') {
        cadPrice = num * 1.40;
    } else {
        cadPrice = num;
    }

    return `$${cadPrice.toFixed(2)}`;
}

function extractNumericPrice(priceStr) {
    if (!priceStr) return null;
    const clean = String(priceStr).replace(/,/g, '');
    const match = clean.match(/[0-9]+(?:\.[0-9]+)?/);
    return match ? parseFloat(match[0]) : null;
}


// --- Shared HTML & Stock Helpers ---
function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// BGG Market sellers to hide; filled from skipped-sellers.json by pages that use it (stores.html).
const skippedBggSellers = new Set();

function getActiveBggListings(game) {
    const bggmkt = game.availability?.bggMarket;
    if (!bggmkt) return [];
    let listings = [];
    if (Array.isArray(bggmkt.listings) && bggmkt.listings.length > 0) {
        listings = bggmkt.listings.filter(l => !l.ignored && (extractNumericPrice(l.price) === null || extractNumericPrice(l.price) > 5.0));
    } else if (bggmkt.available && bggmkt.url && !bggmkt.ignored) {
        const num = extractNumericPrice(bggmkt.price);
        if (num === null || num > 5.0) {
            listings = [{
                price: bggmkt.price,
                seller: bggmkt.seller || 'BGG Market',
                condition: bggmkt.condition || '',
                url: bggmkt.url,
                ignored: false
            }];
        }
    }
    return listings.filter(l => !l.seller || !skippedBggSellers.has(l.seller.toLowerCase()));
}

function isGameInStockAtStore(game, storeKey) {
    if (!game.availability || !game.availability[storeKey]) return false;
    const storeData = game.availability[storeKey];
    if (storeKey === 'bggMarket') {
        return getActiveBggListings(game).length > 0;
    }
    if (!storeData.available) return false;
    const num = extractNumericPrice(storeData.price);
    if (num !== null && num <= 5.0) return false;
    return true;
}

function isGameInStockAtAnyStore(game) {
    return STORES.some(store => isGameInStockAtStore(game, store.key));
}

// Biggest in-stock retail discount of 20% or more, or null.
function getGameDealInfo(game) {
    if (!game.availability) return null;
    let maxDeal = null;
    for (const [storeKey, storeData] of Object.entries(game.availability)) {
        if (storeKey === 'bggMarket') continue;
        if (storeData && isGameInStockAtStore(game, storeKey) && storeData.deal && storeData.deal.discountPercent >= 20) {
            if (!maxDeal || storeData.deal.discountPercent > maxDeal.discountPercent) {
                maxDeal = {
                    storeKey,
                    discountPercent: storeData.deal.discountPercent,
                    previousPrice: storeData.deal.previousPrice,
                    currentPrice: storeData.price
                };
            }
        }
    }
    return maxDeal;
}

function hasGameMajorDeal(game) {
    return getGameDealInfo(game) !== null;
}

// --- Stock Data Freshness ---
const STOCK_WARN_HOURS = 12;   // status line turns amber
const STOCK_STALE_HOURS = 24;  // status line turns red, store chips fade

// Problems hit while loading availability files, shown by renderStockStatus().
const stockDataProblems = [];

// Loads an availability JSON file. On failure returns {} like before, but records the problem.
async function loadAvailabilityFile(file) {
    try {
        const res = await fetch(file);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.json();
    } catch (error) {
        console.error(`Could not load ${file}:`, error);
        stockDataProblems.push(`${file} could not be loaded (${error.message})`);
        return {};
    }
}

function hoursSince(isoDate) {
    const t = Date.parse(isoDate);
    return isNaN(t) ? null : (Date.now() - t) / 3600000;
}

function isStaleCheck(isoDate) {
    const hours = hoursSince(isoDate);
    return hours !== null && hours > STOCK_STALE_HOURS;
}

function formatCheckAge(isoDate) {
    const hours = hoursSince(isoDate);
    if (hours === null) return 'never';
    if (hours < 1) return `${Math.max(1, Math.round(hours * 60))} min ago`;
    if (hours < 48) return `${Math.round(hours)} hour${Math.round(hours) === 1 ? '' : 's'} ago`;
    return `${Math.round(hours / 24)} days ago`;
}

function formatCheckDate(isoDate) {
    const d = new Date(isoDate);
    return isNaN(d) ? 'unknown' : d.toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

// Newest lastChecked across one or more availability maps ({ gameId: { storeKey: data } }).
function getNewestStockCheck(...availabilityMaps) {
    let newest = null;
    for (const map of availabilityMaps) {
        for (const stores of Object.values(map || {})) {
            for (const data of Object.values(stores || {})) {
                if (data?.lastChecked && (!newest || data.lastChecked > newest)) newest = data.lastChecked;
            }
        }
    }
    return newest;
}

// Shows "Stock checked X ago" (amber/red when old) plus any load problems, just below #error.
function renderStockStatus(...availabilityMaps) {
    const anchor = document.getElementById('error');
    if (!anchor) return;
    document.getElementById('stock-status')?.remove();

    const newest = getNewestStockCheck(...availabilityMaps);
    const hours = hoursSince(newest);
    const level = stockDataProblems.length || hours === null || hours > STOCK_STALE_HOURS ? 'stale'
        : hours > STOCK_WARN_HOURS ? 'warn' : 'ok';

    const el = document.createElement('div');
    el.id = 'stock-status';
    el.className = `stock-status stock-status-${level}`;
    const checked = newest
        ? `Stock checked <strong>${formatCheckAge(newest)}</strong> <span class="stock-status-date">(${formatCheckDate(newest)})</span>`
        : 'No stock checks found';
    const problems = stockDataProblems.map(p => `<div class="stock-status-problem">⚠️ ${escapeHtml(p)}. Stock shown may be incomplete.</div>`).join('');
    el.innerHTML = `<div>${level === 'ok' ? '🟢' : level === 'warn' ? '🟡' : '🔴'} ${checked}</div>${problems}`;
    anchor.insertAdjacentElement('afterend', el);
}
