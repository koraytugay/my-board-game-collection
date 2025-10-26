const USERNAME = 'koraytugay';
const CORS_PROXY = 'https://corsproxy.io/?';
const BGG_API_URL = `${CORS_PROXY}https://boardgamegeek.com/xmlapi2/collection?username=${USERNAME}&own=1&stats=1`;

let allGames = [];
let currentSort = 'name';
let soloModeFilter = false;
let bestAtFilter = 'all';

async function fetchCollection() {
    const loadingEl = document.getElementById('loading');
    const errorEl = document.getElementById('error');
    const statsEl = document.getElementById('stats');
    const gamesGridEl = document.getElementById('games-grid');

    try {
        const response = await fetch(BGG_API_URL);

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

            return {
                name,
                yearPublished,
                thumbnail: image || thumbnail,
                minPlayers,
                maxPlayers,
                playingTime,
                numPlays: parseInt(numPlays),
                objectId,
                complexity: 0,
                rating: 0,
                bestAt: []
            };
        });

        allGames = games;
        sortGames('name');

        fetchComplexityRatings();

        loadingEl.style.display = 'none';
        statsEl.style.display = 'flex';
        document.getElementById('controls').style.display = 'flex';
        document.getElementById('total-games').textContent = games.length;

        renderGames();

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

    const complexity = document.createElement('div');
    complexity.className = 'meta-item';
    complexity.innerHTML = `<span>🧩</span> ${game.complexity.toFixed(2)}`;

    const rating = document.createElement('div');
    rating.className = 'meta-item';
    rating.innerHTML = `<span>⭐</span> ${game.rating.toFixed(2)}`;

    const plays = document.createElement('div');
    plays.className = 'meta-item';
    plays.innerHTML = `<span>🎲</span> ${game.numPlays} plays`;

    meta.appendChild(players);
    meta.appendChild(time);
    meta.appendChild(complexity);
    meta.appendChild(rating);
    meta.appendChild(plays);

    info.appendChild(name);
    info.appendChild(year);
    info.appendChild(meta);

    card.appendChild(img);
    card.appendChild(info);

    return card;
}

window.sortGames = function(sortBy) {
    currentSort = sortBy;

    if (sortBy === 'name') {
        allGames.sort((a, b) => a.name.localeCompare(b.name));
    } else if (sortBy === 'complexity-asc') {
        allGames.sort((a, b) => a.complexity - b.complexity);
    } else if (sortBy === 'complexity-desc') {
        allGames.sort((a, b) => b.complexity - a.complexity);
    } else if (sortBy === 'rating-asc') {
        allGames.sort((a, b) => a.rating - b.rating);
    } else if (sortBy === 'rating-desc') {
        allGames.sort((a, b) => b.rating - a.rating);
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

    let filteredGames = allGames;

    if (soloModeFilter) {
        filteredGames = filteredGames.filter(game => game.minPlayers === '1');
    }

    if (bestAtFilter !== 'all') {
        const playerCount = parseInt(bestAtFilter);
        filteredGames = filteredGames.filter(game => game.bestAt.includes(playerCount));
    }

    document.getElementById('total-games').textContent = filteredGames.length;

    filteredGames.forEach(game => {
        const gameCard = createGameCard(game);
        gamesGridEl.appendChild(gameCard);
    });
}

window.toggleSoloMode = function(checked) {
    soloModeFilter = checked;
    renderGames();
}

window.filterBestAt = function(value) {
    bestAtFilter = value;
    renderGames();
}

async function fetchComplexityRatings() {
    const batchSize = 20;
    const batches = [];

    for (let i = 0; i < allGames.length; i += batchSize) {
        batches.push(allGames.slice(i, i + batchSize));
    }

    for (const batch of batches) {
        const gameIds = batch.map(g => g.objectId).join(',');

        try {
            const response = await fetch(`${CORS_PROXY}https://boardgamegeek.com/xmlapi2/thing?id=${gameIds}&stats=1`);
            const xmlText = await response.text();
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(xmlText, 'text/xml');

            const items = xmlDoc.querySelectorAll('item');

            items.forEach(item => {
                const objectId = item.getAttribute('id');
                const averageweight = item.querySelector('statistics ratings averageweight')?.getAttribute('value') || '0';
                const complexity = parseFloat(averageweight);
                const average = item.querySelector('statistics ratings average')?.getAttribute('value') || '0';
                const rating = parseFloat(average);

                const bestAt = [];
                const poll = item.querySelector('poll[name="suggested_numplayers"]');
                if (poll) {
                    const results = poll.querySelectorAll('results');
                    results.forEach(result => {
                        const numPlayers = result.getAttribute('numplayers');
                        const bestVotes = parseInt(result.querySelector('result[value="Best"]')?.getAttribute('numvotes') || '0');
                        const recommendedVotes = parseInt(result.querySelector('result[value="Recommended"]')?.getAttribute('numvotes') || '0');
                        const notRecommendedVotes = parseInt(result.querySelector('result[value="Not Recommended"]')?.getAttribute('numvotes') || '0');
                        const totalVotes = bestVotes + recommendedVotes + notRecommendedVotes;

                        if (totalVotes > 0 && bestVotes > recommendedVotes && bestVotes > notRecommendedVotes) {
                            bestAt.push(parseInt(numPlayers));
                        }
                    });
                }

                const game = allGames.find(g => g.objectId === objectId);
                if (game) {
                    game.complexity = complexity;
                    game.rating = rating;
                    game.bestAt = bestAt;
                }
            });

            renderGames();

            await new Promise(resolve => setTimeout(resolve, 100));
        } catch (error) {
            console.error('Error fetching complexity ratings batch:', error);
        }
    }
}

fetchCollection();
