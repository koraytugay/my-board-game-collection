// smartbuy.js - Smart Buy & Order Optimizer

let allStoreGroups = [];
let filteredStoreGroups = [];
let storeSelections = {}; // { storeKey: Set(gameRowKeys) }

const STORE_META = {
    boardGameBliss: { region: '🇨🇦 Canada', currency: 'CAD', url: 'https://www.boardgamebliss.com' },
    fourZeroOneGames: { region: '🇨🇦 Canada', currency: 'CAD', url: 'https://store.401games.ca' },
    lvlUpGames: { region: '🇨🇦 Canada', currency: 'CAD', url: 'https://www.lvlupgames.ca' },
    asDesJeux: { region: '🇨🇦 Canada', currency: 'CAD', url: 'https://www.asdesjeux.com' },
    greatBoardgames: { region: '🇨🇦 Canada', currency: 'CAD', url: 'https://www.greatboardgames.ca' },
    meeplemart: { region: '🇨🇦 Canada', currency: 'CAD', url: 'https://meeplemart.com' },
    kbHobbies: { region: '🇨🇦 Canada', currency: 'CAD', url: 'https://kbhobbies.com' },
    miniatureMarket: { region: '🇺🇸 USA', currency: 'USD (~1.40 CAD)', url: 'https://www.miniaturemarket.com' },
    cardhaus: { region: '🇺🇸 USA', currency: 'USD (~1.40 CAD)', url: 'https://www.cardhaus.com' },
    theGameSteward: { region: '🇺🇸 USA', currency: 'USD (~1.40 CAD)', url: 'https://thegamesteward.com' },
    amazonCa: { region: '🇨🇦 Canada', currency: 'CAD', url: 'https://www.amazon.ca' },
    woodForSheep: { region: '🇨🇦 Canada', currency: 'CAD', url: 'https://www.woodforsheep.ca' },
    jjCards: { region: '🇨🇦 Canada', currency: 'CAD', url: 'https://jjcards.com' },
    boardgamesCa: { region: '🇨🇦 Canada', currency: 'CAD', url: 'https://boardgames.ca' },
    screenFreeGames: { region: '🇨🇦 Canada', currency: 'CAD', url: 'https://screenfreegames.com' },
    allSystemsGo: { region: '🇺🇸 USA', currency: 'CAD', url: 'https://allsystemsgo.games' },
    tabletopCafe: { region: '🇨🇦 Canada', currency: 'CAD', url: 'https://www.tabletopcafe.ca' },
    elevatedBoardGames: { region: '🇨🇦 Canada', currency: 'CAD', url: 'https://elevatedboardgames.com' },
    diceHollow: { region: '🇨🇦 Canada', currency: 'CAD', url: 'https://www.dicehollow.com' },
    laPioche: { region: '🇨🇦 Canada', currency: 'CAD', url: 'https://boutiquelapioche.com' },
    alwaysGames: { region: '🇨🇦 Canada', currency: 'CAD', url: 'https://alwaysgames.ca' },
    legendsWarehouse: { region: '🇨🇦 Canada', currency: 'CAD', url: 'https://legendswarehouse.ca' },
    boardGameBandit: { region: '🇨🇦 Canada', currency: 'CAD', url: 'https://boardgamebandit.ca' },
    zatu: { region: '🇬🇧 UK', currency: 'GBP (~1.90 CAD)', url: 'https://zatu.com' },
    chaosCards: { region: '🇬🇧 UK', currency: 'GBP (~1.90 CAD)', url: 'https://www.chaoscards.co.uk' },
    philibert: { region: '🇫🇷 Europe', currency: 'EUR (~1.65 CAD)', url: 'https://www.philibertnet.com' },
    crowdfinder: { region: '🇧🇪 Europe', currency: 'EUR (~1.65 CAD)', url: 'https://www.crowdfinder.be' }
};

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

    if (str.includes('€') || /\bEUR\b/i.test(str) || storeKey === 'philibert' || storeKey === 'crowdfinder') {
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
            const meta = STORE_META[storeKey] || { region: '', currency: '', url: '#' };
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
                    meta: meta,
                    games: storeGames
                });
            }
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

    // Header HTML
    const websiteLink = group.meta.url && group.meta.url !== '#'
        ? `<a href="${group.meta.url}" target="_blank" class="store-website-link" title="Visit website">website ↗</a>`
        : '';

    const headerHtml = `
        <div class="store-card-header">
            <div class="store-header-left">
                <span class="store-name">${escapeHtml(group.name)}</span>
                ${websiteLink}
                <span class="store-meta-line">• ${escapeHtml(group.meta.region)} • ${escapeHtml(group.meta.currency)} • ${games.length} in stock</span>
            </div>
            <div class="store-header-right">
                <div class="store-order-total">
                    <span class="total-label">Total:</span>
                    <span class="total-amount" id="total-amount-${storeKey}">$${totalCad.toFixed(2)} CAD</span>
                    <span class="total-count" id="total-count-${storeKey}">(${selectedCount} of ${games.length} selected)</span>
                </div>
                <div class="store-header-actions">
                    <button type="button" class="btn-store-action" onclick="toggleSelectAllForStore('${storeKey}', true)">Select All</button>
                    <button type="button" class="btn-store-action" onclick="toggleSelectAllForStore('${storeKey}', false)">Clear</button>
                </div>
            </div>
        </div>
    `;

    // Playlist Table HTML
    let rowsHtml = '';
    games.forEach((item, index) => {
        const isSelected = selSet.has(item.rowKey);
        const game = item.game;
        const rowIndex = index + 1;

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
        const subInfoParts = [yearStr, designersStr].filter(Boolean).join(' • ');

        // Deal tag
        let dealHtml = '';
        if (item.deal) {
            dealHtml = `<span class="row-deal-badge">-${item.deal.discountPercent}%</span>`;
        }

        // Stats string
        const statsStr = `⭐ ${game.rating ? game.rating.toFixed(1) : 'N/A'} · 👥 ${game.minPlayers}-${game.maxPlayers}${game.playingTime ? ` · ⏱️ ${game.playingTime}m` : ''}`;

        rowsHtml += `
            <tr class="playlist-row ${isSelected ? '' : 'is-unselected'}" id="row-${item.rowKey}" data-store="${storeKey}" data-key="${item.rowKey}">
                <td class="td-checkbox">
                    <input type="checkbox" 
                        class="playlist-checkbox" 
                        id="chk-${item.rowKey}" 
                        ${isSelected ? 'checked' : ''} 
                        onchange="onGameCheckboxChanged('${storeKey}', '${item.rowKey}', this.checked)">
                </td>
                <td class="td-index">${rowIndex}</td>
                <td class="td-title">
                    <div class="game-title-container">
                        <img src="${game.thumbnail || game.image || 'https://via.placeholder.com/38?text=No+Img'}" 
                            alt="${escapeHtml(game.name)}" 
                            class="game-cover-art" 
                            loading="lazy" 
                            onclick="typeof showGameDetails === 'function' ? showGameDetails('${game.objectId}') : window.open('https://boardgamegeek.com/boardgame/${game.objectId}', '_blank')"
                            title="Click to view details for ${escapeHtml(game.name)}">
                        <div class="game-text-details">
                            <div class="game-title-badges-row">
                                <a href="javascript:void(0)" 
                                    class="game-row-title" 
                                    onclick="typeof showGameDetails === 'function' ? showGameDetails('${game.objectId}') : window.open('https://boardgamegeek.com/boardgame/${game.objectId}', '_blank')"
                                    title="${escapeHtml(game.name)}">
                                    ${escapeHtml(game.name)}
                                </a>
                                ${tagBadges}
                            </div>
                            <div class="game-subinfo" title="${escapeHtml(subInfoParts)}">${escapeHtml(subInfoParts)}</div>
                        </div>
                    </div>
                </td>
                <td class="td-stats">${escapeHtml(statsStr)}</td>
                <td class="td-price">
                    <div class="price-container">
                        <span class="price-cad" id="price-cad-${item.rowKey}">$${(item.cadPrice || 0).toFixed(2)} CAD</span>
                        ${item.rawPrice && item.rawPrice !== item.formattedCadPrice ? `<span class="price-orig">(${escapeHtml(item.rawPrice)})</span>` : ''}
                        ${dealHtml}
                    </div>
                </td>
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
                        <th class="col-index">#</th>
                        <th class="col-title">Game</th>
                        <th class="col-stats">Details</th>
                        <th class="col-price">Price</th>
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

    const totalCountEl = document.getElementById(`total-count-${storeKey}`);
    if (totalCountEl) {
        totalCountEl.textContent = `(${selectedCount} of ${games.length} selected)`;
    }

    const headerChk = document.getElementById(`header-chk-${storeKey}`);
    if (headerChk) {
        headerChk.checked = selectedCount === games.length && games.length > 0;
        headerChk.indeterminate = selectedCount > 0 && selectedCount < games.length;
    }
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
