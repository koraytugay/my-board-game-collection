let allGames = [];

async function initTierList() {
    const loadingEl = document.getElementById('loading');
    const contentEl = document.getElementById('tierlist-content');
    const errorEl = document.getElementById('error');

    try {
        // Fetch only owned games
        const games = await getCollection(true);
        allGames = games;

        loadDarkMode();
        renderTierList();

        loadingEl.style.display = 'none';
        contentEl.style.display = 'block';

    } catch (error) {
        console.error('Error loading tier list:', error);
        loadingEl.style.display = 'none';
        errorEl.style.display = 'block';
        errorEl.textContent = 'Failed to load tier list data.';
    }
}

function renderTierList() {
    // Only include games that the user has rated and owns
    const ratedGames = allGames.filter(game => game.isOwned && game.myRating && game.myRating > 0);

    const tiers = {
        s: [],
        a: [],
        b: [],
        c: [],
        d: [],
        e: [],
        f: []
    };

    ratedGames.forEach(game => {
        const rating = game.myRating;
        if (rating >= 10) {
            tiers.s.push(game);
        } else if (rating >= 9) {
            tiers.a.push(game);
        } else if (rating >= 7) {
            tiers.b.push(game);
        } else if (rating >= 6) {
            tiers.c.push(game);
        } else if (rating >= 5) {
            tiers.d.push(game);
        } else if (rating >= 3) {
            tiers.e.push(game);
        } else if (rating >= 1) {
            tiers.f.push(game);
        }
    });

    renderTierRow('s', tiers.s);
    renderTierRow('a', tiers.a);
    renderTierRow('b', tiers.b);
    renderTierRow('c', tiers.c);
    renderTierRow('d', tiers.d);
    renderTierRow('e', tiers.e);
    renderTierRow('f', tiers.f);
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

function renderTierRow(tierKey, games) {
    const gridEl = document.getElementById(`tier-${tierKey}-grid`);
    if (!gridEl) return;

    // Sort alphabetically by name
    games.sort((a, b) => a.name.localeCompare(b.name));

    if (games.length === 0) {
        gridEl.innerHTML = '<p class="tier-empty">No games in this tier.</p>';
        return;
    }

    gridEl.innerHTML = games.map(game => {
        const safeName = escapeHtml(game.name);
        const imageUrl = game.thumbnail || game.image || 'https://via.placeholder.com/150x150?text=?';

        return `
            <div class="tier-game-card" onclick="typeof showGameDetails === 'function' ? showGameDetails('${game.objectId}') : window.open('https://boardgamegeek.com/boardgame/${game.objectId}', '_blank')" title="${safeName} (My Rating: ${game.myRating})">
                <img src="${imageUrl}" alt="${safeName}" class="tier-game-img" loading="lazy">
            </div>
        `;
    }).join('');
}

function loadDarkMode() {
    const isDark = localStorage.getItem('darkMode') === 'true';
    if (isDark) {
        document.body.classList.add('dark-mode');
    }
}

document.addEventListener('DOMContentLoaded', initTierList);
