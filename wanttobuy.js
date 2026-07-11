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
        const collection = await getCollection('wanttobuy');
        
        allGames = collection.map(game => ({
            ...game,
            lastPlayed: ''
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
    const twoPlayerGames = allGames.filter(game => game.minPlayers <= 2 && game.maxPlayers >= 2).length;

    document.getElementById('total-games').textContent = totalGames;
    document.getElementById('avg-rating').textContent = avgRating.toFixed(1);
    document.getElementById('solo-games').textContent = soloGames;
    document.getElementById('two-player-games').textContent = twoPlayerGames;
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
    const searchTerm = document.getElementById('search-input').value.toLowerCase();
    const playerCount = document.getElementById('player-count').value;
    const playTime = document.getElementById('play-time').value;
    const ratingFilter = document.getElementById('rating-filter').value;

    filteredGames = allGames.filter(game => {
        const matchesSearch = game.name.toLowerCase().includes(searchTerm);
        
        let matchesPlayers = true;
        if (playerCount !== 'all') {
            if (playerCount === '2-only') {
                matchesPlayers = game.minPlayers === 2 && game.maxPlayers === 2;
            } else if (playerCount === '5') {
                matchesPlayers = game.maxPlayers >= 5;
            } else {
                const count = parseInt(playerCount);
                matchesPlayers = count >= game.minPlayers && count <= game.maxPlayers;
            }
        }

        let matchesTime = true;
        if (playTime !== 'all') {
            const [min, max] = playTime.split('-').map(Number);
            matchesTime = game.playingTime >= min && game.playingTime <= max;
        }

        let matchesRating = true;
        if (ratingFilter !== 'all') {
            const minRating = parseFloat(ratingFilter);
            matchesRating = game.rating >= minRating;
        }

        return matchesSearch && matchesPlayers && matchesTime && matchesRating;
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
    card.onclick = () => window.open(`https://boardgamegeek.com/boardgame/${game.objectId}`, '_blank');

    let badgesHtml = '';
    if (game.minPlayers <= 1) badgesHtml += '<span class="badge badge-solo">Solo</span>';
    if (game.rating >= 8) badgesHtml += '<span class="badge badge-highly-rated">Highly Rated</span>';

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
