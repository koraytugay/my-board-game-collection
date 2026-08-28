// recommended.js - Handling Recommended Games UI

let allGames = [];
let filteredGames = [];
let currentSort = 'match-desc';
let currentViewMode = 'grid';

let ownedThumbnailMap = new Map();

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

document.addEventListener('DOMContentLoaded', async () => {
    try {
        if (typeof getCollection === 'function') {
            const items = await getCollection(false);
            items.forEach(item => {
                ownedThumbnailMap.set(String(item.objectId), item.thumbnail || item.image);
            });
        }
    } catch (e) {
        console.warn('Could not load collection thumbnails:', e);
    }
    fetchRecommendations();
});

async function fetchRecommendations() {
    const loadingEl = document.getElementById('loading');
    const errorEl = document.getElementById('error');
    const controlsEl = document.getElementById('controls');

    try {
        const [recRes, designersRes] = await Promise.all([
            fetch('recommendations.json').then(r => {
                if (!r.ok) throw new Error(`HTTP error! status: ${r.status}`);
                return r.json();
            }),
            fetch('designers.json').then(r => r.ok ? r.json() : {}).catch(() => ({}))
        ]);

        const rawRecs = recRes.recommendations || [];
        allGames = rawRecs.map(game => ({
            ...game,
            designers: designersRes[game.objectId]?.designers || []
        }));
        filteredGames = [...allGames];

        populateSourceGameFilter();
        populateDesignerFilter();
        sortGames(currentSort);

        loadingEl.style.display = 'none';
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
    const playerCountFilter = document.getElementById('player-count');
    const designerFilter = document.getElementById('designer-filter');

    const searchTerm = searchInput ? searchInput.value.toLowerCase().trim() : '';
    const ratingVal = ratingFilter ? ratingFilter.value : 'all';
    const sourceGameVal = sourceGameFilter ? sourceGameFilter.value : 'all';
    const playerCountVal = playerCountFilter ? playerCountFilter.value : 'all';
    const designerVal = designerFilter ? designerFilter.value : 'all';

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

        let matchesPlayers = true;
        if (playerCountVal !== 'all' && game.minPlayers && game.maxPlayers) {
            if (playerCountVal === '1-only') {
                matchesPlayers = game.minPlayers === 1 && game.maxPlayers === 1;
            } else if (playerCountVal === '2-only') {
                matchesPlayers = game.minPlayers === 2 && game.maxPlayers === 2;
            } else if (playerCountVal === '5') {
                matchesPlayers = game.maxPlayers >= 5;
            } else {
                const count = parseInt(playerCountVal);
                matchesPlayers = count >= game.minPlayers && count <= game.maxPlayers;
            }
        }

        let matchesDesigner = true;
        if (designerVal !== 'all') {
            const designers = game.designers || [];
            matchesDesigner = designers.some(d => d.toLowerCase() === designerVal.toLowerCase());
        }

        return matchesSearch && matchesRating && matchesSourceGame && matchesPlayers && matchesDesigner;
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
    card.onclick = (e) => {
        if (e.target.closest('a') || e.target.closest('button') || e.target.closest('.btn-wont-buy') || e.target.closest('.source-thumb-chip')) return;
        window.open(`https://boardgamegeek.com/boardgame/${game.objectId}`, '_blank');
    };

    let badgesHtml = `<span class="badge badge-favorite">🔥 Match ${game.matchScore}</span>`;

    const sourcesHtml = (game.recommendedBy || []).map(s => {
        const thumbUrl = ownedThumbnailMap.get(String(s.ownedId)) || `images/thumbnails/${s.ownedId}.jpg`;
        return `
            <div class="source-thumb-chip" title="${escapeHtml(s.ownedName)} (★${s.userRating})">
                <img src="${thumbUrl}" 
                     alt="${escapeHtml(s.ownedName)}" 
                     class="source-thumb-img" 
                     loading="lazy"
                     onerror="this.onerror=null; this.src='images/thumbnails/${s.ownedId}.png';">
                <span class="source-thumb-rating">★${s.userRating}</span>
            </div>
        `;
    }).join('');

    const playersText = (game.minPlayers && game.maxPlayers) 
        ? (game.minPlayers === game.maxPlayers ? `${game.minPlayers}` : `${game.minPlayers}-${game.maxPlayers}`)
        : null;

    const designersText = (game.designers && game.designers.length > 0 && game.designers[0] !== '(Uncredited)')
        ? game.designers.join(', ')
        : '';

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
                ${playersText ? `<div class="meta-item"><span>👥</span> ${playersText}</div>` : ''}
                ${game.playingTime ? `<div class="meta-item"><span>⏱️</span> ${game.playingTime} min</div>` : ''}
                <div class="meta-item"><span>⭐</span> ${game.bggRating ? game.bggRating.toFixed(1) : 'N/A'}</div>
                ${designersText ? `<div class="meta-item" title="Designer: ${escapeHtml(designersText)}"><span>✍️</span> ${escapeHtml(designersText)}</div>` : ''}
            </div>
            <div class="source-games-section">
                <div class="source-games-title">Based on games you love:</div>
                <div class="source-games-list">
                    ${sourcesHtml}
                </div>
            </div>
            <div class="game-actions" style="margin-top: 15px; padding-top: 12px; border-top: 1px solid #eee;"></div>
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
