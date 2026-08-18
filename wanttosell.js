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
        const [collection, lastPlayDates] = await Promise.all([
            getCollection('wanttosell'),
            getLastPlayDates()
        ]);
        
        allGames = collection.map(game => ({
            ...game,
            lastPlayed: lastPlayDates[game.objectId] || ''
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
        errorEl.textContent = `Failed to load collection: ${error.message}`;
    }
}

function updateStats() {
    const totalGames = allGames.length;
    const totalPlays = allGames.reduce((sum, game) => sum + game.numPlays, 0);
    const unplayedGames = allGames.filter(game => game.numPlays === 0).length;
    
    const ratedGames = allGames.filter(game => game.rating > 0);
    const avgRating = ratedGames.length > 0 
        ? ratedGames.reduce((sum, game) => sum + game.rating, 0) / ratedGames.length 
        : 0;

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
            case 'rating-desc':
                return b.rating - a.rating;
            case 'rating-asc':
                return a.rating - b.rating;
            case 'myrating-desc':
                return b.myRating - a.myRating;
            case 'myrating-asc':
                return a.myRating - b.myRating;
            case 'plays-desc':
                return b.numPlays - a.numPlays;
            case 'plays-asc':
                return a.numPlays - b.numPlays;
            case 'recently-played':
                if (!a.lastPlayed && !b.lastPlayed) return 0;
                if (!a.lastPlayed) return 1;
                if (!b.lastPlayed) return -1;
                return b.lastPlayed.localeCompare(a.lastPlayed);
            case 'least-recently-played':
                if (!a.lastPlayed && !b.lastPlayed) return 0;
                if (!a.lastPlayed) return -1;
                if (!b.lastPlayed) return 1;
                return a.lastPlayed.localeCompare(b.lastPlayed);
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
    const searchTerm = document.getElementById('search-input')?.value.toLowerCase() || '';
    const playerCount = document.getElementById('player-count')?.value || 'all';
    const unplayedOnly = document.getElementById('unplayed-only')?.checked || false;
    const soloOnly = document.getElementById('solo-only')?.checked || false;
    const favoritesOnly = document.getElementById('favorites-only')?.checked || false;

    filteredGames = allGames.filter(game => {
        // Search filter
        if (searchTerm && !game.name.toLowerCase().includes(searchTerm)) {
            return false;
        }

        // Unplayed filter
        if (unplayedOnly && game.numPlays > 0) {
            return false;
        }

        // Solo filter
        if (soloOnly && game.minPlayers > 1) {
            return false;
        }

        // Favorites filter
        if (favoritesOnly && game.myRating < 9) {
            return false;
        }

        // Player count filter
        if (playerCount !== 'all') {
            if (playerCount === '2-only') {
                if (game.minPlayers !== 2 || game.maxPlayers !== 2) return false;
            } else if (playerCount === '5+') {
                if (game.maxPlayers < 5) return false;
            } else {
                const count = parseInt(playerCount);
                if (game.minPlayers > count || game.maxPlayers < count) return false;
            }
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
        gamesGridEl.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">🏷️</div>
                <h3>No Games Match Your Filters</h3>
                <p>There are no games matching your current criteria.</p>
                <a href="https://boardgamegeek.com/collection/user/koraytugay" target="_blank" class="bgg-link-btn">
                    Manage Collection on BGG ↗
                </a>
            </div>
        `;
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
    if (game.numPlays === 0) badgesHtml += '<span class="badge badge-unplayed">Unplayed</span>';
    if (game.minPlayers <= 1) badgesHtml += '<span class="badge badge-solo">Solo</span>';
    if (game.rating >= 8) badgesHtml += '<span class="badge badge-highly-rated">Highly Rated</span>';
    if (game.myRating >= 9) badgesHtml += '<span class="badge badge-favorite">Favorite</span>';

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
                ${game.myRating > 0 ? `<div class="meta-item"><span>💚</span> ${game.myRating.toFixed(1)}</div>` : ''}
                <div class="meta-item"><span>🎲</span> ${game.numPlays} plays</div>
                ${game.lastPlayed ? `<div class="meta-item"><span>📅</span> ${game.lastPlayed}</div>` : ''}
            </div>
        </div>
    `;
    return card;
}

function escapeHtml(str) {
    if (!str) return '';
    return str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
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
