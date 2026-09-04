// stores.js - Store & Seller Availability for Want to Buy & Want in Trade Games

let allGames = [];
let filteredGames = [];
let currentSort = 'name';
let currentViewMode = 'grid';
let skippedSellers = new Set();

function populateListTypeFilter() {
    const listSelect = document.getElementById('list-filter');
    if (!listSelect) return;

    const currentVal = listSelect.value;
    const wtbCount = allGames.filter(g => g.isWantToBuy).length;
    const tradeCount = allGames.filter(g => g.isWantInTrade).length;
    const likeCount = allGames.filter(g => g.isLikeToHave).length;
    const allCount = allGames.length;

    listSelect.innerHTML = `
        <option value="all">All (${allCount})</option>
        <option value="wanttobuy">Want to Buy (${wtbCount})</option>
        <option value="wantintrade">Want in Trade (${tradeCount})</option>
        <option value="liketohave">Like to Have (${likeCount})</option>
    `;

    if (['all', 'wanttobuy', 'wantintrade', 'liketohave'].includes(currentVal)) {
        listSelect.value = currentVal;
    } else {
        listSelect.value = 'all';
    }
}

const STORES = [
    { key: 'boardGameBliss', name: '🇨🇦 BoardGameBliss' },
    { key: 'fourZeroOneGames', name: '🇨🇦 401 Games' },
    { key: 'lvlUpGames', name: '🇨🇦 LVLUP Games' },
    { key: 'asDesJeux', name: '🇨🇦 As des Jeux' },
    { key: 'greatBoardgames', name: '🇨🇦 Great Boardgames' },
    { key: 'meeplemart', name: '🇨🇦 Meeplemart' },
    { key: 'kbHobbies', name: '🇨🇦 KB Hobbies' },
    { key: 'miniatureMarket', name: '🇺🇸 Miniature Market' },
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

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
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

    let cadPrice;
    if (str.includes('€') || /\bEUR\b/i.test(str) || storeKey === 'philibert' || storeKey === 'crowdfinder') {
        cadPrice = num * 1.65;
    } else if (str.includes('£') || /\bGBP\b/i.test(str) || storeKey === 'zatu' || storeKey === 'chaosCards') {
        cadPrice = num * 1.90;
    } else if (/\bUSD\b/i.test(str) || /\$US\b/i.test(str) || /US\$/i.test(str) || storeKey === 'miniatureMarket') {
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
    return listings.filter(l => !l.seller || !skippedSellers.has(l.seller.toLowerCase()));
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

function isGameSoldBySeller(game, sellerName) {
    if (!sellerName || sellerName === 'all') return true;
    const listings = getActiveBggListings(game);
    return listings.some(l => (l.seller || '').toLowerCase() === sellerName.toLowerCase());
}

function populateStoreFilter() {
    const storeSelect = document.getElementById('store-filter');
    if (!storeSelect) return;

    const currentValue = storeSelect.value;
    storeSelect.innerHTML = '<option value="all">All Stores</option>';

    const storesWithStock = [];
    STORES.filter(s => s.key !== 'bggMarket').forEach(store => {
        const inStockCount = allGames.filter(game => isGameInStockAtStore(game, store.key)).length;
        if (inStockCount > 0) {
            storesWithStock.push({
                ...store,
                count: inStockCount
            });
        }
    });

    storesWithStock.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));

    storesWithStock.forEach(store => {
        const option = document.createElement('option');
        option.value = store.key;
        option.textContent = `${store.name} (${store.count})`;
        storeSelect.appendChild(option);
    });

    if (storesWithStock.some(s => s.key === currentValue)) {
        storeSelect.value = currentValue;
    } else {
        storeSelect.value = 'all';
    }
}

