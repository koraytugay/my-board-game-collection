const COLLECTION_XML_FILE = 'https://raw.githubusercontent.com/koraytugay/my-board-game-collection/refs/heads/main/collection.xml';

let allGames = [];

async function fetchCollection() {
    const loadingEl = document.getElementById('loading');
    const errorEl = document.getElementById('error');

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
                playingTime: parseInt(playingTime) || 0,
                numPlays: parseInt(numPlays),
                objectId,
                rating,
                myRating
            };
        });

        allGames = games;
        renderChallenges();

        loadingEl.style.display = 'none';

    } catch (error) {
        console.error('Error fetching collection:', error);
        loadingEl.style.display = 'none';
        errorEl.style.display = 'block';
        errorEl.textContent = `Failed to load collection: ${error.message}`;
    }
}

function renderChallenges() {
    renderUnplayedChallenge();
    renderPersonalBests();
}

function renderUnplayedChallenge() {
    const unplayedGames = allGames.filter(g => g.numPlays === 0);
    const totalGames = allGames.length;
    const playedGames = totalGames - unplayedGames.length;
    const percentage = totalGames > 0 ? Math.round((playedGames / totalGames) * 100) : 100;

    document.getElementById('unplayed-remaining').textContent = unplayedGames.length;
    document.getElementById('unplayed-percentage').textContent = `${Math.round((unplayedGames.length / totalGames) * 100)}%`;
    document.getElementById('unplayed-progress-bar').style.width = `${percentage}%`;
    document.getElementById('unplayed-progress-text').textContent = `${percentage}% played`;

    const container = document.getElementById('unplayed-games');

    if (unplayedGames.length === 0) {
        container.innerHTML = '<p class="empty-state">🎉 Congratulations! You\'ve played all your games!</p>';
        return;
    }

    container.innerHTML = unplayedGames.map(game => `
        <div class="unplayed-game-card" onclick="window.open('https://boardgamegeek.com/boardgame/${game.objectId}', '_blank')">
            <img src="${game.thumbnail}" alt="${game.name}">
            <div class="unplayed-game-info">
                <h4>${game.name}</h4>
                <p>${game.yearPublished !== 'N/A' ? game.yearPublished : ''}</p>
            </div>
        </div>
    `).join('');
}

function renderPersonalBests() {
    // Most played
    const mostPlayed = allGames.reduce((max, game) => game.numPlays > max.numPlays ? game : max, allGames[0]);
    document.getElementById('most-played-game').textContent = mostPlayed.name;
    document.getElementById('most-played-count').textContent = `${mostPlayed.numPlays} plays`;

    // Highest rated (by user)
    const highestRated = allGames.filter(g => g.myRating > 0)
        .reduce((max, game) => game.myRating > max.myRating ? game : max, {myRating: 0, name: 'None rated yet'});
    document.getElementById('highest-rated-game').textContent = highestRated.name;
    document.getElementById('highest-rated-value').textContent = highestRated.myRating > 0 ? highestRated.myRating.toFixed(2) : 'N/A';

    // Oldest game
    const oldest = allGames.filter(g => g.yearPublished !== 'N/A')
        .reduce((min, game) => {
            const year = parseInt(game.yearPublished);
            const minYear = parseInt(min.yearPublished);
            return year < minYear ? game : min;
        }, allGames.find(g => g.yearPublished !== 'N/A') || {name: '-', yearPublished: 'N/A'});
    document.getElementById('oldest-game').textContent = oldest.name;
    document.getElementById('oldest-year').textContent = oldest.yearPublished;

    // Newest game
    const newest = allGames.filter(g => g.yearPublished !== 'N/A')
        .reduce((max, game) => {
            const year = parseInt(game.yearPublished);
            const maxYear = parseInt(max.yearPublished);
            return year > maxYear ? game : max;
        }, allGames.find(g => g.yearPublished !== 'N/A') || {name: '-', yearPublished: 'N/A'});
    document.getElementById('newest-game').textContent = newest.name;
    document.getElementById('newest-year').textContent = newest.yearPublished;
}

fetchCollection();
