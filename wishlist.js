// wishlist.js - Shared page logic for Want to Buy and Like to Have.
// The page picks its list with: <script src="wishlist.js" data-list="wanttobuy|liketohave"></script>

const WISHLIST_PAGES = {
    wanttobuy: {
        collection: 'wanttobuy',
        availabilityFiles: ['availability.json'],
        errorLabel: 'wanted games',
        sellerSort: 'count',
        dealBadge: 'detailed',
        showTradeBadge: true,
        metaExtra: 'designers'
    },
    liketohave: {
        collection: 'liketohave',
        // later files win, so list-specific results override the general file
        availabilityFiles: ['availability.json', 'availability-liketohave.json'],
        errorLabel: 'Like to Have games',
        sellerSort: 'name',
        dealBadge: 'simple',
        showTradeBadge: false,
        metaExtra: 'myRating'
    }
};

const wishlistConfig = WISHLIST_PAGES[document.currentScript.dataset.list];

let allGames = [];
let filteredGames = [];
let currentSort = 'name';
let currentViewMode = 'grid';

// Like to Have flags a deal on any available retail store, without the in-stock price check.
function hasAnyRetailDeal(game) {
    if (!game.availability) return false;
    for (const store of STORES) {
        if (store.key === 'bggMarket') continue;
        const sData = game.availability[store.key];
        if (sData?.available && sData?.deal && sData.deal.discountPercent >= 20) {
            return true;
        }
    }
    return false;
}

function gameHasDeal(game) {
    return wishlistConfig.dealBadge === 'detailed' ? hasGameMajorDeal(game) : hasAnyRetailDeal(game);
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
        if (wishlistConfig.sellerSort === 'count' && b.count !== a.count) {
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
        const [collection, designersRes, ...availabilityResults] = await Promise.all([
            getCollection(wishlistConfig.collection),
            fetch('designers.json').then(res => res.ok ? res.json() : {}).catch(() => ({})),
            ...wishlistConfig.availabilityFiles.map(loadAvailabilityFile)
        ]);

        const availabilityMap = Object.assign({}, ...availabilityResults);

        allGames = collection.map(game => ({
            ...game,
            designers: designersRes[game.objectId]?.designers || [],
            availability: availabilityMap[game.objectId] || null
        }));

        populateStoreFilter();
        populateSellerFilter();
        populateDesignerFilter();

        filteredGames = [...allGames];
        sortGames(currentSort);

        loadingEl.style.display = 'none';
        controlsEl.style.display = 'block';
        renderStockStatus(...availabilityResults);

        loadDarkModePreference();

    } catch (error) {
        console.error(`Error fetching ${wishlistConfig.errorLabel}:`, error);
        loadingEl.style.display = 'none';
        errorEl.style.display = 'block';
        errorEl.textContent = `Failed to load ${wishlistConfig.errorLabel}: ${error.message}`;
    }
}

