// smartbuy.js - Smart Buy & Order Optimizer

let allStoreGroups = [];
let filteredStoreGroups = [];
let storeSelections = {}; // { storeKey: Set(gameRowKeys) }
let storeSortStates = {}; // { storeKey: { column, direction } }



function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function getNumericCadPrice(price, storeKey = null) {
    if (!price && price !== 0) return 0;
    const str = String(price).trim();
    if (!str) return 0;

    const clean = str.replace(/,/g, '');
    const match = clean.match(/[0-9]+(?:\.[0-9]+)?/);
    if (!match) return 0;
    const num = parseFloat(match[0]);
    if (isNaN(num)) return 0;

    if (str.includes('€') || /\bEUR\b/i.test(str) || storeKey === 'philibert') {
        return num * 1.65;
    } else if (str.includes('£') || /\bGBP\b/i.test(str) || storeKey === 'zatu' || storeKey === 'chaosCards') {
        return num * 1.90;
    } else if (/\bUSD\b/i.test(str) || /\$US\b/i.test(str) || /US\$/i.test(str) || storeKey === 'miniatureMarket' || storeKey === 'cardhaus' || storeKey === 'theGameSteward') {
        return num * 1.40;
    }
    return num;
}

async function fetchSmartBuyData() {
    const loadingEl = document.getElementById('loading');
    const errorEl = document.getElementById('error');
    const contentEl = document.getElementById('smartbuy-content');

    try {
        const [
            allCollection,
            storeAvail,
            likeToHaveAvail,
            designersRes
        ] = await Promise.all([
            getCollection(false).catch(err => { console.warn('Collection load error:', err); return []; }),
            fetch('availability.json').then(res => res.ok ? res.json() : {}).catch(() => ({})),
            fetch('availability-liketohave.json').then(res => res.ok ? res.json() : {}).catch(() => ({})),
            fetch('designers.json').then(res => res.ok ? res.json() : {}).catch(() => ({}))
        ]);

        // Target: Want to Buy, Want in Trade, Like to Have
        const targetCollection = allCollection.filter(game => game.isWantToBuy || game.isWantInTrade || game.isLikeToHave);
        const parsedGames = [];

        targetCollection.forEach(game => {
            const id = String(game.objectId);
            const designers = designersRes[id]?.designers || [];
            const mergedAvail = { ...(storeAvail[id] || {}), ...(likeToHaveAvail[id] || {}) };

            parsedGames.push({
                objectId: id,
                name: game.name || 'Unknown Game',
                yearPublished: game.yearPublished || '',
                thumbnail: game.thumbnail || '',
                image: game.image || game.thumbnail || '',
                minPlayers: game.minPlayers || 0,
                maxPlayers: game.maxPlayers || 0,
                playingTime: game.playingTime || 0,
                rating: game.rating || 0,
                myRating: game.myRating || 0,
                designers: designers,
                isWantToBuy: !!game.isWantToBuy,
                isWantInTrade: !!game.isWantInTrade,
                isLikeToHave: !!game.isLikeToHave,
                availability: mergedAvail
            });
        });

        // Group games by retail store (exclude BGG Market as sellers are independent)
        allStoreGroups = [];
        storeSelections = {};

        const retailStores = STORES.filter(s => s.key !== 'bggMarket');

        retailStores.forEach(storeDef => {
            const storeKey = storeDef.key;
            const storeGames = [];

            parsedGames.forEach(game => {
                const storeData = game.availability?.[storeKey];
                if (!storeData || !storeData.available || !storeData.url) return;

                const num = extractNumericPrice(storeData.price);
                if (num !== null && num <= 5.0) return; // Filter out accessories / false matches

                const cadPrice = getNumericCadPrice(storeData.price, storeKey);
                const hasDeal = storeData.deal && storeData.deal.discountPercent >= 20;
                const rowKey = `${game.objectId}-${storeKey}`;

                storeGames.push({
                    rowKey: rowKey,
                    game: game,
                    url: storeData.url,
                    rawPrice: storeData.price,
                    cadPrice: cadPrice,
                    formattedCadPrice: typeof formatPrice === 'function' ? formatPrice(storeData.price, storeKey) : `$${cadPrice.toFixed(2)}`,
                    deal: hasDeal ? storeData.deal : null
                });
            });

            if (storeGames.length > 0) {
                storeSelections[storeKey] = new Set(storeGames.map(g => g.rowKey));
                allStoreGroups.push({
                    key: storeKey,
                    name: storeDef.name,
                    url: storeDef.url || '#',
                    games: storeGames
                });
            }
        });

        // Calculate cross-store best prices and differences for each game
        const gameBestPrices = {};
        allStoreGroups.forEach(group => {
            group.games.forEach(item => {
                if (!item.cadPrice || item.cadPrice <= 0) return;
                const id = item.game.objectId;
                if (!gameBestPrices[id]) {
                    gameBestPrices[id] = [];
                }
                gameBestPrices[id].push({
                    storeKey: group.key,
                    storeName: group.name,
                    cadPrice: item.cadPrice
                });
            });
        });

        allStoreGroups.forEach(group => {
            group.games.forEach(item => {
                const id = item.game.objectId;
                const offers = gameBestPrices[id] || [];
                const storeCount = offers.length;

                if (storeCount > 1) {
                    const minCadPrice = Math.min(...offers.map(o => o.cadPrice));
                    const bestOffer = offers.find(o => o.cadPrice === minCadPrice);
                    const diffCad = item.cadPrice - minCadPrice;
                    const diffPercent = Math.round((diffCad / minCadPrice) * 100);

                    if (diffPercent > 0 && diffCad >= 0.25) {
                        item.priceDiff = {
                            diffPercent: diffPercent,
                            diffCad: diffCad,
                            diffStatus: 'higher',
                            storeCount: storeCount,
                            minCadPrice: minCadPrice,
                            cheapestStoreName: bestOffer ? bestOffer.storeName : ''
                        };
                    } else {
                        item.priceDiff = {
                            diffPercent: 0,
                            diffCad: 0,
                            diffStatus: 'lowest',
                            storeCount: storeCount,
                            minCadPrice: minCadPrice,
                            cheapestStoreName: bestOffer ? bestOffer.storeName : ''
                        };
                    }
                } else {
                    item.priceDiff = {
                        diffPercent: 0,
                        diffCad: 0,
                        diffStatus: 'only',
                        storeCount: 1,
                        minCadPrice: item.cadPrice,
                        cheapestStoreName: group.name
                    };
                }
            });
        });

        // Sort stores by games count descending (most in-stock games first)
        allStoreGroups.sort((a, b) => b.games.length - a.games.length);
        filteredStoreGroups = [...allStoreGroups];

        renderSmartBuyUI();

        loadingEl.style.display = 'none';
        contentEl.style.display = 'block';

        loadDarkModePreference();

    } catch (err) {
        console.error('Failed to load Smart Buy data:', err);
        loadingEl.style.display = 'none';
        errorEl.style.display = 'block';
        errorEl.textContent = `Error loading Smart Buy: ${err.message}`;
    }
}

