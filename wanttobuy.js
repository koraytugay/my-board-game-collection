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

function getActiveBggListings(game) {
    const bggmkt = game.availability?.bggMarket;
    if (!bggmkt) return [];
    if (Array.isArray(bggmkt.listings) && bggmkt.listings.length > 0) {
        return bggmkt.listings.filter(l => !l.ignored);
    }
    if (bggmkt.available && bggmkt.url && !bggmkt.ignored) {
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
    return !!storeData.available;
}

function isGameInStockAtAnyStore(game) {
    return STORES.some(store => isGameInStockAtStore(game, store.key));
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
    const statsEl = document.getElementById('stats');
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
        
        updateStats();
        sortGames(currentSort);
        
        loadingEl.style.display = 'none';
        statsEl.style.display = 'flex';
        controlsEl.style.display = 'block';
        
        loadDarkModePreference();

    } catch (error) {
        console.error('Error fetching collection:', error);
        loadingEl.style.display = 'none';
        errorEl.style.display = 'block';
        errorEl.textContent = `Failed to load wanted games: ${error.message}`;
    }
}

function updateStats() {
    const totalGames = allGames.length;
    
    const ratedGames = allGames.filter(game => game.rating > 0);
    const avgRating = ratedGames.length > 0 
        ? ratedGames.reduce((sum, game) => sum + game.rating, 0) / ratedGames.length 
        : 0;
        
    const soloGames = allGames.filter(game => game.minPlayers <= 1).length;
    
    // Count how many wanted games are in stock at any store
    const inStockGames = allGames.filter(game => isGameInStockAtAnyStore(game)).length;

    document.getElementById('total-games').textContent = totalGames;
    document.getElementById('avg-rating').textContent = avgRating.toFixed(1);
    document.getElementById('solo-games').textContent = soloGames;
    document.getElementById('in-stock-games').textContent = inStockGames;
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
    const storeFilter = document.getElementById('store-filter');
    const sellerFilter = document.getElementById('seller-filter');

    const searchTerm = searchInput ? searchInput.value.toLowerCase().trim() : '';
    const ratingVal = ratingFilter ? ratingFilter.value : 'all';
    const playerCountVal = playerCountFilter ? playerCountFilter.value : 'all';
    const inStockOnly = inStockCheckbox ? inStockCheckbox.checked : false;
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
            if (playerCountVal === '2-only') {
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

        return matchesSearch && matchesRating && matchesPlayers && matchesStock && matchesStore && matchesSeller && matchesDesigner;
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
        // Prevent opening BGG page if user is clicking a store link
        if (e.target.closest('.store-btn')) return;
        window.open(`https://boardgamegeek.com/boardgame/${game.objectId}`, '_blank');
    };

    let badgesHtml = '';
    
    // Check if in stock at any store to add a special badge
    const isInStock = isGameInStockAtAnyStore(game);
    
    if (isInStock) {
        badgesHtml += '<span class="badge badge-favorite">In Stock</span>';
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

    const renderStoreBtn = (store, name, btnClass) => {
        if (!store || !store.url || !store.available) return '';
        const statusClass = 'store-status-instock';
        const statusText = 'In Stock';
        const priceText = store.price ? (String(store.price).match(/^[$C$€£]/) ? store.price : `$${store.price}`) : '';
        return `
            <a href="${store.url}" target="_blank" class="store-btn ${btnClass}">
                <span class="store-name">${name}</span>
                <span>${priceText} <span class="store-status ${statusClass}">${statusText}</span></span>
            </a>
        `;
    };

    storeButtonsHtml += renderStoreBtn(bgb, '🍁 BoardGameBliss', 'store-btn-bgb');
    storeButtonsHtml += renderStoreBtn(fof, '🎲 401 Games', 'store-btn-401');
    storeButtonsHtml += renderStoreBtn(lvl, '⚔️ LVLUP Games', 'store-btn-lvlup');
    storeButtonsHtml += renderStoreBtn(adj, '🃏 As des Jeux', 'store-btn-adj');
    storeButtonsHtml += renderStoreBtn(gbg, '🏰 Great Boardgames', 'store-btn-greatbg');
    storeButtonsHtml += renderStoreBtn(meeple, '👾 Meeplemart', 'store-btn-meeplemart');
    storeButtonsHtml += renderStoreBtn(amzn, '🛒 Amazon.ca', 'store-btn-amazon');
    storeButtonsHtml += renderStoreBtn(wfs, '🐑 Wood for Sheep', 'store-btn-wfs');
    storeButtonsHtml += renderStoreBtn(f2f, '🤝 Face to Face', 'store-btn-f2f');
    storeButtonsHtml += renderStoreBtn(obsidian, '🔮 Obsidian Games', 'store-btn-obsidian');
    storeButtonsHtml += renderStoreBtn(jj, '🎴 J&J Cards', 'store-btn-jj');
    storeButtonsHtml += renderStoreBtn(bgca, '🎯 Boardgames.ca', 'store-btn-boardgamesca');
    storeButtonsHtml += renderStoreBtn(sfg, '🧩 Screen Free Games', 'store-btn-sfg');
    storeButtonsHtml += renderStoreBtn(asg, '🚀 All Systems Go', 'store-btn-asg');
    storeButtonsHtml += renderStoreBtn(ttc, '☕ Tabletop Cafe', 'store-btn-ttc');
    storeButtonsHtml += renderStoreBtn(ebg, '🏔️ Elevated Board Games', 'store-btn-ebg');
    storeButtonsHtml += renderStoreBtn(bse, '👛 Button Shy (Etsy)', 'store-btn-buttonshy');
    storeButtonsHtml += renderStoreBtn(zatu, '🛡️ Zatu Games', 'store-btn-zatu');

    if (activeBggListings.length > 0) {
        activeBggListings.forEach(listing => {
            const label = listing.seller ? `🏷️ ${listing.seller}` : '🏷️ BGG Market';
            storeButtonsHtml += renderStoreBtn({
                available: true,
                price: listing.price,
                url: listing.url
            }, label, 'store-btn-bggmkt');
        });
    }

    let storeHtml = '';
    if (storeButtonsHtml.trim()) {
        storeHtml = `<div class="store-availability">${storeButtonsHtml}</div>`;
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

// Random Game Functionality
let currentRandomGame = null;

function pickRandomGame() {
    if (filteredGames.length === 0) return;

    const randomIndex = Math.floor(Math.random() * filteredGames.length);
    currentRandomGame = filteredGames[randomIndex];

    document.getElementById('random-game-img').src = currentRandomGame.image || currentRandomGame.thumbnail || 'https://via.placeholder.com/300x300?text=No+Image';
    document.getElementById('random-game-name').textContent = currentRandomGame.name;
    document.getElementById('random-game-year').textContent = currentRandomGame.yearPublished !== 'N/A' ? `(${currentRandomGame.yearPublished})` : '';

    const metaEl = document.getElementById('random-game-meta');
    metaEl.innerHTML = `
        <div class="meta-item"><span>👥</span> ${currentRandomGame.minPlayers}-${currentRandomGame.maxPlayers} players</div>
        <div class="meta-item"><span>⏱️</span> ${currentRandomGame.playingTime} min</div>
        <div class="meta-item"><span>⭐</span> ${currentRandomGame.rating.toFixed(2)}</div>
    `;

    document.getElementById('random-modal').style.display = 'flex';
}

function closeRandomModal() {
    document.getElementById('random-modal').style.display = 'none';
}

function openRandomGameBGG() {
    if (currentRandomGame) {
        window.open(`https://boardgamegeek.com/boardgame/${currentRandomGame.objectId}`, '_blank');
    }
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('random-game-btn')?.addEventListener('click', pickRandomGame);
    
    // Keyboard shortcut: 'r' for random
    document.addEventListener('keydown', (e) => {
        if (e.key === 'r' && !e.ctrlKey && !e.metaKey && e.target.tagName !== 'INPUT' && e.target.tagName !== 'SELECT') {
            pickRandomGame();
        }
    });
    
    fetchCollection();
});
