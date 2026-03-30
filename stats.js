let allGames = [];

async function fetchStats() {
    const loadingEl = document.getElementById('loading');
    const errorEl = document.getElementById('error');
    const contentEl = document.getElementById('stats-content');

    try {
        allGames = await getCollection();
        updateOverviewStats();
        renderMostPlayed();
        renderMilestones();
        renderRatingChart();
        updateInsights();

        loadingEl.style.display = 'none';
        contentEl.style.display = 'block';

    } catch (error) {
        console.error('Error fetching stats:', error);
        loadingEl.style.display = 'none';
        errorEl.style.display = 'block';
        errorEl.textContent = `Failed to load statistics: ${error.message}`;
    }
}

function updateOverviewStats() {
    const totalGames = allGames.length;
    const totalPlays = allGames.reduce((sum, game) => sum + game.numPlays, 0);
    
    const ratedGames = allGames.filter(game => game.rating > 0);
    const avgRating = ratedGames.length > 0 
        ? ratedGames.reduce((sum, game) => sum + game.rating, 0) / ratedGames.length 
        : 0;

    const myRatedGames = allGames.filter(game => game.myRating > 0);
    const avgMyRating = myRatedGames.length > 0
        ? myRatedGames.reduce((sum, game) => sum + game.myRating, 0) / myRatedGames.length
        : 0;

    const avgPlayTime = Math.round(allGames.reduce((sum, game) => sum + game.playingTime, 0) / totalGames);
    const mostPlayed = [...allGames].sort((a, b) => b.numPlays - a.numPlays)[0];

    document.getElementById('total-games').textContent = totalGames;
    document.getElementById('total-plays').textContent = totalPlays;
    document.getElementById('avg-rating').textContent = avgRating.toFixed(1);
    document.getElementById('avg-my-rating').textContent = avgMyRating > 0 ? avgMyRating.toFixed(1) : 'N/A';
    document.getElementById('avg-playtime').textContent = avgPlayTime;
    document.getElementById('most-played-name').textContent = mostPlayed ? mostPlayed.name : '-';
}

function renderMostPlayed() {
    const container = document.getElementById('most-played-list');
    const topGames = [...allGames]
        .sort((a, b) => b.numPlays - a.numPlays)
        .slice(0, 10)
        .filter(g => g.numPlays > 0);

    if (topGames.length === 0) {
        container.innerHTML = '<p class="empty-state">No play data available</p>';
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

function renderMilestones() {
    const hIndex = calculateHIndex(allGames);
    const dimeCount = allGames.filter(g => g.numPlays >= 10).length;
    const nickelCount = allGames.filter(g => g.numPlays >= 5).length;

    document.getElementById('h-index-val').textContent = hIndex;
    document.getElementById('dime-club-count').textContent = dimeCount;
    document.getElementById('nickel-club-count').textContent = nickelCount;
}

function renderRatingChart() {
    const container = document.getElementById('rating-chart');
    
    // Initialize distribution for 10 down to 1
    const distribution = {};
    for (let i = 10; i >= 1; i--) {
        distribution[i] = 0;
    }

    allGames.forEach(game => {
        const r = Math.floor(game.myRating);
        if (r >= 1 && r <= 10) {
            distribution[r]++;
        }
    });

    const maxCount = Math.max(...Object.values(distribution));
    
    container.innerHTML = Object.entries(distribution)
        .sort((a, b) => b[0] - a[0]) // Ensure 10 to 1 order
        .map(([label, count]) => {
            const percentage = maxCount > 0 ? (count / maxCount) * 100 : 0;
            return `
                <div class="chart-row">
                    <div class="chart-label">${label}</div>
                    <div class="chart-bar-container">
                        <div class="chart-bar" style="width: ${percentage}%"></div>
                        <span class="chart-count">${count}</span>
                    </div>
                </div>
            `;
        }).join('');
}

function updateInsights() {
    const soloGames = allGames.filter(g => g.minPlayers <= 1).length;
    const unplayedGames = allGames.filter(g => g.numPlays === 0).length;
    const highRatedGames = allGames.filter(g => g.rating >= 7.5).length;
    const recentGames = allGames.filter(g => {
        const year = parseInt(g.yearPublished);
        return !isNaN(year) && year >= 2020;
    }).length;

    document.getElementById('solo-games-count').textContent = soloGames;
    document.getElementById('unplayed-count').textContent = unplayedGames;
    document.getElementById('high-rated-count').textContent = highRatedGames;
    document.getElementById('recent-games-count').textContent = recentGames;
}

document.addEventListener('DOMContentLoaded', fetchStats);
