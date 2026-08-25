let allGames = [];
let filteredGames = [];
let currentSort = 'name';
let currentViewMode = 'grid';

async function fetchCollection() {
    const loadingEl = document.getElementById('loading');
    const errorEl = document.getElementById('error');
    const controlsEl = document.getElementById('controls');

    try {
        const [collection, lastPlayDates, designersRes] = await Promise.all([
            getCollection('thinkingabout'),
            getLastPlayDates(),
            fetch('designers.json').then(res => res.ok ? res.json() : {}).catch(() => ({}))
        ]);
        
        allGames = collection.map(game => ({
            ...game,
            lastPlayed: lastPlayDates[game.objectId] || '',
            designers: designersRes[game.objectId]?.designers || []
        }));
        
        populateDesignerFilter();
        filteredGames = [...allGames];
        sortGames(currentSort);
        
        loadingEl.style.display = 'none';
        controlsEl.style.display = 'block';
        
        loadDarkModePreference();

    } catch (error) {
        console.error('Error fetching collection:', error);
        loadingEl.style.display = 'none';
        errorEl.style.display = 'block';
        errorEl.textContent = `Failed to load Thinking About games: ${error.message}`;
    }
}

function populateDesignerFilter() {
    const designerSelect = document.getElementById('designer-filter');
    if (!designerSelect) return;

    const currentValue = designerSelect.value;
    designerSelect.innerHTML = '<option value="all">All Designers</option>';

    const designerCountMap = new Map();
    allGames.forEach(game => {
        const designers = game.designers || [];
        designers.forEach(d => {
            if (d && d !== '(Uncredited)') {
                const key = d.toLowerCase();
                const existing = designerCountMap.get(key) || { designer: d, count: 0 };
                existing.count++;
                designerCountMap.set(key, existing);
            }
        });
    });

    const designers = Array.from(designerCountMap.values());
    designers.sort((a, b) => {
        if (b.count !== a.count) {
            return b.count - a.count;
        }
        return a.designer.localeCompare(b.designer, undefined, { sensitivity: 'base' });
    });

    designers.forEach(d => {
        const option = document.createElement('option');
        option.value = d.designer;
        option.textContent = `${d.designer} (${d.count})`;
        designerSelect.appendChild(option);
    });

    if (designers.some(d => d.designer.toLowerCase() === currentValue.toLowerCase())) {
        designerSelect.value = currentValue;
    } else {
        designerSelect.value = 'all';
    }
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
                if (!a.lastPlayed && !b.lastPlayed) return a.name.localeCompare(b.name);
                if (!a.lastPlayed) return 1;
                if (!b.lastPlayed) return -1;
                return b.lastPlayed.localeCompare(a.lastPlayed);
            case 'least-recently-played':
                if (!a.lastPlayed && !b.lastPlayed) return a.name.localeCompare(b.name);
                if (!a.lastPlayed) return 1;
                if (!b.lastPlayed) return -1;
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
    const searchVal = document.getElementById('search-input').value.toLowerCase();
    const playersVal = document.getElementById('player-count').value;
    const ratingVal = document.getElementById('rating-filter').value;
    const designerVal = document.getElementById('designer-filter') ? document.getElementById('designer-filter').value : 'all';

    filteredGames = allGames.filter(game => {
        let matchesSearch = true;
        if (searchVal) {
            matchesSearch = game.name.toLowerCase().includes(searchVal);
        }

        let matchesRating = true;
        if (ratingVal !== 'all') {
            const minRating = parseFloat(ratingVal);
            matchesRating = game.rating >= minRating;
        }

        let matchesPlayers = true;
        if (playersVal !== 'all') {
            if (playersVal === '1-only') {
                matchesPlayers = game.minPlayers === 1 && game.maxPlayers === 1;
            } else if (playersVal === '2-only') {
                matchesPlayers = game.minPlayers === 2 && game.maxPlayers === 2;
            } else if (playersVal === '5') {
                matchesPlayers = game.maxPlayers >= 5;
            } else {
                const target = parseInt(playersVal, 10);
                matchesPlayers = game.minPlayers <= target && game.maxPlayers >= target;
            }
        }

        let matchesDesigner = true;
        if (designerVal !== 'all') {
            const designers = game.designers || [];
            matchesDesigner = designers.some(d => d.toLowerCase() === designerVal.toLowerCase());
        }

        return matchesSearch && matchesRating && matchesPlayers && matchesDesigner;
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
        gamesGridEl.innerHTML = '<div class="no-results">No games match your filters</div>';
        updateCounts(0, allGames.length);
        return;
    }

    gamesGridEl.innerHTML = '';
    filteredGames.forEach(game => {
        const card = createGameCard(game);
        gamesGridEl.appendChild(card);
    });

    updateCounts(filteredGames.length, allGames.length);
}

function createGameCard(game) {
    const card = document.createElement('div');
    card.className = 'game-card';
    card.onclick = () => window.showGameDetails && window.showGameDetails(game.objectId);

    let badgesHtml = '<span class="badge badge-favorite">Thinking About It</span>';
    if (game.minPlayers <= 1) badgesHtml += '<span class="badge badge-solo">Solo</span>';
    if (game.rating >= 8) badgesHtml += '<span class="badge badge-highly-rated">Highly Rated</span>';

    const playerString = game.minPlayers === game.maxPlayers 
        ? `${game.minPlayers} players` 
        : `${game.minPlayers}-${game.maxPlayers} players`;

    const playsText = game.numPlays === 1 ? '1 play' : `${game.numPlays} plays`;
    const ratingDisplay = game.rating > 0 ? game.rating.toFixed(1) : 'N/A';
    const myRatingDisplay = game.myRating > 0 ? game.myRating.toFixed(1) : '-';

    card.innerHTML = `
        <div class="game-badges">
            ${badgesHtml}
        </div>
        <div class="game-image-container">
            <img src="${game.thumbnail || game.image}" alt="${escapeHtml(game.name)}" class="game-image" loading="lazy">
        </div>
        <div class="game-info">
            <h3 class="game-title">${escapeHtml(game.name)}</h3>
            <div class="game-meta">
                <span>${game.yearPublished !== 'N/A' ? game.yearPublished : ''}</span>
                <span>•</span>
                <span>${playerString}</span>
                <span>•</span>
                <span>${game.playingTime}m</span>
            </div>
            <div class="game-stats">
                <div class="stat">
                    <span class="stat-label">BGG</span>
                    <span class="stat-value rating">${ratingDisplay}</span>
                </div>
                <div class="stat">
                    <span class="stat-label">My Rating</span>
                    <span class="stat-value my-rating">${myRatingDisplay}</span>
                </div>
                <div class="stat">
                    <span class="stat-label">Plays</span>
                    <span class="stat-value">${playsText}</span>
                </div>
            </div>
            ${game.wishlistComment ? `<div class="game-comment" style="font-size: 0.8rem; color: #666; margin-top: 6px; font-style: italic;">"${escapeHtml(game.wishlistComment)}"</div>` : ''}
        </div>
    `;

    return card;
}

function updateCounts(displayed, total) {
    const displayedCountEl = document.getElementById('displayed-count');
    const totalCountEl = document.getElementById('total-count');
    if (displayedCountEl) displayedCountEl.textContent = displayed;
    if (totalCountEl) totalCountEl.textContent = total;
}

function escapeHtml(text) {
    if (!text) return '';
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function changeViewMode(mode) {
    currentViewMode = mode;
    localStorage.setItem('preferred-view-mode', mode);
    renderGames();
}

function toggleDarkMode(isDark) {
    document.body.classList.toggle('dark-mode', isDark);
    localStorage.setItem('dark-mode', isDark ? 'enabled' : 'disabled');
}

function loadDarkModePreference() {
    const isDark = localStorage.getItem('dark-mode') === 'enabled';
    const dmCheckbox = document.getElementById('dark-mode');
    if (dmCheckbox) dmCheckbox.checked = isDark;
    if (isDark) document.body.classList.add('dark-mode');

    const savedView = localStorage.getItem('preferred-view-mode');
    if (savedView) {
        currentViewMode = savedView;
        const vmSelect = document.getElementById('view-mode');
        if (vmSelect) vmSelect.value = savedView;
    }
}

document.addEventListener('DOMContentLoaded', fetchCollection);