function populateSellerFilter() {
    const sellerSelect = document.getElementById('seller-filter');
    if (!sellerSelect) return;

    const currentValue = sellerSelect.value;
    sellerSelect.innerHTML = '<option value="all">All Sellers</option>';

    const sellerCountMap = new Map();
    allGames.forEach(game => {
        const listings = getActiveBggListings(game);
        const seenForThisGame = new Set();
        listings.forEach(l => {
            if (l.seller && !seenForThisGame.has(l.seller.toLowerCase())) {
                seenForThisGame.add(l.seller.toLowerCase());
                const existing = sellerCountMap.get(l.seller.toLowerCase()) || { seller: l.seller, count: 0 };
                existing.count++;
                sellerCountMap.set(l.seller.toLowerCase(), existing);
            }
        });
    });

    const sellers = Array.from(sellerCountMap.values());
    sellers.sort((a, b) => {
        if (b.count !== a.count) {
            return b.count - a.count;
        }
        return a.seller.localeCompare(b.seller, undefined, { sensitivity: 'base' });
    });

    sellers.forEach(s => {
        const option = document.createElement('option');
        option.value = s.seller;
        option.textContent = `${s.seller} (${s.count})`;
        sellerSelect.appendChild(option);
    });

    if (sellers.some(s => s.seller.toLowerCase() === currentValue.toLowerCase())) {
        sellerSelect.value = currentValue;
    } else {
        sellerSelect.value = 'all';
    }
}

function populateDesignerFilter() {
    const designerSelect = document.getElementById('designer-filter');
    if (!designerSelect) return;

    const currentValue = designerSelect.value;
    designerSelect.innerHTML = '<option value="all">All Designers</option>';

    const designerCountMap = new Map();
    allGames.forEach(game => {
        const designers = game.designers || [];
        designers.forEach(d => {
            if (d && d !== '(Uncredited)') {
                const key = d.toLowerCase();
                const existing = designerCountMap.get(key) || { designer: d, count: 0 };
                existing.count++;
                designerCountMap.set(key, existing);
            }
        });
    });

    const designers = Array.from(designerCountMap.values());
    designers.sort((a, b) => {
        if (b.count !== a.count) {
            return b.count - a.count;
        }
        return a.designer.localeCompare(b.designer, undefined, { sensitivity: 'base' });
    });

    designers.forEach(d => {
        const option = document.createElement('option');
        option.value = d.designer;
        option.textContent = `${d.designer} (${d.count})`;
        designerSelect.appendChild(option);
    });

    if (designers.some(d => d.designer.toLowerCase() === currentValue.toLowerCase())) {
        designerSelect.value = currentValue;
    } else {
        designerSelect.value = 'all';
    }
}

function onStoreFilterChange() {
    const storeSelect = document.getElementById('store-filter');
    const sellerSelect = document.getElementById('seller-filter');
    if (storeSelect && storeSelect.value !== 'all' && sellerSelect) {
        sellerSelect.value = 'all';
    }
    applyFilters();
}

function onSellerFilterChange() {
    const storeSelect = document.getElementById('store-filter');
    const sellerSelect = document.getElementById('seller-filter');
    if (sellerSelect && sellerSelect.value !== 'all' && storeSelect) {
        storeSelect.value = 'all';
    }
    applyFilters();
}

