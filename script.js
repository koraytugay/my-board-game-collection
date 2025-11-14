const USERNAME = 'koraytugay';
const CORS_PROXY = 'https://corsproxy.io/?';
const COLLECTION_XML_FILE = 'https://raw.githubusercontent.com/koraytugay/my-board-game-collection/refs/heads/main/collection.xml';

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
    const gamesGridEl = document.getElementById('games-grid');

    try {
        const response = await fetch(COLLECTION_XML_FILE);

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const xmlText = await response.text();
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlText, 'text/xml');

        const errorNode = xmlDoc.querySelector('parsererror');
        if (errorNode) {
            throw new Error('Error parsing XML response');
        }

        const message = xmlDoc.querySelector('message');
        if (message) {
            throw new Error('BGG API returned: ' + message.textContent);
        }

        const items = xmlDoc.querySelectorAll('item');

        if (items.length === 0) {
            throw new Error('No games found in collection');
        }

        const games = Array.from(items).map(item => {
            const name = item.querySelector('name')?.textContent || 'Unknown Game';
            const yearPublished = item.querySelector('yearpublished')?.textContent || 'N/A';
            const thumbnail = item.querySelector('thumbnail')?.textContent || '';
            const image = item.querySelector('image')?.textContent || thumbnail;
            const minPlayers = item.querySelector('stats')?.getAttribute('minplayers') || '?';
            const maxPlayers = item.querySelector('stats')?.getAttribute('maxplayers') || '?';
            const playingTime = item.querySelector('stats')?.getAttribute('playingtime') || '?';
            const numPlays = item.querySelector('numplays')?.textContent || '0';
            const objectId = item.getAttribute('objectid');
            const ratingValue = item.querySelector('stats rating average')?.getAttribute('value') || '0';
            const rating = parseFloat(ratingValue);
            const myRatingValue = item.querySelector('stats rating')?.getAttribute('value') || '0';
            const myRating = parseFloat(myRatingValue);

            return {
                name,
                yearPublished,
                thumbnail: image || thumbnail,
                minPlayers,
                maxPlayers,
                playingTime,
                numPlays: parseInt(numPlays),
                objectId,
                rating,
                myRating
            };
        });

        allGames = games;
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

function createGameCard(game) {
    const card = document.createElement('div');
    card.className = 'game-card';
    card.onclick = () => window.open(`https://boardgamegeek.com/boardgame/${game.objectId}`, '_blank');

    // Add badges container
    const badges = document.createElement('div');
    badges.className = 'game-badges';

    // Add badges based on game properties
    if (game.numPlays === 0) {
        const badge = document.createElement('span');
        badge.className = 'badge badge-unplayed';
        badge.textContent = 'Unplayed';
        badges.appendChild(badge);
    }

    if (game.minPlayers === '1') {
        const badge = document.createElement('span');
        badge.className = 'badge badge-solo';
        badge.textContent = 'Solo';
        badges.appendChild(badge);
    }

    if (game.rating >= 8.0) {
        const badge = document.createElement('span');
        badge.className = 'badge badge-highly-rated';
        badge.textContent = 'Highly Rated';
        badges.appendChild(badge);
    }

    if (game.myRating > 0 && game.myRating >= 8.0) {
        const badge = document.createElement('span');
        badge.className = 'badge badge-favorite';
        badge.textContent = 'Favorite';
        badges.appendChild(badge);
    }

    if (game.numPlays >= 10) {
        const badge = document.createElement('span');
        badge.className = 'badge badge-frequently-played';
        badge.textContent = `${game.numPlays} plays`;
        badges.appendChild(badge);
    }

    const img = document.createElement('img');
    img.className = 'game-thumbnail';
    img.src = game.thumbnail || 'https://via.placeholder.com/280x200?text=No+Image';
    img.alt = game.name;
    img.onerror = () => {
        img.src = 'https://via.placeholder.com/280x200?text=No+Image';
    };

    const info = document.createElement('div');
    info.className = 'game-info';

    const name = document.createElement('div');
    name.className = 'game-name';
    name.textContent = game.name;

    const year = document.createElement('div');
    year.className = 'game-year';
    year.textContent = game.yearPublished !== 'N/A' ? `(${game.yearPublished})` : '';

    const meta = document.createElement('div');
    meta.className = 'game-meta';

    const players = document.createElement('div');
    players.className = 'meta-item';
    players.innerHTML = `<span>👥</span> ${game.minPlayers}-${game.maxPlayers}`;

    const time = document.createElement('div');
    time.className = 'meta-item';
    time.innerHTML = `<span>⏱️</span> ${game.playingTime} min`;

    const rating = document.createElement('div');
    rating.className = 'meta-item';
    rating.innerHTML = `<span>⭐</span> ${game.rating.toFixed(2)}`;

    const myRating = document.createElement('div');
    myRating.className = 'meta-item';
    myRating.innerHTML = `<span>💚</span> ${game.myRating.toFixed(2)}`;

    const plays = document.createElement('div');
    plays.className = 'meta-item';
    plays.innerHTML = `<span>🎲</span> ${game.numPlays} plays`;

    meta.appendChild(players);
    meta.appendChild(time);
    meta.appendChild(rating);
    meta.appendChild(myRating);
    meta.appendChild(plays);

    info.appendChild(name);
    info.appendChild(year);
    info.appendChild(meta);

    if (badges.children.length > 0) {
        card.appendChild(badges);
    }
    card.appendChild(img);
    card.appendChild(info);

    return card;
}

