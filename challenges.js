let allGames = [];

async function fetchChallenges() {
    const loadingEl = document.getElementById('loading');
    const errorEl = document.getElementById('error');

    try {
        allGames = await getCollection();
        renderChallenges();
        loadingEl.style.display = 'none';
    } catch (error) {
        console.error('Error fetching challenges:', error);
        loadingEl.style.display = 'none';
        errorEl.style.display = 'block';
        errorEl.textContent = `Failed to load challenges: ${error.message}`;
    }
}

function renderChallenges() {
    renderUnplayedChallenge();
    renderClubChallenges();
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
    document.getElementById('unplayed-progress-text').textContent = `${percentage}% Played`;

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

function renderClubChallenges() {
    const totalGames = allGames.length;
    const dimeGames = allGames.filter(g => g.numPlays >= 10).length;
    const nickelGames = allGames.filter(g => g.numPlays >= 5).length;

    const dimePercent = totalGames > 0 ? Math.round((dimeGames / totalGames) * 100) : 0;
    const nickelPercent = totalGames > 0 ? Math.round((nickelGames / totalGames) * 100) : 0;

    document.getElementById('dime-count').textContent = dimeGames;
    document.getElementById('dime-progress-bar').style.width = `${dimePercent}%`;
    document.getElementById('dime-progress-text').textContent = `${dimePercent}%`;

    document.getElementById('nickel-count').textContent = nickelGames;
    document.getElementById('nickel-progress-bar').style.width = `${nickelPercent}%`;
    document.getElementById('nickel-progress-text').textContent = `${nickelPercent}%`;
}

function renderPersonalBests() {
    if (allGames.length === 0) return;

    // Most played
    const mostPlayed = [...allGames].sort((a, b) => b.numPlays - a.numPlays)[0];
    document.getElementById('most-played-game').textContent = mostPlayed.name;
    document.getElementById('most-played-count').textContent = `${mostPlayed.numPlays} plays`;

    // Highest rated (by user)
    const ratedGames = allGames.filter(g => g.myRating > 0);
    const highestRated = ratedGames.length > 0 
        ? ratedGames.sort((a, b) => b.myRating - a.myRating)[0]
        : {name: 'None rated yet', myRating: 0};
    
    document.getElementById('highest-rated-game').textContent = highestRated.name;
    document.getElementById('highest-rated-value').textContent = highestRated.myRating > 0 ? highestRated.myRating.toFixed(1) : 'N/A';

    // Oldest/Newest
    const datedGames = allGames.filter(g => g.yearPublished !== 'N/A' && !isNaN(parseInt(g.yearPublished)));
    if (datedGames.length > 0) {
        const sortedByYear = [...datedGames].sort((a, b) => parseInt(a.yearPublished) - parseInt(b.yearPublished));
        
        const oldest = sortedByYear[0];
        const newest = sortedByYear[sortedByYear.length - 1];

        document.getElementById('oldest-game').textContent = oldest.name;
        document.getElementById('oldest-year').textContent = oldest.yearPublished;
        document.getElementById('newest-game').textContent = newest.name;
        document.getElementById('newest-year').textContent = newest.yearPublished;
    }
}

document.addEventListener('DOMContentLoaded', fetchChallenges);