async function fetchAllStoreGames() {
    const loadingEl = document.getElementById('loading');
    const errorEl = document.getElementById('error');
    const controlsEl = document.getElementById('controls');

    try {
        const [
            allCollection,
            storeAvail,
            likeToHaveAvail,
            designersRes,
            skippedSellersData
        ] = await Promise.all([
            getCollection(false).catch(err => { console.warn('Collection load error:', err); return []; }),
            fetch('availability.json').then(res => res.ok ? res.json() : {}).catch(() => ({})),
            fetch('availability-liketohave.json').then(res => res.ok ? res.json() : {}).catch(() => ({})),
            fetch('designers.json').then(res => res.ok ? res.json() : {}).catch(() => ({})),
            fetch('skipped-sellers.json').then(res => res.ok ? res.json() : []).catch(() => [])
        ]);

        if (Array.isArray(skippedSellersData)) {
            skippedSellersData.forEach(s => skippedSellers.add(String(s).toLowerCase()));
        }

        const gameMap = new Map();

        // Include Want to Buy, Want in Trade, and Like to Have games
        const targetCollection = allCollection.filter(game => game.isWantToBuy || game.isWantInTrade || game.isLikeToHave);

        targetCollection.forEach(game => {
            const id = String(game.objectId);
            const designers = designersRes[id]?.designers || [];
            const avail = likeToHaveAvail[id] || storeAvail[id] || {};

            gameMap.set(id, {
                objectId: id,
                name: game.name || 'Unknown Game',
                yearPublished: game.yearPublished || 'N/A',
                thumbnail: game.thumbnail || '',
                image: game.image || game.thumbnail || '',
                minPlayers: game.minPlayers || 0,
                maxPlayers: game.maxPlayers || 0,
                playingTime: game.playingTime || 0,
                rating: game.rating || 0,
                myRating: game.myRating || 0,
                comment: game.comment || '',
                designers: designers,
                isWantToBuy: !!game.isWantToBuy,
                isWantInTrade: !!game.isWantInTrade,
                isLikeToHave: !!game.isLikeToHave,
                availability: JSON.parse(JSON.stringify(avail))
            });
        });

        // Keep all games that have in-stock availability at at least one store/seller
        allGames = Array.from(gameMap.values()).filter(game => isGameInStockAtAnyStore(game));

        populateListTypeFilter();
        populateStoreFilter();
        populateSellerFilter();
        populateDesignerFilter();

        // Check if list, store or seller is in URL query
        const urlParams = new URLSearchParams(window.location.search);
        const listParam = urlParams.get('list');
        const storeParam = urlParams.get('store');
        const sellerParam = urlParams.get('seller');
        if (listParam) {
            const listSelect = document.getElementById('list-filter');
            if (listSelect) listSelect.value = listParam;
        }
        if (storeParam) {
            const storeSelect = document.getElementById('store-filter');
            if (storeSelect) storeSelect.value = storeParam;
        } else if (sellerParam) {
            const sellerSelect = document.getElementById('seller-filter');
            if (sellerSelect) sellerSelect.value = sellerParam;
        }

        filteredGames = [...allGames];
        sortGames(currentSort);

        loadingEl.style.display = 'none';
        controlsEl.style.display = 'block';

        loadDarkModePreference();

    } catch (error) {
        console.error('Error fetching store games:', error);
        loadingEl.style.display = 'none';
        errorEl.style.display = 'block';
        errorEl.textContent = `Failed to load games: ${error.message}`;
    }
}

function sortGames(criteria) {
    currentSort = criteria;

    allGames.sort((a, b) => {
        switch (criteria) {
            case 'name':
                return a.name.localeCompare(b.name);
            case 'rating-desc':
                return b.rating - a.rating;
            case 'rating-asc':
                return a.rating - b.rating;
            case 'year-desc':
                return (parseInt(b.yearPublished) || 0) - (parseInt(a.yearPublished) || 0);
            case 'year-asc':
                return (parseInt(a.yearPublished) || 0) - (parseInt(b.yearPublished) || 0);
            default:
                return 0;
        }
    });

    applyFilters();
}

