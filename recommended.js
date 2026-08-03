// recommended.js - Handling Recommended Games UI

let allGames = [];
let filteredGames = [];
let currentSort = 'match-desc';
let currentViewMode = 'grid';

document.addEventListener('DOMContentLoaded', () => {
    fetchRecommendations();
});

async function fetchRecommendations() {
    const loadingEl = document.getElementById('loading');
    const errorEl = document.getElementById('error');
    const statsEl = document.getElementById('stats');
    const controlsEl = document.getElementById('controls');

    try {
        const response = await fetch('recommendations.json');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        allGames = data.recommendations || [];
        filteredGames = [...allGames];

        updateStats();
        sortGames(currentSort);

        loadingEl.style.display = 'none';
        statsEl.style.display = 'flex';
        controlsEl.style.display = 'block';

        loadDarkModePreference();

    } catch (error) {
        console.error('Error fetching recommendations:', error);
        loadingEl.style.display = 'none';
        errorEl.style.display = 'block';
        errorEl.textContent = `Failed to load recommendations: ${error.message}`;
    }
}

function updateStats() {
    const totalRecs = allGames.length;
    const avgRating = totalRecs > 0
        ? allGames.reduce((sum, game) => sum + game.bggRating, 0) / totalRecs
        : 0;

    const sourceSet = new Set();
    allGames.forEach(r => r.recommendedBy.forEach(s => sourceSet.add(s.ownedId)));

    document.getElementById('total-recs').textContent = totalRecs;
    document.getElementById('total-sources').textContent = sourceSet.size;
    document.getElementById('avg-bgg-rating').textContent = avgRating.toFixed(1);
}

function sortGames(criteria) {
    currentSort = criteria;

    allGames.sort((a, b) => {
        switch (criteria) {
            case 'match-desc':
                return b.matchScore - a.matchScore;
            case 'name':
                return a.name.localeCompare(b.name);
            case 'rating-desc':
                return b.bggRating - a.bggRating;
            case 'rating-asc':
                return a.bggRating - b.bggRating;
            case 'rank-asc':
                return (a.bggRank || 999999) - (b.bggRank || 999999);
            case 'year-desc':
                return (parseInt(b.yearPublished) || 0) - (parseInt(a.yearPublished) || 0);
            case 'year-asc':
                return (parseInt(a.yearPublished) || 0) - (parseInt(b.yearPublished) || 0);
            default:
                return b.matchScore - a.matchScore;
        }
    });

    applyFilters();
}

function applyFilters() {
    const searchTerm = document.getElementById('search-input').value.toLowerCase();
    const ratingFilter = document.getElementById('rating-filter').value;

    filteredGames = allGames.filter(game => {
        const matchesName = game.name.toLowerCase().includes(searchTerm);
        const matchesSource = game.recommendedBy.some(s => s.ownedName.toLowerCase().includes(searchTerm));
        const matchesSearch = matchesName || matchesSource;

        let matchesRating = true;
        if (ratingFilter !== 'all') {
            const minRating = parseFloat(ratingFilter.replace('+', ''));
            matchesRating = game.bggRating >= minRating;
        }

        return matchesSearch && matchesRating;
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
        gamesGridEl.innerHTML = '<div class="no-results" style="grid-column: 1/-1; text-align: center; color: #666; padding: 40px;">No recommendations match your filters</div>';
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
    badgesHtml += `<span class="badge badge-favorite">🔥 Match ${game.matchScore}</span>`;
    if (game.bggRank) {
        badgesHtml += `<span class="badge badge-highly-rated">#${game.bggRank} BGG</span>`;
    }

    const sourcesHtml = game.recommendedBy.slice(0, 4).map(s => `
        <span style="display: inline-flex; align-items: center; gap: 4px; background: rgba(99, 102, 241, 0.12); color: #4f46e5; padding: 2px 7px; border-radius: 6px; font-size: 0.78rem; font-weight: 600;">
            ${escapeHtml(s.ownedName)}
            <span style="background: #4f46e5; color: white; padding: 1px 4px; border-radius: 3px; font-size: 0.7rem; font-weight: 700;">★${s.userRating}</span>
        </span>
    `).join('');

    const extraCount = game.recommendedBy.length > 4 ? game.recommendedBy.length - 4 : 0;
    const extraChip = extraCount > 0 ? `<span style="font-size: 0.75rem; color: #777; margin-left: 2px;">+${extraCount} more</span>` : '';

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
                <div class="meta-item"><span>🏆</span> Rank #${game.bggRank || 'N/A'}</div>
                <div class="meta-item"><span>⭐</span> ${game.bggRating.toFixed(1)}</div>
            </div>
            <div style="margin-top: 12px; padding-top: 10px; border-top: 1px solid rgba(0,0,0,0.08);">
                <div style="font-size: 0.78rem; font-weight: 700; color: #666; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.5px;">Based on games you love:</div>
                <div style="display: flex; flex-wrap: wrap; gap: 4px; align-items: center;">
                    ${sourcesHtml}
                    ${extraChip}
                </div>
            </div>
        </div>
    `;
    return card;
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
    const dmCheckbox = document.getElementById('dark-mode');
    if (dmCheckbox) dmCheckbox.checked = isDark;
    if (isDark) {
        document.body.classList.add('dark-mode');
    }
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;')
              .replace(/</g, '&lt;')
              .replace(/>/g, '&gt;')
              .replace(/"/g, '&quot;')
              .replace(/'/g, '&#039;');
}