function calculateStoreTotal(storeKey, gamesList) {
    const selSet = storeSelections[storeKey] || new Set();
    return gamesList
        .filter(g => selSet.has(g.rowKey))
        .reduce((sum, g) => sum + (g.cadPrice || 0), 0);
}

function renderSmartBuyUI() {
    const container = document.getElementById('stores-container');
    const quickJump = document.getElementById('store-quick-jump');

    if (!container) return;

    const totalVisibleStores = filteredStoreGroups.length;

    // Quick jump pills
    if (quickJump) {
        if (totalVisibleStores > 1) {
            let pillsHtml = '';
            filteredStoreGroups.forEach(group => {
                pillsHtml += `
                    <a href="#store-${group.key}" class="jump-pill" title="Jump to ${escapeHtml(group.name)}">
                        <span>${escapeHtml(group.name)}</span>
                        <span class="jump-pill-count">${group.games.length}</span>
                    </a>
                `;
            });
            quickJump.innerHTML = pillsHtml;
            quickJump.style.display = 'flex';
        } else {
            quickJump.innerHTML = '';
            quickJump.style.display = 'none';
        }
    }

    // Stores container
    if (totalVisibleStores === 0) {
        container.innerHTML = `
            <div class="smartbuy-empty">
                <h3>No stores matched your filters</h3>
                <p>Try clearing your search or setting "Min Games" to 1+.</p>
            </div>
        `;
        return;
    }

    container.innerHTML = '';

    filteredStoreGroups.forEach(group => {
        const storeCard = renderStoreCard(group);
        container.appendChild(storeCard);
    });
}