window.sortGames = function(sortBy) {
    currentSort = sortBy;

    if (sortBy === 'name') {
        allGames.sort((a, b) => a.name.localeCompare(b.name));
    } else if (sortBy === 'rating-asc') {
        allGames.sort((a, b) => a.rating - b.rating);
    } else if (sortBy === 'rating-desc') {
        allGames.sort((a, b) => b.rating - a.rating);
    } else if (sortBy === 'myrating-asc') {
        allGames.sort((a, b) => a.myRating - b.myRating);
    } else if (sortBy === 'myrating-desc') {
        allGames.sort((a, b) => b.myRating - a.myRating);
    } else if (sortBy === 'plays-asc') {
        allGames.sort((a, b) => a.numPlays - b.numPlays);
    } else if (sortBy === 'plays-desc') {
        allGames.sort((a, b) => b.numPlays - a.numPlays);
    } else if (sortBy === 'year-asc') {
        allGames.sort((a, b) => {
            const yearA = a.yearPublished === 'N/A' ? 9999 : parseInt(a.yearPublished);
            const yearB = b.yearPublished === 'N/A' ? 9999 : parseInt(b.yearPublished);
            return yearA - yearB;
        });
    } else if (sortBy === 'year-desc') {
        allGames.sort((a, b) => {
            const yearA = a.yearPublished === 'N/A' ? 0 : parseInt(a.yearPublished);
            const yearB = b.yearPublished === 'N/A' ? 0 : parseInt(b.yearPublished);
            return yearB - yearA;
        });
    }

    renderGames();
}

function renderGames() {
    const gamesGridEl = document.getElementById('games-grid');
    gamesGridEl.innerHTML = '';
    gamesGridEl.className = `games-grid view-${currentViewMode}`;

    let filteredGames = applyAllFilters(allGames);

    // Update all stats based on filtered games
    updateStatsForGames(filteredGames);

    filteredGames.forEach(game => {
        const gameCard = createGameCard(game);
        gamesGridEl.appendChild(gameCard);
    });
}

function applyAllFilters(games) {
    return games.filter(game => {
        // Search filter
        if (filters.search && !game.name.toLowerCase().includes(filters.search.toLowerCase())) {
            return false;
        }

        // Player count filter
        if (filters.playerCount !== 'all') {
            const min = parseInt(game.minPlayers);
            const max = parseInt(game.maxPlayers);

            if (filters.playerCount === '2-only') {
                // 2 Player Only: games designed specifically for 2 players
                if (min !== 2 || max !== 2) return false;
            } else {
                const count = parseInt(filters.playerCount);
                if (count === 5) {
                    if (max < 5) return false;
                } else {
                    if (min > count || max < count) return false;
                }
            }
        }

        // Play time filter
        if (filters.playTime !== 'all') {
            const time = parseInt(game.playingTime);
            const [minTime, maxTime] = filters.playTime.split('-').map(t => parseInt(t));

            if (maxTime) {
                if (time < minTime || time > maxTime) return false;
            } else {
                if (time < minTime) return false;
            }
        }

        // Rating filter
        if (filters.rating !== 'all') {
            const minRating = parseFloat(filters.rating);
            if (game.rating < minRating) return false;
        }

        // Unplayed filter
        if (filters.unplayedOnly && game.numPlays > 0) {
            return false;
        }

        return true;
    });
}

