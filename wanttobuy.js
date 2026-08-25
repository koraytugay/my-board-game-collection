let allGames = [];
let filteredGames = [];
let currentSort = 'name';
let currentViewMode = 'grid';

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
    { key: 'faceToFaceGames', name: '🇨🇦 Face to Face' },
    { key: 'obsidianGames', name: '🇨🇦 Obsidian Games' },
    { key: 'jjCards', name: '🇨🇦 J&J Cards' },
    { key: 'boardgamesCa', name: '🇨🇦 Boardgames.ca' },
    { key: 'screenFreeGames', name: '🇨🇦 Screen Free Games' },
    { key: 'allSystemsGo', name: '🇨🇦 All Systems Go' },
    { key: 'tabletopCafe', name: '🇨🇦 Tabletop Cafe' },
    { key: 'elevatedBoardGames', name: '🇨🇦 Elevated Board Games' },
    { key: 'diceHollow', name: '🇨🇦 Dice Hollow' },
    { key: 'laPioche', name: '🇨🇦 La Pioche' },
    { key: 'buttonShyEtsy', name: '🇺🇸 Button Shy' },
    { key: 'zatu', name: '🇬🇧 Zatu Games' },
    { key: 'chaosCards', name: '🇬🇧 Chaos Cards' },
    { key: 'philibert', name: '🇫🇷 Philibert' },
    { key: 'crowdfinder', name: '🇧🇪 Crowdfinder' },
    { key: 'spelspul', name: '🇳🇱 Spelspul' },
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
    if (str.includes('€') || /\bEUR\b/i.test(str) || storeKey === 'philibert' || storeKey === 'crowdfinder' || storeKey === 'spelspul') {
        cadPrice = num * 1.65;
    } else if (str.includes('£') || /\bGBP\b/i.test(str) || storeKey === 'zatu' || storeKey === 'chaosCards') {
        cadPrice = num * 1.90;
    } else if (/\bUSD\b/i.test(str) || /\$US\b/i.test(str) || /US\$/i.test(str) || storeKey === 'miniatureMarket' || storeKey === 'buttonShyEtsy') {
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
    if (Array.isArray(bggmkt.listings) && bggmkt.listings.length > 0) {
        return bggmkt.listings.filter(l => !l.ignored && (extractNumericPrice(l.price) === null || extractNumericPrice(l.price) > 5.0));
    }
    if (bggmkt.available && bggmkt.url && !bggmkt.ignored) {
        const num = extractNumericPrice(bggmkt.price);
        if (num !== null && num <= 5.0) return [];
        return [{
            price: bggmkt.price,
            seller: bggmkt.seller || 'BGG Market',
            condition: bggmkt.condition || '',
            url: bggmkt.url,
            ignored: false
        }];
    }
    return [];
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

function populateStoreFilter() {
    const storeSelect = document.getElementById('store-filter');
    if (!storeSelect) return;

    const currentValue = storeSelect.value;
    storeSelect.innerHTML = '<option value="all">All Stores</option>';

    const storesWithStock = [];
    STORES.forEach(store => {
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

function populateListTypeFilter() {
    const listTypeSelect = document.getElementById('list-type-filter');
    if (!listTypeSelect) return;

    const currentVal = listTypeSelect.value;
    const wtbCount = allGames.filter(g => g.isWantToBuy).length;
    const tradeCount = allGames.filter(g => g.isWantInTrade).length;
    const allCount = allGames.length;

    listTypeSelect.innerHTML = `
        <option value="all">All (${allCount})</option>
        <option value="wanttobuy">Want to Buy (${wtbCount})</option>
        <option value="wantintrade">Want in Trade (${tradeCount})</option>
    `;

    if (['all', 'wanttobuy', 'wantintrade'].includes(currentVal)) {
        listTypeSelect.value = currentVal;
    } else {
        listTypeSelect.value = 'all';
    }
}

async function fetchCollection() {
    const loadingEl = document.getElementById('loading');
    const errorEl = document.getElementById('error');
    const controlsEl = document.getElementById('controls');

    try {
        // Fetch BGG collection, availability, and designers in parallel
        const [collection, availabilityRes, designersRes] = await Promise.all([
            getCollection('wanttobuy'),
            fetch('availability.json').then(res => res.ok ? res.json() : {}).catch(() => ({})),
            fetch('designers.json').then(res => res.ok ? res.json() : {}).catch(() => ({}))
        ]);
        
        allGames = collection.map(game => ({
            ...game,
            lastPlayed: '',
            designers: designersRes[game.objectId]?.designers || [],
            availability: availabilityRes[game.objectId] || {
                boardGameBliss: { available: false, price: null, url: null },
                fourZeroOneGames: { available: false, price: null, url: null },
                lvlUpGames: { available: false, price: null, url: null },
                asDesJeux: { available: false, price: null, url: null },
                greatBoardgames: { available: false, price: null, url: null },
                meeplemart: { available: false, price: null, url: null },
                kbHobbies: { available: false, price: null, url: null },
                miniatureMarket: { available: false, price: null, url: null },
                amazonCa: { available: false, price: null, url: null },
                woodForSheep: { available: false, price: null, url: null },
                faceToFaceGames: { available: false, price: null, url: null },
                obsidianGames: { available: false, price: null, url: null },
                jjCards: { available: false, price: null, url: null },
                boardgamesCa: { available: false, price: null, url: null },
                screenFreeGames: { available: false, price: null, url: null },
                allSystemsGo: { available: false, price: null, url: null },
                tabletopCafe: { available: false, price: null, url: null },
                elevatedBoardGames: { available: false, price: null, url: null },
                diceHollow: { available: false, price: null, url: null },
                buttonShyEtsy: { available: false, price: null, url: null },
                zatu: { available: false, price: null, url: null },
                philibert: { available: false, price: null, url: null },
                bggMarket: { available: false, price: null, url: null }
            }
        }));

        populateListTypeFilter();
        populateStoreFilter();
        populateSellerFilter();
        populateDesignerFilter();

        filteredGames = [...allGames];
        sortGames(currentSort);
        
        loadingEl.style.display = 'none';
        controlsEl.style.display = 'block';
        
        loadDarkModePreference();

    } catch (error) {
        console.error('Error fetching collection:', error);
        loadingEl.style.display = 'none';
        errorEl.style.display = 'block';
        errorEl.textContent = `Failed to load wanted games: ${error.message}`;
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
                return parseInt(b.yearPublished) - parseInt(b.yearPublished);
            case 'year-asc':
                return parseInt(a.yearPublished) - parseInt(a.yearPublished);
            default:
                return a.name.localeCompare(b.name);
        }
    });
    
    applyFilters();
}

function applyFilters() {
    const searchInput = document.getElementById('search-input');
    const ratingFilter = document.getElementById('rating-filter');
    const playerCountFilter = document.getElementById('player-count');
    const inStockCheckbox = document.getElementById('in-stock-only');
    const majorDealsCheckbox = document.getElementById('major-deals-only');
    const storeFilter = document.getElementById('store-filter');
    const sellerFilter = document.getElementById('seller-filter');

    const searchTerm = searchInput ? searchInput.value.toLowerCase().trim() : '';
    const ratingVal = ratingFilter ? ratingFilter.value : 'all';
    const playerCountVal = playerCountFilter ? playerCountFilter.value : 'all';
    const inStockOnly = inStockCheckbox ? inStockCheckbox.checked : false;
    const majorDealsOnly = majorDealsCheckbox ? majorDealsCheckbox.checked : false;
    const storeVal = storeFilter ? storeFilter.value : 'all';
    const sellerVal = sellerFilter ? sellerFilter.value : 'all';
    const designerFilter = document.getElementById('designer-filter');
    const designerVal = designerFilter ? designerFilter.value : 'all';

    filteredGames = allGames.filter(game => {
        const matchesSearch = !searchTerm || game.name.toLowerCase().includes(searchTerm);

        let matchesRating = true;
        if (ratingVal !== 'all') {
            const minRating = parseFloat(ratingVal.replace('+', ''));
            matchesRating = game.rating >= minRating;
        }

        let matchesPlayers = true;
        if (playerCountVal !== 'all') {
            if (playerCountVal === '1-only') {
                matchesPlayers = game.minPlayers === 1 && game.maxPlayers === 1;
            } else if (playerCountVal === '2-only') {
                matchesPlayers = game.minPlayers === 2 && game.maxPlayers === 2;
            } else if (playerCountVal === '5') {
                matchesPlayers = game.maxPlayers >= 5;
            } else {
                const count = parseInt(playerCountVal);
                matchesPlayers = count >= game.minPlayers && count <= game.maxPlayers;
            }
        }

        let matchesStock = true;
        if (inStockOnly) {
            matchesStock = isGameInStockAtAnyStore(game);
        }

        let matchesDeal = true;
        if (majorDealsOnly) {
            matchesDeal = hasGameMajorDeal(game);
        }

        let matchesStore = true;
        if (storeVal !== 'all') {
            matchesStore = isGameInStockAtStore(game, storeVal);
        }

        let matchesSeller = true;
        if (sellerVal !== 'all') {
            const activeListings = getActiveBggListings(game);
            matchesSeller = activeListings.some(l => l.seller && l.seller.toLowerCase() === sellerVal.toLowerCase());
        }

        let matchesDesigner = true;
        if (designerVal !== 'all') {
            const designers = game.designers || [];
            matchesDesigner = designers.some(d => d.toLowerCase() === designerVal.toLowerCase());
        }

        return matchesSearch && matchesRating && matchesPlayers && matchesStock && matchesDeal && matchesStore && matchesSeller && matchesDesigner;
    });

    renderGames();
}

function renderGames() {
    const gamesGridEl = document.getElementById('games-grid');
    
    if (currentViewMode === 'grid') {
        gamesGridEl.className = 'games-grid';
    } else if (currentViewMode === 'compact') {
        gamesGridEl.className = 'games-grid view-compact';
    } else if (currentViewMode === 'list') {
        gamesGridEl.className = 'games-grid view-list';
    }
    
    if (filteredGames.length === 0) {
        gamesGridEl.innerHTML = '<div class="no-results">No games match your filters</div>';
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
        // Prevent opening BGG page if user is clicking a store link, button, or any interactive element
        if (e.target.closest('a') || e.target.closest('button') || e.target.closest('.store-chip')) return;
        window.open(`https://boardgamegeek.com/boardgame/${game.objectId}`, '_blank');
    };

    let badgesHtml = '';
    
    // Check if in stock at any store to add a special badge
    const isInStock = isGameInStockAtAnyStore(game);
    
    if (isInStock) {
        badgesHtml += '<span class="badge badge-favorite">In Stock</span>';
    }

    const dealInfo = getGameDealInfo(game);
    if (dealInfo) {
        const prevPriceFormatted = formatPrice(dealInfo.previousPrice, dealInfo.storeKey);
        const currPriceFormatted = formatPrice(dealInfo.currentPrice, dealInfo.storeKey);
        badgesHtml += `<span class="badge badge-deal" title="Was ${prevPriceFormatted}, now ${currPriceFormatted}">🔥 -${dealInfo.discountPercent}% Deal</span>`;
    }

    if (game.isWantInTrade && !game.isWantToBuy) {
        badgesHtml += '<span class="badge badge-want-trade">Want in Trade</span>';
    } else if (game.isWantInTrade && game.isWantToBuy) {
        badgesHtml += '<span class="badge badge-want-trade">Want in Trade</span>';
    }
    
    if (game.minPlayers <= 1) badgesHtml += '<span class="badge badge-solo">Solo</span>';
    if (game.rating >= 8) badgesHtml += '<span class="badge badge-highly-rated">Highly Rated</span>';

    // Build store availability HTML (only for stores / sellers that are in stock)
    let storeButtonsHtml = '';
    const bgb = game.availability?.boardGameBliss;
    const fof = game.availability?.fourZeroOneGames;
    const lvl = game.availability?.lvlUpGames;
    const adj = game.availability?.asDesJeux;
    const gbg = game.availability?.greatBoardgames;
    const meeple = game.availability?.meeplemart;
    const kbh = game.availability?.kbHobbies;
    const mm = game.availability?.miniatureMarket;
    const amzn = game.availability?.amazonCa;
    const wfs = game.availability?.woodForSheep;
    const f2f = game.availability?.faceToFaceGames;
    const obsidian = game.availability?.obsidianGames;
    const jj = game.availability?.jjCards;
    const bgca = game.availability?.boardgamesCa;
    const sfg = game.availability?.screenFreeGames;
    const asg = game.availability?.allSystemsGo;
    const ttc = game.availability?.tabletopCafe;
    const ebg = game.availability?.elevatedBoardGames;
    const dh = game.availability?.diceHollow;
    const bse = game.availability?.buttonShyEtsy;
    const zatu = game.availability?.zatu;
    const philibert = game.availability?.philibert;
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

    storeButtonsHtml += renderStoreChip(bgb, '🇨🇦 BoardGameBliss', 'boardGameBliss');
    storeButtonsHtml += renderStoreChip(fof, '🇨🇦 401 Games', 'fourZeroOneGames');
    storeButtonsHtml += renderStoreChip(lvl, '🇨🇦 LVLUP', 'lvlUpGames');
    storeButtonsHtml += renderStoreChip(adj, '🇨🇦 As des Jeux', 'asDesJeux');
    storeButtonsHtml += renderStoreChip(gbg, '🇨🇦 Great BG', 'greatBoardgames');
    storeButtonsHtml += renderStoreChip(meeple, '🇨🇦 Meeplemart', 'meeplemart');
    storeButtonsHtml += renderStoreChip(kbh, '🇨🇦 KB Hobbies', 'kbHobbies');
    storeButtonsHtml += renderStoreChip(mm, '🇺🇸 Miniature Market', 'miniatureMarket');
    storeButtonsHtml += renderStoreChip(amzn, '🇨🇦 Amazon.ca', 'amazonCa');
    storeButtonsHtml += renderStoreChip(wfs, '🇨🇦 Wood for Sheep', 'woodForSheep');
    storeButtonsHtml += renderStoreChip(f2f, '🇨🇦 Face to Face', 'faceToFaceGames');
    storeButtonsHtml += renderStoreChip(obsidian, '🇨🇦 Obsidian', 'obsidianGames');
    storeButtonsHtml += renderStoreChip(jj, '🇨🇦 J&J Cards', 'jjCards');
    storeButtonsHtml += renderStoreChip(bgca, '🇨🇦 Boardgames.ca', 'boardgamesCa');
    storeButtonsHtml += renderStoreChip(sfg, '🇨🇦 Screen Free', 'screenFreeGames');
    storeButtonsHtml += renderStoreChip(asg, '🇨🇦 All Systems Go', 'allSystemsGo');
    storeButtonsHtml += renderStoreChip(ttc, '🇨🇦 Tabletop Cafe', 'tabletopCafe');
    storeButtonsHtml += renderStoreChip(ebg, '🇨🇦 Elevated BG', 'elevatedBoardGames');
    storeButtonsHtml += renderStoreChip(dh, '🇨🇦 Dice Hollow', 'diceHollow');
    storeButtonsHtml += renderStoreChip(bse, '🇺🇸 Button Shy', 'buttonShyEtsy');
    storeButtonsHtml += renderStoreChip(zatu, '🇬🇧 Zatu Games', 'zatu');
    storeButtonsHtml += renderStoreChip(philibert, '🇫🇷 Philibert', 'philibert');

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
            alt="${game.name}" 
            class="game-thumbnail"
            loading="lazy">
        <div class="game-info">
            <div class="game-year">${game.yearPublished !== 'N/A' ? game.yearPublished : ''}</div>
            <div class="game-name">${game.name}</div>
            <div class="game-meta">
                <div class="meta-item"><span>👥</span> ${game.minPlayers}-${game.maxPlayers}</div>
                <div class="meta-item"><span>⏱️</span> ${game.playingTime} min</div>
                <div class="meta-item"><span>⭐</span> ${game.rating.toFixed(1)}</div>
                ${designersText ? `<div class="meta-item" title="Designer: ${designersText}"><span>✍️</span> ${designersText}</div>` : ''}
            </div>
            ${storeHtml}
        </div>
    `;
    return card;
}

function changeViewMode(mode) {
    currentViewMode = mode;
    renderGames();
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
    fetchCollection();
});