function renderStoreCard(group) {
    const storeKey = group.key;
    const games = group.games;
    const selSet = storeSelections[storeKey] || new Set();
    const selectedCount = games.filter(g => selSet.has(g.rowKey)).length;
    const totalCad = calculateStoreTotal(storeKey, games);
    const allSelected = games.length > 0 && selectedCount === games.length;

    const card = document.createElement('div');
    card.className = 'smartbuy-store-card';
    card.id = `store-${storeKey}`;

    // Header HTML: store name as link and calculated total
    const storeUrl = group.url || '#';
    const headerHtml = `
        <div class="store-card-header">
            <a href="${escapeHtml(storeUrl)}" target="_blank" rel="noopener noreferrer" class="store-name">${escapeHtml(group.name)}</a>
            <span class="total-amount" id="total-amount-${storeKey}">$${totalCad.toFixed(2)} CAD</span>
        </div>
    `;

    // Playlist Table HTML
    let rowsHtml = '';
    games.forEach(item => {
        const isSelected = selSet.has(item.rowKey);
        const game = item.game;

        // List tag badges
        let tagBadges = '';
        if (game.isWantToBuy) tagBadges += '<span class="badge-tag badge-wtb">Want to Buy</span>';
        if (game.isWantInTrade) tagBadges += '<span class="badge-tag badge-trade">Want in Trade</span>';
        if (game.isLikeToHave) tagBadges += '<span class="badge-tag badge-like">Like to Have</span>';

        // Designers & Year
        const designersStr = (game.designers && game.designers.length > 0 && game.designers[0] !== '(Uncredited)')
            ? game.designers.join(', ')
            : '';
        const yearStr = game.yearPublished && game.yearPublished !== 'N/A' ? game.yearPublished : '';

        // Deal tag
        let dealHtml = '';
        if (item.deal) {
            dealHtml = `<span class="row-deal-badge">-${item.deal.discountPercent}%</span>`;
        }

        // Price difference badge
        let diffHtml = '<span class="diff-badge diff-only" title="Only store with this game in stock">—</span>';
        if (item.priceDiff) {
            if (item.priceDiff.diffStatus === 'higher') {
                diffHtml = `<span class="diff-badge diff-higher" title="+$${item.priceDiff.diffCad.toFixed(2)} CAD (+${item.priceDiff.diffPercent}%) vs cheapest at ${escapeHtml(item.priceDiff.cheapestStoreName)} ($${item.priceDiff.minCadPrice.toFixed(2)} CAD)">+${item.priceDiff.diffPercent}% 🔺</span>`;
            } else if (item.priceDiff.diffStatus === 'lowest') {
                diffHtml = `<span class="diff-badge diff-lowest" title="Lowest price available across all stores ($${item.priceDiff.minCadPrice.toFixed(2)} CAD)">✓ Lowest</span>`;
            }
        }

        rowsHtml += `
            <tr class="playlist-row ${isSelected ? '' : 'is-unselected'}" id="row-${item.rowKey}" data-store="${storeKey}" data-key="${item.rowKey}" onclick="onRowClicked('${storeKey}', '${item.rowKey}', event)">
                <td class="td-checkbox">
                    <input type="checkbox" 
                        class="playlist-checkbox" 
                        id="chk-${item.rowKey}" 
                        ${isSelected ? 'checked' : ''} 
                        onchange="onGameCheckboxChanged('${storeKey}', '${item.rowKey}', this.checked)">
                </td>
                <td class="td-title">
                    <div class="game-title-container">
                        <img src="${game.thumbnail || game.image || 'https://via.placeholder.com/38?text=No+Img'}" 
                            alt="${escapeHtml(game.name)}" 
                            class="game-cover-art" 
                            loading="lazy" 
                            onclick="typeof showGameDetails === 'function' ? showGameDetails('${game.objectId}') : window.open('https://boardgamegeek.com/boardgame/${game.objectId}', '_blank')"
                            title="Click to view details for ${escapeHtml(game.name)}">
                        <a href="javascript:void(0)" 
                            class="game-row-title" 
                            onclick="typeof showGameDetails === 'function' ? showGameDetails('${game.objectId}') : window.open('https://boardgamegeek.com/boardgame/${game.objectId}', '_blank')"
                            title="${escapeHtml(game.name)}">
                            ${escapeHtml(game.name)}
                        </a>
                    </div>
                </td>
                <td class="td-year">${escapeHtml(yearStr || '—')}</td>
                <td class="td-designers" title="${escapeHtml(designersStr)}">${escapeHtml(designersStr || '—')}</td>
                <td class="td-list">${tagBadges || '—'}</td>
                <td class="td-price">
                    <div class="price-container">
                        <span class="price-cad" id="price-cad-${item.rowKey}">$${(item.cadPrice || 0).toFixed(2)} CAD</span>
                        ${dealHtml}
                    </div>
                </td>
                <td class="td-diff">${diffHtml}</td>
                <td class="td-action">
                    <a href="${item.url}" target="_blank" class="store-link" title="Open product page on ${escapeHtml(group.name)}">
                        Store ↗
                    </a>
                </td>
            </tr>
        `;
    });

    const tableHtml = `
        <div class="playlist-table-wrapper">
            <table class="playlist-table">
                <thead>
                    <tr>
                        <th class="col-checkbox">
                            <input type="checkbox" 
                                class="playlist-checkbox" 
                                id="header-chk-${storeKey}" 
                                ${allSelected ? 'checked' : ''} 
                                onchange="toggleSelectAllForStore('${storeKey}', this.checked)"
                                title="Toggle all games for this store">
                        </th>
                        <th class="col-title sortable" id="th-${storeKey}-game" onclick="sortStoreTable('${storeKey}', 'game')" title="Sort by Game">
                            Game<span class="sort-arrow" id="sort-arrow-${storeKey}-game"></span>
                        </th>
                        <th class="col-year sortable" id="th-${storeKey}-year" onclick="sortStoreTable('${storeKey}', 'year')" title="Sort by Year">
                            Year<span class="sort-arrow" id="sort-arrow-${storeKey}-year"></span>
                        </th>
                        <th class="col-designers">Designers</th>
                        <th class="col-list sortable" id="th-${storeKey}-list" onclick="sortStoreTable('${storeKey}', 'list')" title="Sort by List">
                            List<span class="sort-arrow" id="sort-arrow-${storeKey}-list"></span>
                        </th>
                        <th class="col-price sortable" id="th-${storeKey}-price" onclick="sortStoreTable('${storeKey}', 'price')" title="Sort by Price">
                            Price<span class="sort-arrow" id="sort-arrow-${storeKey}-price"></span>
                        </th>
                        <th class="col-diff sortable" id="th-${storeKey}-diff" onclick="sortStoreTable('${storeKey}', 'diff')" title="Sort by Difference from Lowest Price">
                            vs Lowest<span class="sort-arrow" id="sort-arrow-${storeKey}-diff"></span>
                        </th>
                        <th class="col-action">Link</th>
                    </tr>
                </thead>
                <tbody>
                    ${rowsHtml}
                </tbody>
            </table>
        </div>
    `;

    card.innerHTML = headerHtml + tableHtml;
    return card;
}
 
