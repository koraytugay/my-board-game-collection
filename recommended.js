// recommended.js - Handling Recommended Games UI

let allGames = [];
let filteredGames = [];
let currentSort = 'match-desc';
let currentViewMode = 'grid';

let ownedThumbnailMap = new Map();

const STORES = [
    { key: 'boardGameBliss', name: 'BoardGameBliss' },
    { key: 'fourZeroOneGames', name: '401 Games' },
    { key: 'lvlUpGames', name: 'LVLUP Games' },
    { key: 'asDesJeux', name: 'As des Jeux' },
    { key: 'greatBoardgames', name: 'Great Boardgames' },
    { key: 'meeplemart', name: 'Meeplemart' },
    { key: 'amazonCa', name: 'Amazon.ca' },
    { key: 'woodForSheep', name: 'Wood for Sheep' },
    { key: 'faceToFaceGames', name: 'Face to Face' },
    { key: 'obsidianGames', name: 'Obsidian Games' },
    { key: 'jjCards', name: 'J&J Cards' },
    { key: 'boardgamesCa', name: 'Boardgames.ca' },
    { key: 'screenFreeGames', name: 'Screen Free Games' },
    { key: 'allSystemsGo', name: 'All Systems Go' },
    { key: 'tabletopCafe', name: 'Tabletop Cafe' },
    { key: 'elevatedBoardGames', name: 'Elevated Board Games' },
    { key: 'buttonShyEtsy', name: 'Button Shy (Etsy)' },
    { key: 'zatu', name: 'Zatu Games' },
    { key: 'bggMarket', name: 'BGG Market' }
];

function getActiveBggListings(game) {
    const bggmkt = game.availability?.bggMarket;
    if (!bggmkt) return [];
    if (Array.isArray(bggmkt.listings) && bggmkt.listings.length > 0) {
        return bggmkt.listings.filter(l => !l.ignored);
    }
    if (bggmkt.available && bggmkt.url && !bggmkt.ignored) {
        return [{
            price: bggmkt.price,
            seller: bggmkt.seller || 'BGG Market',
            condition: bggmkt.condition || '',
            url: bggmkt.url,
            ignored: false
        }];
    }
    return [];
}

function isGameInStockAtStore(game, storeKey) {
    if (!game.availability || !game.availability[storeKey]) return false;
    const storeData = game.availability[storeKey];
    if (storeKey === 'bggMarket') {
        return getActiveBggListings(game).length > 0;
    }
    return !!storeData.available;
}

function isGameInStockAtAnyStore(game) {
    return STORES.some(store => isGameInStockAtStore(game, store.key));
}

function populateStoreFilter() {
    const storeSelect = document.getElementById('store-filter');
    if (!storeSelect) return;

    const currentValue = storeSelect.value;
    storeSelect.innerHTML = '<option value="all">All Stores</option>';

    const storesWithStock = [];
    STORES.forEach(store => {
        const inStockCount = allGames.filter(game => isGameInStockAtStore(game, store.key)).length;
        if (inStockCount > 0) {
            storesWithStock.push({
                ...store,
                count: inStockCount
            });
        }
    });

    storesWithStock.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));

    storesWithStock.forEach(store => {
        const option = document.createElement('option');
        option.value = store.key;
        option.textContent = `${store.name} (${store.count})`;
        storeSelect.appendChild(option);
    });

    if (storesWithStock.some(s => s.key === currentValue)) {
        storeSelect.value = currentValue;
    } else {
        storeSelect.value = 'all';
    }
}

