let allGames = [];
let currentSort = 'name';
let currentViewMode = 'grid';
let filters = {
    search: '',
    playerCount: 'all',
    playTime: 'all',
    rating: 'all',
    unplayedOnly: false
};

async function fetchCollection() {
    const loadingEl = document.getElementById('loading');
    const errorEl = document.getElementById('error');
    const statsEl = document.getElementById('stats');

    try {
        allGames = await getCollection();
        sortGames('name');
        updateStats();

        loadingEl.style.display = 'none';
        statsEl.style.display = 'flex';
        document.getElementById('controls').style.display = 'block';

        renderGames();
        loadDarkModePreference();

    } catch (error) {
        console.error('Error fetching collection:', error);
        loadingEl.style.display = 'none';
        errorEl.style.display = 'block';
        errorEl.textContent = `Failed to load collection: ${error.message}`;
    }
}

function updateStats() {
    const totalGames = allGames.length;
    const totalPlays = allGames.reduce((sum, game) => sum + game.numPlays, 0);
    const playedGames = allGames.filter(game => game.numPlays > 0).length;
    const unplayedGames = totalGames - playedGames;
    
    const ratedGames = allGames.filter(game => game.rating > 0);
    const avgRating = ratedGames.length > 0 
        ? ratedGames.reduce((sum, game) => sum + game.rating, 0) / ratedGames.length 
        : 0;

    const hIndex = calculateHIndex(allGames);

    document.getElementById('total-games').textContent = totalGames;
    document.getElementById('total-plays').textContent = totalPlays;
    document.getElementById('avg-rating').textContent = avgRating.toFixed(1);
    document.getElementById('unplayed-games').textContent = unplayedGames;
}

function sortGames(criteria) {
    currentSort = criteria;
    
    allGames.sort((a, b) => {
        switch (criteria) {
            case 'name':
                return a.name.localeCompare(b.name);
            case 'rating':
                return b.rating - a.rating;
            case 'my-rating':
                return b.myRating - a.myRating;
            case 'plays':
                return b.numPlays - a.numPlays;
            case 'newest':
                return parseInt(b.yearPublished) - parseInt(a.yearPublished);
            case 'oldest':
                return parseInt(a.yearPublished) - parseInt(b.yearPublished);
            default:
                return 0;
        }
    });

    renderGames();
}

function filterGames() {
    filters.search = document.getElementById('search-input').value.toLowerCase();
    filters.playerCount = document.getElementById('player-filter').value;
    filters.playTime = document.getElementById('time-filter').value;
    filters.rating = document.getElementById('rating-filter').value;
    filters.unplayedOnly = document.getElementById('unplayed-filter').checked;

    renderGames();
}

function renderGames() {
    const gamesGridEl = document.getElementById('games-grid');
    
    // Use the original view mode classes from styles.css
    if (currentViewMode === 'grid') {
        gamesGridEl.className = 'games-grid view-compact';
    } else {
        gamesGridEl.className = 'games-grid view-list';
    }
    
    const filteredGames = allGames.filter(game => {
        const matchesSearch = game.name.toLowerCase().includes(filters.search);
        
        let matchesPlayers = true;
        if (filters.playerCount !== 'all') {
            const count = parseInt(filters.playerCount);
            matchesPlayers = count >= game.minPlayers && count <= game.maxPlayers;
        }

        let matchesTime = true;
        if (filters.playTime !== 'all') {
            const time = parseInt(filters.playTime);
            if (time === 30) matchesTime = game.playingTime <= 30;
            else if (time === 60) matchesTime = game.playingTime > 30 && game.playingTime <= 60;
            else if (time === 90) matchesTime = game.playingTime > 60 && game.playingTime <= 90;
            else if (time === 120) matchesTime = game.playingTime > 90;
        }

        let matchesRating = true;
        if (filters.rating !== 'all') {
            const rating = parseInt(filters.rating);
            matchesRating = game.rating >= rating;
        }

        const matchesUnplayed = !filters.unplayedOnly || game.numPlays === 0;

        return matchesSearch && matchesPlayers && matchesTime && matchesRating && matchesUnplayed;
    });

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

    // Add original badges logic
    let badgesHtml = '';
    if (game.numPlays === 0) badgesHtml += '<span class="badge badge-unplayed">Unplayed</span>';
    if (game.minPlayers <= 1) badgesHtml += '<span class="badge badge-solo">Solo</span>';
    if (game.rating >= 8) badgesHtml += '<span class="badge badge-highly-rated">Highly Rated</span>';
    if (game.myRating >= 9) badgesHtml += '<span class="badge badge-favorite">Favorite</span>';
    if (game.numPlays >= 10) badgesHtml += '<span class="badge badge-frequently-played">Frequent</span>';

    card.innerHTML = `
        <div class="game-badges">
            ${badgesHtml}
        </div>
        <img src="${game.thumbnail || 'https://via.placeholder.com/300x300?text=No+Image'}" 
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
                <div class="meta-item"><span>🎲</span> ${game.numPlays} plays</div>
            </div>
        </div>
    `;

    return card;
}