function onRowClicked(storeKey, rowKey, event) {
    // If clicked on an interactive element (link, checkbox, button, thumbnail), let its own handler handle it
    if (event && event.target && event.target.closest('a, input, button, .game-cover-art')) {
        return;
    }

    const chk = document.getElementById(`chk-${rowKey}`);
    if (chk) {
        chk.checked = !chk.checked;
        onGameCheckboxChanged(storeKey, rowKey, chk.checked);
    }
}

function onGameCheckboxChanged(storeKey, rowKey, isChecked) {
    if (!storeSelections[storeKey]) {
        storeSelections[storeKey] = new Set();
    }

    if (isChecked) {
        storeSelections[storeKey].add(rowKey);
    } else {
        storeSelections[storeKey].delete(rowKey);
    }

    // Update row visual state
    const rowEl = document.getElementById(`row-${rowKey}`);
    if (rowEl) {
        if (isChecked) {
            rowEl.classList.remove('is-unselected');
        } else {
            rowEl.classList.add('is-unselected');
        }
    }

    updateStoreHeaderTotal(storeKey);
}

function toggleSelectAllForStore(storeKey, shouldSelectAll) {
    const group = allStoreGroups.find(g => g.key === storeKey);
    if (!group) return;

    if (!storeSelections[storeKey]) {
        storeSelections[storeKey] = new Set();
    }

    group.games.forEach(item => {
        if (shouldSelectAll) {
            storeSelections[storeKey].add(item.rowKey);
        } else {
            storeSelections[storeKey].delete(item.rowKey);
        }

        const chk = document.getElementById(`chk-${item.rowKey}`);
        if (chk) chk.checked = shouldSelectAll;

        const rowEl = document.getElementById(`row-${item.rowKey}`);
        if (rowEl) {
            if (shouldSelectAll) {
                rowEl.classList.remove('is-unselected');
            } else {
                rowEl.classList.add('is-unselected');
            }
        }
    });

    const headerChk = document.getElementById(`header-chk-${storeKey}`);
    if (headerChk) headerChk.checked = shouldSelectAll;

    updateStoreHeaderTotal(storeKey);
}

