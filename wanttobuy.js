let allGames = [];
let filteredGames = [];
let currentSort = 'name';
let currentViewMode = 'grid';

async function fetchCollection() {
    const loadingEl = document.getElementById('loading');
    const errorEl = document.getElementById('error');
    const statsEl = document.getElementById('stats');
    const controlsEl = document.getElementById('controls');

    try {
        // Fetch BGG collection and availability in parallel
        const [collection, availabilityRes] = await Promise.all([
            getCollection('wanttobuy'),
            fetch('availability.json').then(res => res.ok ? res.json() : {}).catch(() => ({}))
        ]);
        
        allGames = collection.map(game => ({
            ...game,
            lastPlayed: '',
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
                boardGameBandit: { available: false, price: null, url: null }
            }
        }));
        
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
    const inStockGames = allGames.filter(game => 
        game.availability?.boardGameBliss?.available || 
        game.availability?.fourZeroOneGames?.available ||
        game.availability?.lvlUpGames?.available ||
        game.availability?.asDesJeux?.available ||
        game.availability?.greatBoardgames?.available ||
        game.availability?.meeplemart?.available ||
        game.availability?.amazonCa?.available ||
        game.availability?.woodForSheep?.available ||
        game.availability?.faceToFaceGames?.available ||
        game.availability?.boardGameBandit?.available
    ).length;

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
                return parseInt(b.yearPublished) - parseInt(a.yearPublished);
            case 'year-asc':
                return parseInt(a.yearPublished) - parseInt(b.yearPublished);
            default:
                return 0;
        }
    });

    applyFilters();
}

function applyFilters() {
    const inStockOnly = document.getElementById('in-stock-only').checked;

    filteredGames = allGames.filter(game => {
        if (inStockOnly) {
            return game.availability?.boardGameBliss?.available || 
                   game.availability?.fourZeroOneGames?.available ||
                   game.availability?.lvlUpGames?.available ||
                   game.availability?.asDesJeux?.available ||
                   game.availability?.greatBoardgames?.available ||
                   game.availability?.meeplemart?.available ||
                   game.availability?.amazonCa?.available ||
                   game.availability?.woodForSheep?.available ||
                   game.availability?.faceToFaceGames?.available ||
                   game.availability?.boardGameBandit?.available;
        }
        return true;
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
    const isInStock = game.availability?.boardGameBliss?.available || 
                      game.availability?.fourZeroOneGames?.available ||
                      game.availability?.lvlUpGames?.available ||
                      game.availability?.asDesJeux?.available ||
                      game.availability?.greatBoardgames?.available ||
                      game.availability?.meeplemart?.available ||
                      game.availability?.amazonCa?.available ||
                      game.availability?.woodForSheep?.available ||
                      game.availability?.faceToFaceGames?.available ||
                      game.availability?.boardGameBandit?.available;
    
    if (isInStock) {
        badgesHtml += '<span class="badge badge-favorite">In Stock</span>';
    }
    
    if (game.minPlayers <= 1) badgesHtml += '<span class="badge badge-solo">Solo</span>';
    if (game.rating >= 8) badgesHtml += '<span class="badge badge-highly-rated">Highly Rated</span>';

    // Build store availability HTML
    let storeHtml = '';
    const bgb = game.availability?.boardGameBliss;
    const fof = game.availability?.fourZeroOneGames;
    const lvl = game.availability?.lvlUpGames;
    const adj = game.availability?.asDesJeux;
    const gbg = game.availability?.greatBoardgames;
    const meeple = game.availability?.meeplemart;
    const amzn = game.availability?.amazonCa;
    const wfs = game.availability?.woodForSheep;
    const f2f = game.availability?.faceToFaceGames;
    const bgbnd = game.availability?.boardGameBandit;

    if ((bgb && bgb.url) || (fof && fof.url) || (lvl && lvl.url) || (adj && adj.url) || (gbg && gbg.url) || (meeple && meeple.url) || (amzn && amzn.url) || (wfs && wfs.url) || (f2f && f2f.url) || (bgbnd && bgbnd.url)) {
        storeHtml += '<div class="store-availability">';
        
        const renderStoreBtn = (store, name, btnClass) => {
            if (!store || !store.url) return '';
            const statusClass = store.available ? 'store-status-instock' : 'store-status-outofstock';
            const statusText = store.available ? 'In Stock' : 'Out of Stock';
            const priceText = store.price ? `$${store.price}` : '';
            return `
                <a href="${store.url}" target="_blank" class="store-btn ${btnClass} ${store.available ? '' : 'store-btn-out'}">
                    <span class="store-name">${name}</span>
                    <span>${priceText} <span class="store-status ${statusClass}">${statusText}</span></span>
                </a>
            `;
        };

        storeHtml += renderStoreBtn(bgb, '🍁 BoardGameBliss', 'store-btn-bgb');
        storeHtml += renderStoreBtn(fof, '🎲 401 Games', 'store-btn-401');
        storeHtml += renderStoreBtn(lvl, '⚔️ LVLUP Games', 'store-btn-lvlup');
        storeHtml += renderStoreBtn(adj, '🃏 As des Jeux', 'store-btn-adj');
        storeHtml += renderStoreBtn(gbg, '🏰 Great Boardgames', 'store-btn-greatbg');
        storeHtml += renderStoreBtn(meeple, '👾 Meeplemart', 'store-btn-meeplemart');
        storeHtml += renderStoreBtn(amzn, '🛒 Amazon.ca', 'store-btn-amazon');
        storeHtml += renderStoreBtn(wfs, '🐑 Wood for Sheep', 'store-btn-wfs');
        storeHtml += renderStoreBtn(f2f, '🤝 Face to Face', 'store-btn-f2f');
        storeHtml += renderStoreBtn(bgbnd, '🦝 Board Game Bandit', 'store-btn-bandit');
        
        storeHtml += '</div>';
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