function setViewMode(mode) {
    currentViewMode = mode;
    const gridBtn = document.getElementById('grid-view-btn');
    const listBtn = document.getElementById('list-view-btn');
    if (gridBtn) gridBtn.classList.toggle('active', mode === 'grid');
    if (listBtn) listBtn.classList.toggle('active', mode === 'list');
    renderGames();
}

let currentRandomGame = null;

function pickRandomGame() {
    const filteredGames = allGames; // Simple pick from all for now
    if (filteredGames.length === 0) return;

    const randomIndex = Math.floor(Math.random() * filteredGames.length);
    currentRandomGame = filteredGames[randomIndex];

    displayRandomGame(currentRandomGame);

    const modal = document.getElementById('random-modal');
    if (modal) modal.style.display = 'flex';
}

function displayRandomGame(game) {
    const img = document.getElementById('random-game-img');
    const name = document.getElementById('random-game-name');
    const year = document.getElementById('random-game-year');
    const meta = document.getElementById('random-game-meta');

    if (img) img.src = game.image || game.thumbnail; // High res is okay for one modal image
    if (name) name.textContent = game.name;
    if (year) year.textContent = game.yearPublished !== 'N/A' ? `(${game.yearPublished})` : '';

    if (meta) {
        meta.innerHTML = `
            <div class="meta-item"><span>👥</span> ${game.minPlayers}-${game.maxPlayers} players</div>
            <div class="meta-item"><span>⏱️</span> ${game.playingTime} min</div>
            <div class="meta-item"><span>⭐</span> ${game.rating.toFixed(2)}</div>
            ${game.myRating > 0 ? `<div class="meta-item"><span>💚</span> ${game.myRating.toFixed(2)}</div>` : ''}
            <div class="meta-item"><span>🎲</span> ${game.numPlays} plays</div>
        `;
    }
}

window.closeRandomModal = function() {
    const modal = document.getElementById('random-modal');
    if (modal) modal.style.display = 'none';
}

window.openRandomGameBGG = function() {
    if (currentRandomGame) {
        window.open(`https://boardgamegeek.com/boardgame/${currentRandomGame.objectId}`, '_blank');
    }
}

function toggleDarkMode() {
    document.body.classList.toggle('dark-mode');
    const isDark = document.body.classList.contains('dark-mode');
    localStorage.setItem('darkMode', isDark);
    const icon = document.getElementById('dark-mode-icon');
    if (icon) icon.textContent = isDark ? '☀️' : '🌙';
}

function loadDarkModePreference() {
    const isDark = localStorage.getItem('darkMode') === 'true';
    if (isDark) {
        document.body.classList.add('dark-mode');
        const icon = document.getElementById('dark-mode-icon');
        if (icon) icon.textContent = '☀️';
    }
}

document.addEventListener('DOMContentLoaded', () => {
    // Event listeners
    document.getElementById('sort-select')?.addEventListener('change', (e) => sortGames(e.target.value));
    document.getElementById('search-input')?.addEventListener('input', filterGames);
    document.getElementById('player-filter')?.addEventListener('change', filterGames);
    document.getElementById('time-filter')?.addEventListener('change', filterGames);
    document.getElementById('rating-filter')?.addEventListener('change', filterGames);
    document.getElementById('unplayed-filter')?.addEventListener('change', filterGames);
    
    document.getElementById('grid-view-btn')?.addEventListener('click', () => setViewMode('grid'));
    document.getElementById('list-view-btn')?.addEventListener('click', () => setViewMode('list'));
    
    document.getElementById('dark-mode-toggle')?.addEventListener('click', toggleDarkMode);
    
    const randomBtn = document.getElementById('random-game-btn');
    if (randomBtn) {
        randomBtn.addEventListener('click', pickRandomGame);
    }

    // Keyboard shortcut: 'r' for random
    document.addEventListener('keydown', (e) => {
        if (e.key === 'r' && !e.ctrlKey && !e.metaKey && e.target.tagName !== 'INPUT' && e.target.tagName !== 'SELECT') {
            pickRandomGame();
        }
    });
    
    fetchCollection();
});