function updateStoreHeaderTotal(storeKey) {
    const group = filteredStoreGroups.find(g => g.key === storeKey) || allStoreGroups.find(g => g.key === storeKey);
    if (!group) return;

    const games = group.games;
    const selSet = storeSelections[storeKey] || new Set();
    const selectedGames = games.filter(g => selSet.has(g.rowKey));
    const selectedCount = selectedGames.length;
    const totalCad = selectedGames.reduce((sum, g) => sum + (g.cadPrice || 0), 0);

    const totalAmtEl = document.getElementById(`total-amount-${storeKey}`);
    if (totalAmtEl) {
        totalAmtEl.textContent = `$${totalCad.toFixed(2)} CAD`;
    }

    const headerChk = document.getElementById(`header-chk-${storeKey}`);
    if (headerChk) {
        headerChk.checked = selectedCount === games.length && games.length > 0;
        headerChk.indeterminate = selectedCount > 0 && selectedCount < games.length;
    }
}

function getListRank(game) {
    if (game.isWantToBuy) return 1;
    if (game.isLikeToHave) return 2;
    if (game.isWantInTrade) return 3;
    return 4;
}

function sortStoreTable(storeKey, column) {
    const group = allStoreGroups.find(g => g.key === storeKey);
    if (!group || !group.games || group.games.length === 0) return;

    if (!storeSortStates[storeKey]) {
        storeSortStates[storeKey] = { column: null, direction: null };
    }
    const current = storeSortStates[storeKey];

    let direction = 'asc';
    if (current.column === column) {
        direction = current.direction === 'asc' ? 'desc' : 'asc';
    } else {
        if (column === 'year' || column === 'diff') {
            direction = 'desc';
        } else {
            direction = 'asc';
        }
    }
    storeSortStates[storeKey] = { column, direction };

    group.games.sort((a, b) => {
        if (column === 'game') {
            const cmp = a.game.name.localeCompare(b.game.name, undefined, { sensitivity: 'base' });
            return direction === 'asc' ? cmp : -cmp;
        } else if (column === 'year') {
            const yearA = parseInt(a.game.yearPublished) || 0;
            const yearB = parseInt(b.game.yearPublished) || 0;
            if (yearA === 0 && yearB !== 0) return 1;
            if (yearB === 0 && yearA !== 0) return -1;
            if (yearA !== yearB) {
                return direction === 'asc' ? yearA - yearB : yearB - yearA;
            }
            return a.game.name.localeCompare(b.game.name);
        } else if (column === 'list') {
            const rankA = getListRank(a.game);
            const rankB = getListRank(b.game);
            if (rankA !== rankB) {
                return direction === 'asc' ? rankA - rankB : rankB - rankA;
            }
            return a.game.name.localeCompare(b.game.name);
        } else if (column === 'price') {
            const priceA = a.cadPrice || 0;
            const priceB = b.cadPrice || 0;
            if (priceA !== priceB) {
                return direction === 'asc' ? priceA - priceB : priceB - priceA;
            }
            return a.game.name.localeCompare(b.game.name);
        } else if (column === 'diff') {
            const diffA = a.priceDiff ? a.priceDiff.diffPercent : 0;
            const diffB = b.priceDiff ? b.priceDiff.diffPercent : 0;
            if (diffA !== diffB) {
                return direction === 'asc' ? diffA - diffB : diffB - diffA;
            }
            return a.game.name.localeCompare(b.game.name);
        }
        return 0;
    });

    // Reorder DOM rows in table tbody
    const tbody = document.querySelector(`#store-${storeKey} .playlist-table tbody`);
    if (tbody) {
        group.games.forEach(item => {
            const rowEl = document.getElementById(`row-${item.rowKey}`);
            if (rowEl) {
                tbody.appendChild(rowEl);
            }
        });
    }

    // Update sort arrows & active state on headers
    const sortColumns = ['game', 'year', 'list', 'price', 'diff'];
    sortColumns.forEach(col => {
        const thEl = document.getElementById(`th-${storeKey}-${col}`);
        const arrowEl = document.getElementById(`sort-arrow-${storeKey}-${col}`);
        if (!thEl || !arrowEl) return;

        if (col === column) {
            thEl.classList.add('active-sort');
            arrowEl.textContent = direction === 'asc' ? ' ▲' : ' ▼';
        } else {
            thEl.classList.remove('active-sort');
            arrowEl.textContent = '';
        }
    });
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
    const checkbox = document.getElementById('dark-mode');
    if (checkbox) checkbox.checked = isDark;
    if (isDark) {
        document.body.classList.add('dark-mode');
    }
}

document.addEventListener('DOMContentLoaded', () => {
    fetchSmartBuyData();
});
