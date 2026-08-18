let allGames = [];

async function fetchChallenges() {
    const loadingEl = document.getElementById('loading');
    const contentEl = document.getElementById('challenges-content');
    const errorEl = document.getElementById('error');

    try {
        allGames = await getCollection(true);
        renderChallenges();
        loadingEl.style.display = 'none';
        contentEl.style.display = 'block';
    } catch (error) {
        console.error('Error fetching challenges:', error);
        loadingEl.style.display = 'none';
        errorEl.style.display = 'block';
        errorEl.textContent = `Failed to load challenges: ${error.message}`;
    }
}

function escapeHtml(str) {
    if (!str) return '';
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
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
    const unplayedPercent = totalGames > 0 ? Math.round((unplayedGames.length / totalGames) * 100) : 0;

    const countBadge = document.getElementById('unplayed-count-badge');
    if (countBadge) {
        countBadge.textContent = `${unplayedGames.length} ${unplayedGames.length === 1 ? 'game' : 'games'}`;
    }

    document.getElementById('unplayed-remaining').textContent = unplayedGames.length;
    document.getElementById('unplayed-percentage').textContent = `${unplayedPercent}%`;
    document.getElementById('played-count').textContent = playedGames;
    
    document.getElementById('unplayed-progress-bar').style.width = `${percentage}%`;
    document.getElementById('unplayed-progress-text').textContent = `${percentage}% Played (${playedGames}/${totalGames})`;

    const container = document.getElementById('unplayed-games');

    if (unplayedGames.length === 0) {
        container.innerHTML = '<p class="empty-state">Congratulations! You have played all your owned games.</p>';
        return;
    }

    // Sort unplayed alphabetically
    unplayedGames.sort((a, b) => a.name.localeCompare(b.name));

    container.innerHTML = unplayedGames.map(game => {
        const safeName = escapeHtml(game.name);
        const imageUrl = game.image || game.thumbnail || 'https://via.placeholder.com/150x150?text=?';
        const year = game.yearPublished !== 'N/A' ? game.yearPublished : '';

        return `
            <div class="unplayed-game-chip" onclick="typeof showGameDetails === 'function' ? showGameDetails('${game.objectId}') : window.open('https://boardgamegeek.com/boardgame/${game.objectId}', '_blank')" title="${safeName} ${year ? `(${year})` : ''}">
                <img src="${imageUrl}" alt="${safeName}" class="unplayed-game-img" loading="lazy">
            </div>
        `;
    }).join('');
}

function renderClubChallenges() {
    const totalGames = allGames.length;
    const dimeGames = allGames.filter(g => g.numPlays >= 10).length;
    const nickelGames = allGames.filter(g => g.numPlays >= 5).length;

    const dimePercent = totalGames > 0 ? Math.round((dimeGames / totalGames) * 100) : 0;
    const nickelPercent = totalGames > 0 ? Math.round((nickelGames / totalGames) * 100) : 0;

    document.getElementById('dime-count').textContent = dimeGames;
    document.getElementById('dime-progress-bar').style.width = `${dimePercent}%`;
    document.getElementById('dime-progress-text').textContent = `${dimePercent}% of collection (${dimeGames} / ${totalGames})`;

    document.getElementById('nickel-count').textContent = nickelGames;
    document.getElementById('nickel-progress-bar').style.width = `${nickelPercent}%`;
    document.getElementById('nickel-progress-text').textContent = `${nickelPercent}% of collection (${nickelGames} / ${totalGames})`;
}

function renderPersonalBests() {
    if (allGames.length === 0) return;

    // Most played
    const mostPlayed = [...allGames].sort((a, b) => b.numPlays - a.numPlays)[0];
    if (mostPlayed) {
        document.getElementById('most-played-game').textContent = mostPlayed.name;
        document.getElementById('most-played-count').textContent = `${mostPlayed.numPlays} plays`;
    }

    // Highest rated (by user)
    const ratedGames = allGames.filter(g => g.myRating > 0);
    const highestRated = ratedGames.length > 0 
        ? ratedGames.sort((a, b) => b.myRating - a.myRating || a.name.localeCompare(b.name))[0]
        : {name: 'None rated yet', myRating: 0};
    
    document.getElementById('highest-rated-game').textContent = highestRated.name;
    document.getElementById('highest-rated-value').textContent = highestRated.myRating > 0 ? `${highestRated.myRating.toFixed(1)} ★` : 'N/A';

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

function loadDarkModePreference() {
    const isDark = localStorage.getItem('darkMode') === 'true';
    if (isDark) {
        document.body.classList.add('dark-mode');
    }
}

document.addEventListener('DOMContentLoaded', () => {
    loadDarkModePreference();
    fetchChallenges();
});