function applyFilters() {
    const searchInput = document.getElementById('search-input');
    const listFilter = document.getElementById('list-filter');
    const storeFilter = document.getElementById('store-filter');
    const sellerFilter = document.getElementById('seller-filter');
    const playerCountFilter = document.getElementById('player-count');
    const ratingFilter = document.getElementById('rating-filter');
    const designerFilter = document.getElementById('designer-filter');
    const majorDealsCheckbox = document.getElementById('major-deals-only');

    const searchTerm = (searchInput?.value || '').toLowerCase();
    const selectedList = listFilter ? listFilter.value : 'all';
    const selectedStore = storeFilter ? storeFilter.value : 'all';
    const selectedSeller = sellerFilter ? sellerFilter.value : 'all';
    const playerCount = playerCountFilter ? playerCountFilter.value : 'all';
    const rating = ratingFilter ? ratingFilter.value : 'all';
    const designer = designerFilter ? designerFilter.value : 'all';
    const majorDealsOnly = majorDealsCheckbox ? majorDealsCheckbox.checked : false;

    filteredGames = allGames.filter(game => {
        // Search filter
        if (searchTerm && !game.name.toLowerCase().includes(searchTerm)) {
            return false;
        }

        // List filter
        if (selectedList === 'wanttobuy' && !game.isWantToBuy) return false;
        if (selectedList === 'wantintrade' && !game.isWantInTrade) return false;
        if (selectedList === 'liketohave' && !game.isLikeToHave) return false;

        // Major deals filter
        if (majorDealsOnly && !hasGameMajorDeal(game)) return false;

        // Store filter
        if (selectedStore !== 'all') {
            if (!isGameInStockAtStore(game, selectedStore)) return false;
        }

        // Seller filter
        if (selectedSeller !== 'all') {
            if (!isGameSoldBySeller(game, selectedSeller)) return false;
        }

        // Player count filter
        if (playerCount !== 'all') {
            if (playerCount === '1-only') {
                if (game.minPlayers !== 1 || game.maxPlayers !== 1) return false;
            } else if (playerCount === '2-only') {
                if (game.minPlayers !== 2 || game.maxPlayers !== 2) return false;
            } else if (playerCount === '5') {
                if (game.maxPlayers < 5) return false;
            } else {
                const count = parseInt(playerCount);
                if (count < game.minPlayers || count > game.maxPlayers) return false;
            }
        }

        // Rating filter
        if (rating === '8+' && game.rating < 8) return false;
        if (rating === '7+' && game.rating < 7) return false;
        if (rating === '6+' && game.rating < 6) return false;

        // Designer filter
        if (designer !== 'all') {
            const hasDesigner = (game.designers || []).some(d => d.toLowerCase() === designer.toLowerCase());
            if (!hasDesigner) return false;
        }

        return true;
    });

    renderGames();
}

function renderGames() {
    const gamesGridEl = document.getElementById('games-grid');
    if (!gamesGridEl) return;

    if (filteredGames.length === 0) {
        gamesGridEl.innerHTML = '<div class="no-results" style="grid-column: 1/-1; text-align: center; padding: 40px; color: #666;">No games match your filters</div>';
        return;
    }

    gamesGridEl.innerHTML = '';
    filteredGames.forEach(game => {
        gamesGridEl.appendChild(createGameCard(game));
    });
}