function populateSellerFilter() {
    const sellerSelect = document.getElementById('seller-filter');
    if (!sellerSelect) return;

    const currentValue = sellerSelect.value;
    sellerSelect.innerHTML = '<option value="all">All Sellers</option>';

    const sellerCountMap = new Map();
    allGames.forEach(game => {
        const listings = getActiveBggListings(game);
        const seenForThisGame = new Set();
        listings.forEach(l => {
            if (l.seller && !seenForThisGame.has(l.seller.toLowerCase())) {
                seenForThisGame.add(l.seller.toLowerCase());
                const existing = sellerCountMap.get(l.seller.toLowerCase()) || { seller: l.seller, count: 0 };
                existing.count++;
                sellerCountMap.set(l.seller.toLowerCase(), existing);
            }
        });
    });

    const sellers = Array.from(sellerCountMap.values());
    sellers.sort((a, b) => {
        if (b.count !== a.count) {
            return b.count - a.count;
        }
        return a.seller.localeCompare(b.seller, undefined, { sensitivity: 'base' });
    });

    sellers.forEach(s => {
        const option = document.createElement('option');
        option.value = s.seller;
        option.textContent = `${s.seller} (${s.count})`;
        sellerSelect.appendChild(option);
    });

    if (sellers.some(s => s.seller.toLowerCase() === currentValue.toLowerCase())) {
        sellerSelect.value = currentValue;
    } else {
        sellerSelect.value = 'all';
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
    const statsEl = document.getElementById('stats');
    const controlsEl = document.getElementById('controls');

    try {
        const [recRes, availabilityRes] = await Promise.all([
            fetch('recommendations.json').then(r => {
                if (!r.ok) throw new Error(`HTTP error! status: ${r.status}`);
                return r.json();
            }),
            fetch('availability-recommended.json').then(r => r.ok ? r.json() : {}).catch(() => ({}))
        ]);

        const rawRecs = recRes.recommendations || [];
        allGames = rawRecs.map(game => ({
            ...game,
            availability: availabilityRes[game.objectId] || {}
        }));
        filteredGames = [...allGames];

        populateSourceGameFilter();
        populateStoreFilter();
        populateSellerFilter();
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
    allGames.forEach(r => (r.recommendedBy || []).forEach(s => sourceSet.add(s.ownedId)));

    const inStockCount = allGames.filter(game => isGameInStockAtAnyStore(game)).length;

    document.getElementById('total-recs').textContent = totalRecs;
    document.getElementById('total-sources').textContent = sourceSet.size;
    document.getElementById('avg-bgg-rating').textContent = avgRating.toFixed(1);
    const inStockEl = document.getElementById('in-stock-games');
    if (inStockEl) inStockEl.textContent = inStockCount;
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
    const inStockCheckbox = document.getElementById('in-stock-only');
    const storeFilter = document.getElementById('store-filter');
    const sellerFilter = document.getElementById('seller-filter');

    const searchTerm = searchInput ? searchInput.value.toLowerCase().trim() : '';
    const ratingVal = ratingFilter ? ratingFilter.value : 'all';
    const sourceGameVal = sourceGameFilter ? sourceGameFilter.value : 'all';
    const playerCountVal = playerCountFilter ? playerCountFilter.value : 'all';
    const inStockOnly = inStockCheckbox ? inStockCheckbox.checked : false;
    const storeVal = storeFilter ? storeFilter.value : 'all';
    const sellerVal = sellerFilter ? sellerFilter.value : 'all';

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
            if (playerCountVal === '2-only') {
                matchesPlayers = game.minPlayers === 2 && game.maxPlayers === 2;
            } else if (playerCountVal === '5') {
                matchesPlayers = game.maxPlayers >= 5;
            } else {
                const count = parseInt(playerCountVal);
                matchesPlayers = count >= game.minPlayers && count <= game.maxPlayers;
            }
        }

        let matchesStock = true;
        if (inStockOnly) {
            matchesStock = isGameInStockAtAnyStore(game);
        }

        let matchesStore = true;
        if (storeVal !== 'all') {
            matchesStore = isGameInStockAtStore(game, storeVal);
        }

        let matchesSeller = true;
        if (sellerVal !== 'all') {
            const activeListings = getActiveBggListings(game);
            matchesSeller = activeListings.some(l => l.seller && l.seller.toLowerCase() === sellerVal.toLowerCase());
        }

        return matchesSearch && matchesRating && matchesSourceGame && matchesPlayers && matchesStock && matchesStore && matchesSeller;
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
        if (e.target.closest('.store-btn') || e.target.closest('.btn-wont-buy')) return;
        window.open(`https://boardgamegeek.com/boardgame/${game.objectId}`, '_blank');
    };

    let badgesHtml = '';
    badgesHtml += `<span class="badge badge-favorite">🔥 Match ${game.matchScore}</span>`;

    if (isGameInStockAtAnyStore(game)) {
        badgesHtml += '<span class="badge badge-favorite" style="background: #38a169;">In Stock</span>';
    }

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

    // Build store availability HTML (for in-stock stores)
    let storeButtonsHtml = '';
    const bgb = game.availability?.boardGameBliss;
    const fof = game.availability?.fourZeroOneGames;
    const lvl = game.availability?.lvlUpGames;
    const adj = game.availability?.asDesJeux;
    const gbg = game.availability?.greatBoardgames;
    const meeple = game.availability?.meeplemart;
    const amzn = game.availability?.amazonCa;
    const wfs = game.availability?.woodForSheep;
    const f2f = game.availability?.faceToFaceGames;
    const obsidian = game.availability?.obsidianGames;
    const jj = game.availability?.jjCards;
    const bgca = game.availability?.boardgamesCa;
    const sfg = game.availability?.screenFreeGames;
    const asg = game.availability?.allSystemsGo;
    const ttc = game.availability?.tabletopCafe;
    const ebg = game.availability?.elevatedBoardGames;
    const bse = game.availability?.buttonShyEtsy;
    const zatu = game.availability?.zatu;
    const activeBggListings = getActiveBggListings(game);

    const renderStoreBtn = (store, name, btnClass) => {
        if (!store || !store.url || !store.available) return '';
        const statusClass = 'store-status-instock';
        const statusText = 'In Stock';
        const priceText = store.price ? (String(store.price).match(/^[$C$€£]/) ? store.price : `$${store.price}`) : '';
        return `
            <a href="${store.url}" target="_blank" class="store-btn ${btnClass}">
                <span class="store-name">${name}</span>
                <span>${priceText} <span class="store-status ${statusClass}">${statusText}</span></span>
            </a>
        `;
    };

    storeButtonsHtml += renderStoreBtn(bgb, '🍁 BoardGameBliss', 'store-btn-bgb');
    storeButtonsHtml += renderStoreBtn(fof, '🎲 401 Games', 'store-btn-401');
    storeButtonsHtml += renderStoreBtn(lvl, '⚔️ LVLUP Games', 'store-btn-lvlup');
    storeButtonsHtml += renderStoreBtn(adj, '🃏 As des Jeux', 'store-btn-adj');
    storeButtonsHtml += renderStoreBtn(gbg, '🏰 Great Boardgames', 'store-btn-greatbg');
    storeButtonsHtml += renderStoreBtn(meeple, '👾 Meeplemart', 'store-btn-meeplemart');
    storeButtonsHtml += renderStoreBtn(amzn, '🛒 Amazon.ca', 'store-btn-amazon');
    storeButtonsHtml += renderStoreBtn(wfs, '🐑 Wood for Sheep', 'store-btn-wfs');
    storeButtonsHtml += renderStoreBtn(f2f, '🤝 Face to Face', 'store-btn-f2f');
    storeButtonsHtml += renderStoreBtn(obsidian, '🔮 Obsidian Games', 'store-btn-obsidian');
    storeButtonsHtml += renderStoreBtn(jj, '🎴 J&J Cards', 'store-btn-jj');
    storeButtonsHtml += renderStoreBtn(bgca, '🎯 Boardgames.ca', 'store-btn-boardgamesca');
    storeButtonsHtml += renderStoreBtn(sfg, '🧩 Screen Free Games', 'store-btn-sfg');
    storeButtonsHtml += renderStoreBtn(asg, '🚀 All Systems Go', 'store-btn-asg');
    storeButtonsHtml += renderStoreBtn(ttc, '☕ Tabletop Cafe', 'store-btn-ttc');
    storeButtonsHtml += renderStoreBtn(ebg, '🏔️ Elevated Board Games', 'store-btn-ebg');
    storeButtonsHtml += renderStoreBtn(bse, '👛 Button Shy (Etsy)', 'store-btn-buttonshy');
    storeButtonsHtml += renderStoreBtn(zatu, '🛡️ Zatu Games', 'store-btn-zatu');

    if (activeBggListings.length > 0) {
        activeBggListings.forEach(listing => {
            const label = listing.seller ? `🏷️ ${listing.seller}` : '🏷️ BGG Market';
            storeButtonsHtml += renderStoreBtn({
                available: true,
                price: listing.price,
                url: listing.url
            }, label, 'store-btn-bggmkt');
        });
    }

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
            </div>
            <div class="source-games-section" style="margin-top: 15px; padding-top: 12px; border-top: 1px solid #eee;">
                <div style="font-size: 0.78rem; font-weight: 700; color: #666; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.5px;">Based on games you love:</div>
                <div style="display: flex; flex-wrap: wrap; gap: 8px; align-items: center;">
                    ${sourcesHtml}
                </div>
            </div>
            ${storeButtonsHtml ? `<div class="store-availability">${storeButtonsHtml}</div>` : ''}
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
