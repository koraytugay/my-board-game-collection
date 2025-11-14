const COLLECTION_XML_FILE = 'https://raw.githubusercontent.com/koraytugay/my-board-game-collection/refs/heads/main/collection.xml';

let allGames = [];

async function fetchCollection() {
    const loadingEl = document.getElementById('loading');
    const errorEl = document.getElementById('error');
    const statsContentEl = document.getElementById('stats-content');

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

        calculateStatistics();
        renderMostPlayed();

        loadingEl.style.display = 'none';
        statsContentEl.style.display = 'block';

    } catch (error) {
        console.error('Error fetching collection:', error);
        loadingEl.style.display = 'none';
        errorEl.style.display = 'block';
        errorEl.textContent = `Failed to load collection: ${error.message}`;
    }
}

function calculateStatistics() {
    // Basic stats
    const totalGames = allGames.length;
    const totalPlays = allGames.reduce((sum, game) => sum + game.numPlays, 0);

    const validRatings = allGames.filter(g => g.rating > 0);
    const avgRating = validRatings.length > 0
        ? validRatings.reduce((sum, game) => sum + game.rating, 0) / validRatings.length
        : 0;

    const validMyRatings = allGames.filter(g => g.myRating > 0);
    const avgMyRating = validMyRatings.length > 0
        ? validMyRatings.reduce((sum, game) => sum + game.myRating, 0) / validMyRatings.length
        : 0;

    const validPlayTimes = allGames.filter(g => g.playingTime > 0);
    const avgPlayTime = validPlayTimes.length > 0
        ? Math.round(validPlayTimes.reduce((sum, game) => sum + game.playingTime, 0) / validPlayTimes.length)
        : 0;

    const mostPlayed = allGames.reduce((max, game) =>
        game.numPlays > max.numPlays ? game : max
    , allGames[0]);

    // Additional insights
    const soloGames = allGames.filter(g => g.minPlayers === '1').length;
    const unplayedGames = allGames.filter(g => g.numPlays === 0).length;
    const highRatedGames = allGames.filter(g => g.rating >= 7.5).length;
    const recentGames = allGames.filter(g => {
        const year = parseInt(g.yearPublished);
        return !isNaN(year) && year >= 2020;
    }).length;

    // Update DOM
    document.getElementById('total-games').textContent = totalGames;
    document.getElementById('total-plays').textContent = totalPlays;
    document.getElementById('avg-rating').textContent = avgRating.toFixed(2);
    document.getElementById('avg-my-rating').textContent = avgMyRating > 0 ? avgMyRating.toFixed(2) : 'N/A';
    document.getElementById('avg-playtime').textContent = avgPlayTime;
    document.getElementById('most-played-name').textContent = mostPlayed.name;

    document.getElementById('solo-games-count').textContent = soloGames;
    document.getElementById('unplayed-count').textContent = unplayedGames;
    document.getElementById('high-rated-count').textContent = highRatedGames;
    document.getElementById('recent-games-count').textContent = recentGames;
}

function renderMostPlayed() {
    const container = document.getElementById('most-played-list');

    // Get top 10 most played games
    const topGames = [...allGames]
        .sort((a, b) => b.numPlays - a.numPlays)
        .slice(0, 10)
        .filter(g => g.numPlays > 0);

    if (topGames.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: #999; padding: 40px;">No play data available</p>';
        return;
    }

    container.innerHTML = topGames.map((game, index) => `
        <div class="most-played-item" onclick="window.open('https://boardgamegeek.com/boardgame/${game.objectId}', '_blank')">
            <div class="most-played-rank">#${index + 1}</div>
            <img src="${game.thumbnail}" alt="${game.name}" class="most-played-img">
            <div class="most-played-info">
                <h3>${game.name}</h3>
                <p>${game.yearPublished !== 'N/A' ? `(${game.yearPublished})` : ''}</p>
            </div>
            <div class="most-played-plays">
                <span class="plays-number">${game.numPlays}</span>
                <span class="plays-label">plays</span>
            </div>
        </div>
    `).join('');
}

fetchCollection();