function updateStats() {
    updateStatsForGames(allGames);
}

function updateStatsForGames(games) {
    const totalGames = games.length;
    const totalPlays = games.reduce((sum, game) => sum + game.numPlays, 0);
    const validRatings = games.filter(g => g.rating > 0);
    const avgRating = validRatings.length > 0
        ? (validRatings.reduce((sum, game) => sum + game.rating, 0) / validRatings.length).toFixed(2)
        : '0.00';
    const unplayedGames = games.filter(g => g.numPlays === 0).length;

    document.getElementById('total-games').textContent = totalGames;
    document.getElementById('total-plays').textContent = totalPlays;
    document.getElementById('avg-rating').textContent = avgRating;
    document.getElementById('unplayed-games').textContent = unplayedGames;
}

window.applyFilters = function() {
    filters.search = document.getElementById('search-input').value;
    filters.playerCount = document.getElementById('player-count').value;
    filters.playTime = document.getElementById('play-time').value;
    filters.rating = document.getElementById('rating-filter').value;
    filters.unplayedOnly = document.getElementById('unplayed-only').checked;

    renderGames();
}

window.changeViewMode = function(mode) {
    currentViewMode = mode;
    renderGames();
}

window.toggleDarkMode = function(enabled) {
    if (enabled) {
        document.body.classList.add('dark-mode');
        localStorage.setItem('darkMode', 'enabled');
    } else {
        document.body.classList.remove('dark-mode');
        localStorage.setItem('darkMode', 'disabled');
    }
}

function loadDarkModePreference() {
    const darkMode = localStorage.getItem('darkMode');
    if (darkMode === 'enabled') {
        document.body.classList.add('dark-mode');
        document.getElementById('dark-mode').checked = true;
    }
}

// Random Game Picker
let currentRandomGame = null;

window.pickRandomGame = function() {
    const filteredGames = applyAllFilters(allGames);

    if (filteredGames.length === 0) {
        alert('No games match your current filters!');
        return;
    }

    const randomIndex = Math.floor(Math.random() * filteredGames.length);
    currentRandomGame = filteredGames[randomIndex];

    displayRandomGame(currentRandomGame);

    const modal = document.getElementById('random-modal');
    modal.style.display = 'flex';
}

function displayRandomGame(game) {
    document.getElementById('random-game-img').src = game.thumbnail || 'https://via.placeholder.com/300x300?text=No+Image';
    document.getElementById('random-game-name').textContent = game.name;
    document.getElementById('random-game-year').textContent = game.yearPublished !== 'N/A' ? `(${game.yearPublished})` : '';

    const metaEl = document.getElementById('random-game-meta');
    metaEl.innerHTML = `
        <div class="meta-item"><span>👥</span> ${game.minPlayers}-${game.maxPlayers} players</div>
        <div class="meta-item"><span>⏱️</span> ${game.playingTime} min</div>
        <div class="meta-item"><span>⭐</span> ${game.rating.toFixed(2)}</div>
        <div class="meta-item"><span>💚</span> ${game.myRating.toFixed(2)}</div>
        <div class="meta-item"><span>🎲</span> ${game.numPlays} plays</div>
    `;
}

window.closeRandomModal = function() {
    document.getElementById('random-modal').style.display = 'none';
}

window.openRandomGameBGG = function() {
    if (currentRandomGame) {
        window.open(`https://boardgamegeek.com/boardgame/${currentRandomGame.objectId}`, '_blank');
    }
}

// Setup random game button
document.addEventListener('DOMContentLoaded', () => {
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
});

fetchCollection();
