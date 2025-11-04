const USERNAME = 'koraytugay';
const CORS_PROXY = 'https://corsproxy.io/?';
const COLLECTION_XML_FILE = 'collection.xml';

let allGames = [];
let currentSort = 'name';
let soloModeFilter = false;

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

    let filteredGames = allGames;

    if (soloModeFilter) {
        filteredGames = filteredGames.filter(game => game.minPlayers === '1');
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

fetchCollection();