function sortGames(criteria) {
    currentSort = criteria;

    allGames.sort((a, b) => {
        switch (criteria) {
            case 'rating-desc':
                return b.rating - a.rating;
            case 'rating-asc':
                return a.rating - b.rating;
            case 'myrating-desc':
                return b.myRating - a.myRating;
            case 'myrating-asc':
                return a.myRating - b.myRating;
            case 'year-desc':
                return (parseInt(b.yearPublished) || 0) - (parseInt(a.yearPublished) || 0);
            case 'year-asc':
                return (parseInt(a.yearPublished) || 0) - (parseInt(b.yearPublished) || 0);
            case 'name':
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
    const playTimeFilter = document.getElementById('play-time');
    const inStockCheckbox = document.getElementById('in-stock-only');
    const majorDealsCheckbox = document.getElementById('major-deals-only');
    const designerFilter = document.getElementById('designer-filter');
    const storeFilter = document.getElementById('store-filter');
    const sellerFilter = document.getElementById('seller-filter');

    const searchTerm = searchInput ? searchInput.value.toLowerCase().trim() : '';
    const ratingVal = ratingFilter ? ratingFilter.value : 'all';
    const playerCountVal = playerCountFilter ? playerCountFilter.value : 'all';
    const playTime = playTimeFilter ? playTimeFilter.value : 'all';
    const inStockOnly = inStockCheckbox ? inStockCheckbox.checked : false;
    const majorDealsOnly = majorDealsCheckbox ? majorDealsCheckbox.checked : false;
    const designerVal = designerFilter ? designerFilter.value : 'all';
    const storeVal = storeFilter ? storeFilter.value : 'all';
    const sellerVal = sellerFilter ? sellerFilter.value : 'all';

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

        let matchesTime = true;
        if (playTime !== 'all') {
            const [min, max] = playTime.split('-').map(Number);
            matchesTime = game.playingTime >= min && game.playingTime <= max;
        }

        let matchesStock = true;
        if (inStockOnly) {
            matchesStock = isGameInStockAtAnyStore(game);
        }

        let matchesDeal = true;
        if (majorDealsOnly) {
            matchesDeal = gameHasDeal(game);
        }

        let matchesDesigner = true;
        if (designerVal !== 'all') {
            const designers = game.designers || [];
            matchesDesigner = designers.some(d => d.toLowerCase() === designerVal.toLowerCase());
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

        return matchesSearch && matchesRating && matchesPlayers && matchesTime && matchesStock && matchesDeal && matchesDesigner && matchesStore && matchesSeller;
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

function buildBadgesHtml(game) {
    let badgesHtml = '';

    if (isGameInStockAtAnyStore(game)) {
        badgesHtml += wishlistConfig.dealBadge === 'detailed'
            ? '<span class="badge badge-favorite">In Stock</span>'
            : '<span class="badge badge-instock" style="background:#c6f6d5; color:#22543d;">In Stock</span>';
    }

    if (wishlistConfig.dealBadge === 'detailed') {
        const dealInfo = getGameDealInfo(game);
        if (dealInfo) {
            const prevPriceFormatted = formatPrice(dealInfo.previousPrice, dealInfo.storeKey);
            const currPriceFormatted = formatPrice(dealInfo.currentPrice, dealInfo.storeKey);
            badgesHtml += `<span class="badge badge-deal" title="Was ${prevPriceFormatted}, now ${currPriceFormatted}">🔥 -${dealInfo.discountPercent}% Deal</span>`;
        }
    } else if (hasAnyRetailDeal(game)) {
        badgesHtml += '<span class="badge badge-deal" style="background:#feebc8; color:#7b341e;">🔥 Deal</span>';
    }

    if (wishlistConfig.showTradeBadge && game.isWantInTrade) {
        badgesHtml += '<span class="badge badge-want-trade">Want in Trade</span>';
    }

    if (game.minPlayers <= 1) badgesHtml += '<span class="badge badge-solo">Solo</span>';
    if (game.rating >= 8) badgesHtml += '<span class="badge badge-highly-rated">Highly Rated</span>';

    return badgesHtml;
}

function buildMetaExtraHtml(game) {
    if (wishlistConfig.metaExtra === 'myRating') {
        return game.myRating > 0 ? `<div class="meta-item"><span>💚</span> ${game.myRating.toFixed(1)}</div>` : '';
    }
    const designersText = (game.designers && game.designers.length > 0 && game.designers[0] !== '(Uncredited)')
        ? game.designers.join(', ')
        : '';
    return designersText ? `<div class="meta-item" title="Designer: ${designersText}"><span>✍️</span> ${designersText}</div>` : '';
}

function createGameCard(game) {
    const card = document.createElement('div');
    card.className = 'game-card';
    card.onclick = (e) => {
        // Prevent opening modal if user is clicking a store link, button, or any interactive element
        if (e.target.closest('a') || e.target.closest('button') || e.target.closest('.store-chip')) return;
        if (typeof showGameDetails === 'function') {
            showGameDetails(game.objectId);
        } else {
            window.open(`https://boardgamegeek.com/boardgame/${game.objectId}`, '_blank');
        }
    };

    // Build store availability HTML (only for stores / sellers that are in stock)
    let storeButtonsHtml = '';
    const activeBggListings = getActiveBggListings(game);

    const renderStoreChip = (store, name, storeKey = null, isBggMarket = false) => {
        if (!store || !store.url || !store.available) return '';
        const priceText = formatPrice(store.price, storeKey);
        const hasDeal = store.deal && store.deal.discountPercent >= 20;
        const prevPriceText = hasDeal ? formatPrice(store.deal.previousPrice, storeKey) : '';
        const stale = isStaleCheck(store.lastChecked);
        const chipClass = (isBggMarket ? 'store-chip bgg-market' : (hasDeal ? 'store-chip has-deal' : 'store-chip')) + (stale ? ' stale' : '');
        const dealBadge = hasDeal ? `<span class="chip-deal-badge">-${store.deal.discountPercent}%</span>` : '';
        const staleNote = stale ? ` · as of ${formatCheckDate(store.lastChecked)}, may be out of date` : '';
        return `
            <a href="${store.url}" target="_blank" class="${chipClass}" title="View on ${name}${hasDeal ? ` (Was ${prevPriceText}, now ${priceText})` : ''}${staleNote}">
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
                url: listing.url,
                lastChecked: game.availability?.bggMarket?.lastChecked
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

    card.innerHTML = `
        <div class="game-badges">
            ${buildBadgesHtml(game)}
        </div>
        <img src="${game.image || game.thumbnail || 'https://via.placeholder.com/300x300?text=No+Image'}"
            alt="${game.name}"
            class="game-thumbnail"
            loading="lazy"
            onerror="this.onerror=null;this.src='https://via.placeholder.com/300x300?text=No+Image';">
        <div class="game-info">
            <div class="game-year">${game.yearPublished !== 'N/A' ? game.yearPublished : ''}</div>
            <div class="game-name">${game.name}</div>
            <div class="game-meta">
                <div class="meta-item"><span>👥</span> ${game.minPlayers}-${game.maxPlayers}</div>
                <div class="meta-item"><span>⏱️</span> ${game.playingTime} min</div>
                <div class="meta-item"><span>⭐</span> ${game.rating.toFixed(1)}</div>
                ${buildMetaExtraHtml(game)}
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