function createGameCard(game) {
    const card = document.createElement('div');
    card.className = 'game-card';
    card.onclick = (e) => {
        if (e.target.closest('a') || e.target.closest('button') || e.target.closest('.store-chip')) return;
        window.open(`https://boardgamegeek.com/boardgame/${game.objectId}`, '_blank');
    };

    let badgesHtml = '';
    if (game.isWantToBuy) badgesHtml += '<span class="badge badge-favorite">Want to Buy</span> ';
    if (game.isWantInTrade) badgesHtml += '<span class="badge badge-favorite">Want in Trade</span> ';
    if (game.isLikeToHave) badgesHtml += '<span class="badge badge-favorite">Like to Have</span> ';
    badgesHtml = badgesHtml.trim();

    const dealInfo = getGameDealInfo(game);
    if (dealInfo) {
        const prevPriceFormatted = formatPrice(dealInfo.previousPrice, dealInfo.storeKey);
        const currPriceFormatted = formatPrice(dealInfo.currentPrice, dealInfo.storeKey);
        badgesHtml += `<span class="badge badge-deal" title="Was ${prevPriceFormatted}, now ${currPriceFormatted}">🔥 -${dealInfo.discountPercent}% Deal</span>`;
    }

    if (game.minPlayers <= 1) badgesHtml += '<span class="badge badge-solo">Solo</span>';
    if (game.rating >= 8) badgesHtml += '<span class="badge badge-highly-rated">Highly Rated</span>';

    // Store availability chips
    let storeButtonsHtml = '';
    const activeBggListings = getActiveBggListings(game);

    const renderStoreChip = (store, name, storeKey = null, isBggMarket = false) => {
        if (!store || !store.url || !store.available) return '';
        const priceText = formatPrice(store.price, storeKey);
        const hasDeal = store.deal && store.deal.discountPercent >= 20;
        const prevPriceText = hasDeal ? formatPrice(store.deal.previousPrice, storeKey) : '';
        const chipClass = isBggMarket ? 'store-chip bgg-market' : (hasDeal ? 'store-chip has-deal' : 'store-chip');
        const dealBadge = hasDeal ? `<span class="chip-deal-badge">-${store.deal.discountPercent}%</span>` : '';
        return `
            <a href="${store.url}" target="_blank" class="${chipClass}" title="View on ${name}${hasDeal ? ` (Was ${prevPriceText}, now ${priceText})` : ''}">
                <span class="store-chip-name">${name}</span>
                ${priceText ? `<span class="store-chip-price">${priceText} ${dealBadge}</span>` : ''}
            </a>
        `;
    };

    STORES.filter(s => s.key !== 'bggMarket').forEach(storeDef => {
        const storeData = game.availability?.[storeDef.key];
        storeButtonsHtml += renderStoreChip(storeData, storeDef.name, storeDef.key);
    });

    if (activeBggListings.length > 0) {
        activeBggListings.forEach(listing => {
            const label = listing.seller ? `🏷️ ${listing.seller}` : '🏷️ BGG Market';
            storeButtonsHtml += renderStoreChip({
                available: true,
                price: listing.price,
                url: listing.url
            }, label, 'bggMarket', true);
        });
    }

    let storeHtml = '';
    if (storeButtonsHtml.trim()) {
        storeHtml = `
            <div class="store-availability">
                <div class="store-chips">${storeButtonsHtml}</div>
            </div>
        `;
    }

    const designersText = (game.designers && game.designers.length > 0 && game.designers[0] !== '(Uncredited)')
        ? game.designers.join(', ')
        : '';

    card.innerHTML = `
        <div class="game-badges">
            ${badgesHtml}
        </div>
        <img src="${game.image || game.thumbnail || 'https://via.placeholder.com/300x300?text=No+Image'}" 
            alt="${escapeHtml(game.name)}" 
            class="game-thumbnail"
            loading="lazy">
        <div class="game-info">
            <div class="game-year">${game.yearPublished !== 'N/A' ? game.yearPublished : ''}</div>
            <div class="game-name">${escapeHtml(game.name)}</div>
            <div class="game-meta">
                <div class="meta-item"><span>👥</span> ${game.minPlayers}-${game.maxPlayers}</div>
                <div class="meta-item"><span>⏱️</span> ${game.playingTime} min</div>
                <div class="meta-item"><span>⭐</span> ${game.rating.toFixed(1)}</div>
                ${designersText ? `<div class="meta-item" title="Designer: ${escapeHtml(designersText)}"><span>✍️</span> ${escapeHtml(designersText)}</div>` : ''}
            </div>
            ${storeHtml}
        </div>
    `;
    return card;
}

function changeViewMode(mode) {
    currentViewMode = mode;
    const grid = document.getElementById('games-grid');
    if (grid) {
        grid.className = 'games-grid' + (mode === 'compact' ? ' view-compact' : mode === 'list' ? ' view-list' : '');
    }
}

function toggleDarkMode(checked) {
    if (checked) {
        document.body.classList.add('dark-mode');
    } else {
        document.body.classList.remove('dark-mode');
    }
    localStorage.setItem('darkMode', checked);
}

function loadDarkModePreference() {
    const isDark = localStorage.getItem('darkMode') === 'true';
    const checkbox = document.getElementById('dark-mode');
    if (checkbox) checkbox.checked = isDark;
    if (isDark) {
        document.body.classList.add('dark-mode');
    }
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    fetchAllStoreGames();
});
