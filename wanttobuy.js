let allGames = [];
let filteredGames = [];
let currentSort = 'name';
let currentViewMode = 'grid';

const STORES = [
    { key: 'boardGameBliss', name: 'BoardGameBliss' },
    { key: 'fourZeroOneGames', name: '401 Games' },
    { key: 'lvlUpGames', name: 'LVLUP Games' },
    { key: 'asDesJeux', name: 'As des Jeux' },
    { key: 'greatBoardgames', name: 'Great Boardgames' },
    { key: 'meeplemart', name: 'Meeplemart' },
    { key: 'kbHobbies', name: 'KB Hobbies' },
    { key: 'miniatureMarket', name: 'Miniature Market' },
    { key: 'amazonCa', name: 'Amazon.ca' },
    { key: 'woodForSheep', name: 'Wood for Sheep' },
    { key: 'faceToFaceGames', name: 'Face to Face' },
    { key: 'obsidianGames', name: 'Obsidian Games' },
    { key: 'jjCards', name: 'J&J Cards' },
    { key: 'boardgamesCa', name: 'Boardgames.ca' },
    { key: 'screenFreeGames', name: 'Screen Free Games' },
    { key: 'allSystemsGo', name: 'All Systems Go' },
    { key: 'tabletopCafe', name: 'Tabletop Cafe' },
    { key: 'elevatedBoardGames', name: 'Elevated Board Games' },
    { key: 'buttonShyEtsy', name: 'Button Shy (Etsy)' },
    { key: 'zatu', name: 'Zatu Games' },
    { key: 'bggMarket', name: 'BGG Market' }
];

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
                buttonShyEtsy: { available: false, price: null, url: null },
                zatu: { available: false, price: null, url: null },
                bggMarket: { available: false, price: null, url: null }
            }
        }));

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
    
    if (game.isLiveCheck) {
        badgesHtml += '<span class="badge badge-live">⚡ Live Search</span>';
    }

    // Check if in stock at any store to add a special badge
    const isInStock = isGameInStockAtAnyStore(game);
    
    if (isInStock) {
        badgesHtml += '<span class="badge badge-favorite">In Stock</span>';
    }

    const dealInfo = getGameDealInfo(game);
    if (dealInfo) {
        badgesHtml += `<span class="badge badge-deal" title="Was ${dealInfo.previousPrice}, now ${dealInfo.currentPrice}">🔥 -${dealInfo.discountPercent}% Deal</span>`;
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
    const bse = game.availability?.buttonShyEtsy;
    const zatu = game.availability?.zatu;
    const activeBggListings = getActiveBggListings(game);

    const renderStoreChip = (store, name, isBggMarket = false) => {
        if (!store || !store.url || !store.available) return '';
        const priceText = formatPrice(store.price);
        const hasDeal = store.deal && store.deal.discountPercent >= 20;
        const chipClass = isBggMarket ? 'store-chip bgg-market' : (hasDeal ? 'store-chip has-deal' : 'store-chip');
        const dealBadge = hasDeal ? `<span class="chip-deal-badge">-${store.deal.discountPercent}%</span>` : '';
        return `
            <a href="${store.url}" target="_blank" class="${chipClass}" title="View on ${name}${hasDeal ? ` (Was ${store.deal.previousPrice}, now ${store.price})` : ''}">
                <span class="store-chip-name">${name}</span>
                ${priceText ? `<span class="store-chip-price">${priceText} ${dealBadge}</span>` : ''}
            </a>
        `;
    };

    storeButtonsHtml += renderStoreChip(bgb, '🍁 BoardGameBliss');
    storeButtonsHtml += renderStoreChip(fof, '🎲 401 Games');
    storeButtonsHtml += renderStoreChip(lvl, '⚔️ LVLUP');
    storeButtonsHtml += renderStoreChip(adj, '🃏 As des Jeux');
    storeButtonsHtml += renderStoreChip(gbg, '🏰 Great BG');
    storeButtonsHtml += renderStoreChip(meeple, '👾 Meeplemart');
    storeButtonsHtml += renderStoreChip(kbh, '🧸 KB Hobbies');
    storeButtonsHtml += renderStoreChip(mm, '♟️ Miniature Market');
    storeButtonsHtml += renderStoreChip(amzn, '🛒 Amazon');
    storeButtonsHtml += renderStoreChip(wfs, '🐑 Wood for Sheep');
    storeButtonsHtml += renderStoreChip(f2f, '🤝 Face to Face');
    storeButtonsHtml += renderStoreChip(obsidian, '🔮 Obsidian');
    storeButtonsHtml += renderStoreChip(jj, '🎴 J&J Cards');
    storeButtonsHtml += renderStoreChip(bgca, '🎯 Boardgames.ca');
    storeButtonsHtml += renderStoreChip(sfg, '🧩 Screen Free');
    storeButtonsHtml += renderStoreChip(asg, '🚀 All Systems Go');
    storeButtonsHtml += renderStoreChip(ttc, '☕ Tabletop Cafe');
    storeButtonsHtml += renderStoreChip(ebg, '🏔️ Elevated BG');
    storeButtonsHtml += renderStoreChip(bse, '👛 Button Shy');
    storeButtonsHtml += renderStoreChip(zatu, '🛡️ Zatu Games');

    if (activeBggListings.length > 0) {
        activeBggListings.forEach(listing => {
            const label = listing.seller ? `🏷️ ${listing.seller}` : '🏷️ BGG Market';
            storeButtonsHtml += renderStoreChip({
                available: true,
                price: listing.price,
                url: listing.url
            }, label, true);
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

// --- Live BGG Stock Checker (Session Only) ---

let liveCheckedGame = null;

const LIVE_CHECKER_STORES = [
    { key: 'boardGameBliss', name: 'BoardGameBliss', baseUrl: 'https://www.boardgamebliss.com', symbol: '$' },
    { key: 'fourZeroOneGames', name: '401 Games', baseUrl: 'https://store.401games.ca', symbol: '$' },
    { key: 'lvlUpGames', name: 'LVLUP Games', baseUrl: 'https://www.lvlupgames.ca', symbol: '$' },
    { key: 'asDesJeux', name: 'As des Jeux', baseUrl: 'https://www.asdesjeux.com', symbol: '$' },
    { key: 'meeplemart', name: 'Meeplemart', baseUrl: 'https://www.meeplemart.com', symbol: '$' },
    { key: 'kbHobbies', name: 'KB Hobbies', baseUrl: 'https://kbhobbies.com', symbol: '$' },
    { key: 'woodForSheep', name: 'Wood for Sheep', baseUrl: 'https://www.woodforsheep.ca', symbol: '$' },
    { key: 'faceToFaceGames', name: 'Face to Face', baseUrl: 'https://www.facetofacegames.com', symbol: '$' },
    { key: 'obsidianGames', name: 'Obsidian Games', baseUrl: 'https://obsidiangames.ca', symbol: '$' },
    { key: 'jjCards', name: 'J&J Cards', baseUrl: 'https://jjcards.com', symbol: '$' },
    { key: 'boardgamesCa', name: 'Boardgames.ca', baseUrl: 'https://boardgames.ca', symbol: '$' },
    { key: 'screenFreeGames', name: 'Screen Free Games', baseUrl: 'https://screenfreegames.ca', symbol: '$' },
    { key: 'allSystemsGo', name: 'All Systems Go', baseUrl: 'https://allsystemsgogames.com', symbol: '$' },
    { key: 'tabletopCafe', name: 'Tabletop Cafe', baseUrl: 'https://www.tabletopcafe.ca', symbol: '$' },
    { key: 'elevatedBoardGames', name: 'Elevated Board Games', baseUrl: 'https://elevatedboardgames.com', symbol: '$' },
    { key: 'zatu', name: 'Zatu Games', baseUrl: 'https://zatu.com', symbol: '£' }
];

async function fetchViaCorsProxy(url, isJson = true) {
    const proxies = [
        u => u, // Direct fetch first
        u => `https://corsproxy.io/?url=${encodeURIComponent(u)}`,
        u => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
        u => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(u)}`
    ];

    for (const makeUrl of proxies) {
        try {
            const fetchUrl = makeUrl(url);
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 8000);
            const res = await fetch(fetchUrl, {
                signal: controller.signal,
                headers: { 'Accept': 'application/json, text/html, */*' }
            });
            clearTimeout(timeoutId);
            if (!res.ok) continue;
            if (isJson) {
                const text = await res.text();
                try {
                    return JSON.parse(text);
                } catch {
                    continue;
                }
            } else {
                return await res.text();
            }
        } catch {
            // continue to next proxy
        }
    }
    return null;
}

function liveCleanName(name) {
    return (name || '').replace(/\s*\([^)]*\)/g, '').replace(/:\s*.*$/, '').trim();
}

function isLiveMatch(gameName, product) {
    if (!product || !product.title) return false;
    const title = product.title.toLowerCase();
    const cleanBgg = liveCleanName(gameName).toLowerCase();
    const normalize = str => str.replace(/[^a-z0-9]/g, '');

    const disallowedKeywords = ['insert', 'organizer', 'organiser', 'playmat', 'promo', 'paint', 'sleeves', 'token', 'coins', 'upgrade', 'expansion', 'booster', 'tcg', 'puzzle'];
    for (const kw of disallowedKeywords) {
        if (title.includes(kw) && !cleanBgg.includes(kw)) return false;
    }

    const nBgg = normalize(cleanBgg);
    const nShopify = normalize(product.title);
    if (nBgg === nShopify) return true;

    const wordsBgg = cleanBgg.split(/\s+/).filter(Boolean);
    const wordsShopify = title.split(/\s+/).filter(Boolean);
    if (wordsBgg.length === 1) {
        if (wordsShopify.length > 2) return false;
        return normalize(wordsBgg[0]) === normalize(wordsShopify[0]);
    }

    return nBgg === nShopify || nShopify.startsWith(nBgg) || nBgg.startsWith(nShopify);
}

async function checkLiveGameStock() {
    const inputEl = document.getElementById('quick-bgg-id');
    const btnEl = document.getElementById('quick-check-btn');
    const clearBtnEl = document.getElementById('quick-clear-btn');
    const statusEl = document.getElementById('quick-check-status');

    if (!inputEl) return;
    const rawVal = inputEl.value.trim();
    const match = rawVal.match(/\d+/);
    if (!match) {
        statusEl.style.display = 'block';
        statusEl.className = 'quick-checker-status error';
        statusEl.textContent = '⚠️ Please enter a valid numeric BoardGameGeek ID or BGG URL (e.g. 244521).';
        return;
    }

    const objectId = match[0];
    btnEl.disabled = true;
    statusEl.style.display = 'block';
    statusEl.className = 'quick-checker-status';
    statusEl.textContent = `⏳ Step 1/2: Fetching game info for BGG ID #${objectId}...`;

    try {
        // 1. Fetch game details from BGG Geekdo API
        const geekdoUrl = `https://api.geekdo.com/api/geekitems?objectid=${objectId}&objecttype=thing`;
        const geekdoRes = await fetchViaCorsProxy(geekdoUrl, true);

        let gameName = `Game #${objectId}`;
        let yearPublished = '';
        let bggRating = 0;
        let image = '';
        let thumbnail = '';
        let minPlayers = 1;
        let maxPlayers = 4;
        let playingTime = 30;
        let designers = [];

        if (geekdoRes && geekdoRes.item) {
            const item = geekdoRes.item;
            gameName = item.name || gameName;
            yearPublished = String(item.yearpublished || '');
            bggRating = parseFloat(item.stats?.average || '0') || 0;
            image = item.imageurl || item.images?.preview || item.images?.thumb || '';
            thumbnail = item.images?.thumb || item.imageurl || '';
            minPlayers = parseInt(item.minplayers, 10) || 1;
            maxPlayers = parseInt(item.maxplayers, 10) || 4;
            playingTime = parseInt(item.maxplaytime || item.minplaytime || item.playtime, 10) || 30;
            if (item.links?.boardgamedesigner) {
                designers = item.links.boardgamedesigner.map(d => d.name?.trim()).filter(Boolean);
            }
        }

        statusEl.textContent = `⏳ Step 2/2: Checking 18+ stores in parallel for "${gameName}"...`;

        // 2. Query stores in parallel
        const availability = {};
        const query = encodeURIComponent(liveCleanName(gameName));

        const storePromises = LIVE_CHECKER_STORES.map(async (store) => {
            try {
                const searchUrl = `${store.baseUrl}/search/suggest.json?q=${query}&resources[type]=product`;
                const res = await fetchViaCorsProxy(searchUrl, true);
                const products = res?.resources?.results?.products || [];
                const matchedProd = products.find(p => isLiveMatch(gameName, p));

                if (matchedProd) {
                    const priceNum = parseFloat(matchedProd.price);
                    const available = matchedProd.available !== false && priceNum > 5.0;
                    const priceFormatted = `${store.symbol}${priceNum.toFixed(2)}`;
                    let productUrl = matchedProd.url || '';
                    if (productUrl && !productUrl.startsWith('http')) {
                        productUrl = `${store.baseUrl}${productUrl.startsWith('/') ? '' : '/'}${productUrl}`;
                    }

                    availability[store.key] = {
                        available,
                        price: priceFormatted,
                        url: productUrl,
                        lastChecked: new Date().toISOString()
                    };
                } else {
                    availability[store.key] = {
                        available: false,
                        price: null,
                        url: null,
                        lastChecked: new Date().toISOString()
                    };
                }
            } catch {
                availability[store.key] = {
                    available: false,
                    price: null,
                    url: null,
                    lastChecked: new Date().toISOString()
                };
            }
        });

        // Also query BGG Market
        const bggMarketPromise = (async () => {
            try {
                const mktUrl = `https://api.geekdo.com/api/market/products?objectid=${objectId}&objecttype=thing`;
                const mktRes = await fetchViaCorsProxy(mktUrl, true);
                if (mktRes && Array.isArray(mktRes.products) && mktRes.products.length > 0) {
                    const listings = mktRes.products.map(p => ({
                        price: p.price,
                        seller: p.username || 'BGG Seller',
                        condition: p.condition || '',
                        url: `https://boardgamegeek.com/market/product/${p.productid || ''}`,
                        ignored: false
                    })).filter(l => {
                        const num = extractNumericPrice(l.price);
                        return num === null || num > 5.0;
                    });

                    availability.bggMarket = {
                        available: listings.length > 0,
                        price: listings[0]?.price || null,
                        url: `https://boardgamegeek.com/market/product/${mktRes.products[0]?.productid || ''}`,
                        listings
                    };
                } else {
                    availability.bggMarket = { available: false, price: null, url: null, listings: [] };
                }
            } catch {
                availability.bggMarket = { available: false, price: null, url: null, listings: [] };
            }
        })();

        await Promise.all([...storePromises, bggMarketPromise]);

        // 3. Construct live game object
        liveCheckedGame = {
            objectId: String(objectId),
            name: gameName,
            yearPublished,
            rating: bggRating,
            myRating: 0,
            numPlays: 0,
            minPlayers,
            maxPlayers,
            playingTime,
            image,
            thumbnail,
            designers,
            isLiveCheck: true,
            availability
        };

        // Remove any previous live game from allGames and prepend the new one
        allGames = allGames.filter(g => !g.isLiveCheck);
        allGames.unshift(liveCheckedGame);

        // Count stores in stock
        const inStockStores = STORES.filter(s => isGameInStockAtStore(liveCheckedGame, s.key));
        const storeCountText = inStockStores.length > 0 
            ? `🟢 In stock at ${inStockStores.length} store(s): ${inStockStores.map(s => s.name).join(', ')}`
            : `🔴 Currently out of stock across all 18+ checked stores.`;

        statusEl.className = 'quick-checker-status success';
        statusEl.innerHTML = `<strong>${gameName} (${yearPublished})</strong>: ${storeCountText}. Added as a temporary card at the top of your list!`;

        clearBtnEl.style.display = 'inline-block';
        populateDesignerFilter();
        applyFilters();

    } catch (err) {
        statusEl.className = 'quick-checker-status error';
        statusEl.textContent = `❌ Failed to check live stock: ${err.message || err}`;
    } finally {
        btnEl.disabled = false;
    }
}

function clearLiveCheckedGame() {
    allGames = allGames.filter(g => !g.isLiveCheck);
    liveCheckedGame = null;
    const inputEl = document.getElementById('quick-bgg-id');
    const clearBtnEl = document.getElementById('quick-clear-btn');
    const statusEl = document.getElementById('quick-check-status');

    if (inputEl) inputEl.value = '';
    if (clearBtnEl) clearBtnEl.style.display = 'none';
    if (statusEl) statusEl.style.display = 'none';

    populateDesignerFilter();
    applyFilters();
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    fetchCollection();
});
