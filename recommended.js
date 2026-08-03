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

        populateSourceGameFilter();
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

function populateSourceGameFilter() {
    const filterSelect = document.getElementById('source-game-filter');
    if (!filterSelect) return;

    const sourceMap = new Map(); // ownedId -> ownedName
    allGames.forEach(rec => {
        if (Array.isArray(rec.recommendedBy)) {
            rec.recommendedBy.forEach(s => {
                sourceMap.set(String(s.ownedId), s.ownedName);
            });
        }
    });

    const sortedSources = Array.from(sourceMap.entries()).sort((a, b) => a[1].localeCompare(b[1]));

    filterSelect.innerHTML = '<option value="all">All Games</option>';
    sortedSources.forEach(([id, name]) => {
        const option = document.createElement('option');
        option.value = id;
        option.textContent = name;
        filterSelect.appendChild(option);
    });
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
    currentSort = criteria || currentSort;

    allGames.sort((a, b) => {
        switch (currentSort) {
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
    const searchInput = document.getElementById('search-input');
    const ratingFilter = document.getElementById('rating-filter');
    const sourceGameFilter = document.getElementById('source-game-filter');

    const searchTerm = searchInput ? searchInput.value.toLowerCase().trim() : '';
    const ratingVal = ratingFilter ? ratingFilter.value : 'all';
    const sourceGameVal = sourceGameFilter ? sourceGameFilter.value : 'all';

    filteredGames = allGames.filter(game => {
        const matchesName = game.name.toLowerCase().includes(searchTerm);
        const matchesSource = Array.isArray(game.recommendedBy) && game.recommendedBy.some(s => s.ownedName.toLowerCase().includes(searchTerm));
        const matchesSearch = !searchTerm || matchesName || matchesSource;

        let matchesRating = true;
        if (ratingVal !== 'all') {
            const minRating = parseFloat(ratingVal.replace('+', ''));
            matchesRating = game.bggRating >= minRating;
        }

        let matchesSourceGame = true;
        if (sourceGameVal !== 'all') {
            matchesSourceGame = Array.isArray(game.recommendedBy) && game.recommendedBy.some(s => String(s.ownedId) === String(sourceGameVal) || s.ownedName === sourceGameVal);
        }

        return matchesSearch && matchesRating && matchesSourceGame;
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
            <div class="game-actions" style="margin-top: 12px; padding-top: 10px; border-top: 1px solid rgba(0,0,0,0.08);"></div>
        </div>
    `;

    const actionsContainer = card.querySelector('.game-actions');
    const wontBuyBtn = document.createElement('button');
    wontBuyBtn.className = 'btn-wont-buy';
    wontBuyBtn.innerHTML = '💻 Copy Console JS (Don\'t Buy)';
    wontBuyBtn.onclick = (e) => copyConsoleScript(e, game, wontBuyBtn);

    actionsContainer.appendChild(wontBuyBtn);

    return card;
}

function generateConsoleScript(game) {
    const payload = JSON.stringify({
        item: {
            collid: 0,
            pp_currency: "USD",
            cv_currency: "USD",
            objecttype: "thing",
            objectid: String(game.objectId),
            status: { wishlist: true },
            objectname: game.name,
            wishlistpriority: 5,
            acquisitiondate: null,
            invdate: null
        }
    });

    const safeName = game.name.replace(/['"\\]/g, '\\$&');

    return `fetch('https://boardgamegeek.com/api/collectionitem', { method: 'POST', headers: { 'Content-Type': 'application/json;charset=UTF-8', 'Accept': 'application/json, text/plain, */*' }, credentials: 'include', body: JSON.stringify(${payload}) }).then(r => { if(r.ok) console.log('✅ Added "${safeName}" to BGG wishlist (Don\\'t Buy This)!'); else console.error('❌ Failed:', r.status); }).catch(console.error);`;
}

async function copyConsoleScript(event, game, button) {
    if (event) {
        event.stopPropagation();
    }

    const scriptCode = generateConsoleScript(game);

    try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(scriptCode);
        } else {
            const textarea = document.createElement('textarea');
            textarea.value = scriptCode;
            textarea.style.position = 'fixed';
            textarea.style.opacity = '0';
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
        }

        const originalText = button.innerHTML;
        button.className = 'btn-wont-buy success';
        button.innerHTML = '✓ Copied JS!';
        showToast(`Copied console code for <strong>"${escapeHtml(game.name)}"</strong>! Paste & run in your browser console on boardgamegeek.com.`);

        setTimeout(() => {
            button.className = 'btn-wont-buy';
            button.innerHTML = originalText;
        }, 3500);

    } catch (err) {
        console.error('Failed to copy JS snippet:', err);
        showToast(`Failed to copy to clipboard`, true);
    }
}

const wontBuyGames = new Set();

function isWontBuy(objectId) {
    return wontBuyGames.has(String(objectId));
}

function markGameAsWontBuy(objectId) {
    wontBuyGames.add(String(objectId));
}

function showToast(message, isError = false) {
    let toastContainer = document.getElementById('toast-container');
    if (!toastContainer) {
        toastContainer = document.createElement('div');
        toastContainer.id = 'toast-container';
        toastContainer.className = 'toast-container';
        document.body.appendChild(toastContainer);
    }

    const toast = document.createElement('div');
    toast.className = `toast ${isError ? 'toast-error' : 'toast-success'}`;
    toast.innerHTML = message;
    toastContainer.appendChild(toast);

    setTimeout(() => {
        toast.classList.add('show');
    }, 10);

    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => {
            toast.remove();
        }, 300);
    }, 4000);
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
