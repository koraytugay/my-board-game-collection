let allGames = [];
let filteredGames = [];
let currentSort = 'name';
let currentViewMode = 'grid';

function formatPrice(price) {
    if (!price && price !== 0) return '';
    const str = String(price).trim();
    if (!str) return '';

    const clean = str.replace(/,/g, '');
    const match = clean.match(/[0-9]+(?:\.[0-9]+)?/);
    if (!match) return str;
    const num = parseFloat(match[0]);
    if (isNaN(num)) return str;

    let cadPrice;
    if (str.includes('€') || /\bEUR\b/i.test(str)) {
        cadPrice = num * 1.65;
    } else if (str.includes('£') || /\bGBP\b/i.test(str)) {
        cadPrice = num * 1.90;
    } else if (/\bUSD\b/i.test(str) || /\$US\b/i.test(str) || /US\$/i.test(str)) {
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

async function fetchCollection() {
    const loadingEl = document.getElementById('loading');
    const errorEl = document.getElementById('error');
    const controlsEl = document.getElementById('controls');

    try {
        const [collection, availabilityRes, designersRes] = await Promise.all([
            getCollection('wantintrade'),
            fetch('availability.json').then(res => res.ok ? res.json() : {}).catch(() => ({})),
            fetch('designers.json').then(res => res.ok ? res.json() : {}).catch(() => ({}))
        ]);
        
        allGames = collection.map(game => ({
            ...game,
            availability: availabilityRes[game.objectId] || null,
            designers: designersRes[game.objectId]?.designers || []
        }));
        
        populateDesignerFilter();
        populateSellerFilter();
        filteredGames = [...allGames];
        sortGames(currentSort);
        
        loadingEl.style.display = 'none';
        controlsEl.style.display = 'block';
        
        loadDarkModePreference();

    } catch (error) {
        console.error('Error fetching Want in Trade collection:', error);
        loadingEl.style.display = 'none';
        errorEl.style.display = 'block';
        errorEl.textContent = `Failed to load Want in Trade games: ${error.message}`;
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

function populateSellerFilter() {
    const sellerSelect = document.getElementById('seller-filter');
    if (!sellerSelect) return;

    const currentValue = sellerSelect.value;
    sellerSelect.innerHTML = '<option value="all">All Sellers</option>';

    const sellersCountMap = new Map();
    allGames.forEach(game => {
        const activeListings = getActiveBggListings(game);
        activeListings.forEach(listing => {
            if (listing.seller && listing.seller !== 'Unknown') {
                const key = listing.seller.toLowerCase();
                const existing = sellersCountMap.get(key) || { seller: listing.seller, count: 0 };
                existing.count++;
                sellersCountMap.set(key, existing);
            }
        });
    });

    const sellers = Array.from(sellersCountMap.values());
    sellers.sort((a, b) => {
        if (b.count !== a.count) {
            return b.count - a.count;
        }
        return a.seller.localeCompare(b.seller, undefined, { sensitivity: 'base' });
    });

    sellers.forEach(s => {
        const option = document.createElement('option');
        option.value = s.seller;
        option.textContent = `🏷️ ${s.seller} (${s.count})`;
        sellerSelect.appendChild(option);
    });

    if (sellers.some(s => s.seller.toLowerCase() === currentValue.toLowerCase())) {
        sellerSelect.value = currentValue;
    } else {
        sellerSelect.value = 'all';
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
    const ratingFilter = document.getElementById('rating-filter');
    const playerCountFilter = document.getElementById('player-count');
    const inStockCheckbox = document.getElementById('in-stock-only');
    const sellerFilter = document.getElementById('seller-filter');
    const designerFilter = document.getElementById('designer-filter');

    const searchTerm = searchInput ? searchInput.value.toLowerCase().trim() : '';
    const ratingVal = ratingFilter ? ratingFilter.value : 'all';
    const playerCountVal = playerCountFilter ? playerCountFilter.value : 'all';
    const inStockOnly = inStockCheckbox ? inStockCheckbox.checked : false;
    const sellerVal = sellerFilter ? sellerFilter.value : 'all';
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

        const activeListings = getActiveBggListings(game);

        let matchesStock = true;
        if (inStockOnly) {
            matchesStock = activeListings.length > 0;
        }

        let matchesSeller = true;
        if (sellerVal !== 'all') {
            matchesSeller = activeListings.some(l => l.seller && l.seller.toLowerCase() === sellerVal.toLowerCase());
        }

        let matchesDesigner = true;
        if (designerVal !== 'all') {
            const designers = game.designers || [];
            matchesDesigner = designers.some(d => d.toLowerCase() === designerVal.toLowerCase());
        }

        return matchesSearch && matchesRating && matchesPlayers && matchesStock && matchesSeller && matchesDesigner;
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
    card.onclick = () => {
        if (typeof showGameDetails === 'function') {
            showGameDetails(game.objectId);
        } else {
            window.open(`https://boardgamegeek.com/boardgame/${game.objectId}`, '_blank');
        }
    };

    const activeBggListings = getActiveBggListings(game);
    const isInStock = activeBggListings.length > 0;

    let badgesHtml = '';
    if (isInStock) {
        badgesHtml += '<span class="badge badge-favorite">In Stock</span>';
    }
    if (game.minPlayers <= 1) badgesHtml += '<span class="badge badge-solo">Solo</span>';
    if (game.rating >= 8) badgesHtml += '<span class="badge badge-highly-rated">Highly Rated</span>';

    // Store availability / BGG Market chips
    let storeButtonsHtml = '';
    if (activeBggListings.length > 0) {
        activeBggListings.forEach(listing => {
            const label = listing.seller ? `🏷️ ${listing.seller}` : '🏷️ BGG Market';
            const priceText = formatPrice(listing.price, 'bggMarket');
            storeButtonsHtml += `
                <a href="${listing.url}" target="_blank" class="store-chip bgg-market" title="View listing by ${listing.seller || 'BGG Market'}" onclick="event.stopPropagation()">
                    <span class="store-chip-name">${label}</span>
                    ${priceText ? `<span class="store-chip-price">${priceText}</span>` : ''}
                </a>
            `;
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
                ${game.myRating > 0 ? `<div class="meta-item"><span>💚</span> ${game.myRating.toFixed(1)}</div>` : ''}
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
