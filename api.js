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
const STORES = [
    { key: 'boardGameBliss', name: '🇨🇦 BoardGameBliss' },
    { key: 'fourZeroOneGames', name: '🇨🇦 401 Games' },
    { key: 'lvlUpGames', name: '🇨🇦 LVLUP Games' },
    { key: 'asDesJeux', name: '🇨🇦 As des Jeux' },
    { key: 'greatBoardgames', name: '🇨🇦 Great Boardgames' },
    { key: 'meeplemart', name: '🇨🇦 Meeplemart' },
    { key: 'kbHobbies', name: '🇨🇦 KB Hobbies' },
    { key: 'miniatureMarket', name: '🇺🇸 Miniature Market' },
    { key: 'cardhaus', name: '🇺🇸 Cardhaus Games' },
    { key: 'theGameSteward', name: '🇺🇸 The Game Steward' },
    { key: 'amazonCa', name: '🇨🇦 Amazon.ca' },
    { key: 'woodForSheep', name: '🇨🇦 Wood for Sheep' },
    { key: 'jjCards', name: '🇨🇦 J&J Cards' },
    { key: 'boardgamesCa', name: '🇨🇦 Boardgames.ca' },
    { key: 'screenFreeGames', name: '🇨🇦 Screen Free Games' },
    { key: 'allSystemsGo', name: '🇨🇦 All Systems Go' },
    { key: 'tabletopCafe', name: '🇨🇦 Tabletop Cafe' },
    { key: 'elevatedBoardGames', name: '🇨🇦 Elevated Board Games' },
    { key: 'diceHollow', name: '🇨🇦 Dice Hollow' },
    { key: 'laPioche', name: '🇨🇦 La Pioche' },
    { key: 'alwaysGames', name: '🇨🇦 Always Games' },
    { key: 'legendsWarehouse', name: '🇨🇦 Legends Warehouse' },
    { key: 'boardGameBandit', name: '🇨🇦 Board Game Bandit' },
    { key: 'zatu', name: '🇬🇧 Zatu Games' },
    { key: 'chaosCards', name: '🇬🇧 Chaos Cards' },
    { key: 'philibert', name: '🇫🇷 Philibert' },
    { key: 'crowdfinder', name: '🇧🇪 Crowdfinder' },
    { key: 'bggMarket', name: 'BGG Market' }
];

function formatPrice(price, storeKey = null) {
    if (!price && price !== 0) return '';
    const str = String(price).trim();
    if (!str) return '';

    const clean = str.replace(/,/g, '');
    const match = clean.match(/[0-9]+(?:\.[0-9]+)?/);
    if (!match) return str;
    const num = parseFloat(match[0]);
    if (isNaN(num)) return str;

    let cadPrice;
    if (str.includes('€') || /\bEUR\b/i.test(str) || storeKey === 'philibert' || storeKey === 'crowdfinder') {
        cadPrice = num * 1.65;
    } else if (str.includes('£') || /\bGBP\b/i.test(str) || storeKey === 'zatu' || storeKey === 'chaosCards') {
        cadPrice = num * 1.90;
    } else if (/\bUSD\b/i.test(str) || /\$US\b/i.test(str) || /US\$/i.test(str) || storeKey === 'miniatureMarket' || storeKey === 'cardhaus' || storeKey === 'theGameSteward') {
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

