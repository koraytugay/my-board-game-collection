/**
 * Game Details Modal - Rich Game Inspector
 * Exposes window.showGameDetails(objectId)
 */

let gdCachedCollection = null;
let gdCachedDesigners = null;
let gdCachedPlays = null;
let gdCachedAvailability = null;
let gdCachedBestAt = null;

async function ensureDataLoaded() {
    const promises = [];

    if (!gdCachedCollection) {
        promises.push(
            getCollection(false).then(games => {
                gdCachedCollection = games;
            }).catch(err => {
                console.warn('Could not load collection for modal:', err);
                gdCachedCollection = [];
            })
        );
    }

    if (!gdCachedDesigners) {
        promises.push(
            fetch('designers.json').then(r => r.ok ? r.json() : {}).then(data => {
                gdCachedDesigners = data;
            }).catch(() => {
                gdCachedDesigners = {};
            })
        );
    }

    if (!gdCachedAvailability) {
        promises.push(
            Promise.all([
                loadAvailabilityFile('availability.json'),
                loadAvailabilityFile('availability-liketohave.json')
            ]).then(([avail, likeAvail]) => {
                gdCachedAvailability = { ...likeAvail, ...avail };
            })
        );
    }

    if (!gdCachedBestAt) {
        promises.push(
            fetch('best-at.json').then(r => r.ok ? r.json() : {}).then(data => {
                gdCachedBestAt = data;
            }).catch(() => {
                gdCachedBestAt = {};
            })
        );
    }

    await Promise.all(promises);
}

async function fetchAllPlaysForGame(gameId) {
    if (gdCachedPlays) {
        return gdCachedPlays.filter(p => String(p.gameId) === String(gameId));
    }

    try {
        const now = new Date();
        const currentYear = now.getFullYear();
        const currentMonth = now.getMonth();
        // Play archives in plays/ start from September 2025 (2025-09.xml)
        const earliestYear = 2025;
        const earliestMonth = 8; // 0-indexed September
        const fetchPromises = [];

        const totalMonths = (currentYear - earliestYear) * 12 + (currentMonth - earliestMonth) + 1;
        for (let i = 0; i < totalMonths; i++) {
            const d = new Date(currentYear, currentMonth - i, 1);
            if (d.getFullYear() < earliestYear || (d.getFullYear() === earliestYear && d.getMonth() < earliestMonth)) break;
            fetchPromises.push(getPlaysForMonth(d.getFullYear(), d.getMonth()));
        }

        const allMonthly = await Promise.all(fetchPromises);
        gdCachedPlays = allMonthly.flat();
        return gdCachedPlays.filter(p => String(p.gameId) === String(gameId));
    } catch (e) {
        console.warn('Could not load plays for game:', e);
        return [];
    }
}

function ensureModalContainer() {
    let backdrop = document.getElementById('game-details-modal');
    if (!backdrop) {
        backdrop = document.createElement('div');
        backdrop.id = 'game-details-modal';
        backdrop.className = 'kt-modal kt-modal--lg';
        backdrop.setAttribute('role', 'dialog');
        backdrop.setAttribute('aria-modal', 'true');
        backdrop.setAttribute('aria-labelledby', 'modal-game-title');
        backdrop.innerHTML = `
            <div class="kt-modal__dialog">
                <button type="button" class="kt-btn kt-btn--ghost kt-btn--icon kt-modal__close" aria-label="Close">✕</button>
                <div id="game-modal-body"><div class="kt-modal__body"><div class="kt-loading"><div class="kt-spinner"></div>Loading game details...</div></div></div>
            </div>
        `;
        document.body.appendChild(backdrop);

        // Event listeners for closing
        const closeBtn = backdrop.querySelector('.kt-modal__close');
        closeBtn.addEventListener('click', closeGameDetails);

        backdrop.addEventListener('click', (e) => {
            if (e.target === backdrop) {
                closeGameDetails();
            }
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && backdrop.classList.contains('is-open')) {
                closeGameDetails();
            }
        });
    }
    return backdrop;
}

function closeGameDetails() {
    const backdrop = document.getElementById('game-details-modal');
    if (backdrop) {
        backdrop.classList.remove('is-open');
    }
}

function gdFormatDate(dateStr) {
    if (!dateStr) return '';
    const [year, month, day] = dateStr.split('-');
    if (!year || !month || !day) return dateStr;
    const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
    return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(date);
}

async function showGameDetails(objectId) {
    const backdrop = ensureModalContainer();
    const bodyEl = document.getElementById('game-modal-body');

    // Show modal in loading state
    bodyEl.innerHTML = '<div class="kt-modal__body"><div class="kt-loading"><div class="kt-spinner"></div>Loading game details...</div></div>';
    backdrop.classList.add('is-open');

    await ensureDataLoaded();

    let game = gdCachedCollection.find(g => String(g.objectId) === String(objectId));
    if (!game && typeof allGames !== 'undefined' && Array.isArray(allGames)) {
        game = allGames.find(g => String(g.objectId) === String(objectId));
    }
    if (!game) {
        game = {
            objectId: objectId,
            name: 'Game Details',
            yearPublished: '',
            image: '',
            thumbnail: '',
            minPlayers: 0,
            maxPlayers: 0,
            playingTime: 0,
            numPlays: 0,
            rating: 0,
            myRating: 0
        };
    }

    // Get Designers
    let designersList = [];
    if (gdCachedDesigners && gdCachedDesigners[objectId] && gdCachedDesigners[objectId].designers) {
        designersList = gdCachedDesigners[objectId].designers;
    }

    // Get Plays & Last Played date (skip fetch if the game has 0 plays)
    let lastPlayedText = 'Never played';
    if (game.numPlays > 0) {
        const plays = await fetchAllPlaysForGame(objectId);
        plays.sort((a, b) => b.date.localeCompare(a.date));

        if (plays.length > 0) {
            lastPlayedText = gdFormatDate(plays[0].date);
        } else {
            lastPlayedText = `${game.numPlays} ${game.numPlays === 1 ? 'play' : 'plays'}`;
        }
    }

    const safeName = escapeHtml(game.name);
    const imageUrl = game.image || game.thumbnail || 'https://via.placeholder.com/300x300?text=No+Image';

    // Player range text
    let playersText = '—';
    if (game.minPlayers && game.maxPlayers) {
        playersText = game.minPlayers === game.maxPlayers 
            ? `${game.minPlayers} Players` 
            : `${game.minPlayers} - ${game.maxPlayers} Players`;
    }

    // Best At player count
    let bestAtList = [];
    if (gdCachedBestAt && gdCachedBestAt[objectId] && Array.isArray(gdCachedBestAt[objectId].bestAt)) {
        bestAtList = gdCachedBestAt[objectId].bestAt;
    } else if (Array.isArray(game.bestAt)) {
        bestAtList = game.bestAt;
    }

    // Designers text
    const designersText = designersList.length > 0 ? designersList.join(', ') : '';

    // Availability from availability.json if any
    const avail = gdCachedAvailability ? gdCachedAvailability[objectId] : null;
    let storeChipsHtml = '';
    if (avail) {
        const storeNames = Object.fromEntries(
            STORE_REGISTRY
                .filter(store => store.key !== 'bggMarket')
                .map(store => [store.key, store.shortLabel || getStoreLabel(store)])
        );

        Object.keys(storeNames).forEach(key => {
            const store = avail[key];
            if (store && store.available && store.url) {
                const priceFormatted = typeof formatPrice === 'function' ? formatPrice(store.price, key) : store.price;
                storeChipsHtml += `
                    <a href="${store.url}" target="_blank" class="kt-chip" title="View on ${storeNames[key]}">
                        <span class="kt-truncate">${storeNames[key]}</span>
                        ${priceFormatted ? `<strong class="kt-ml-auto">${priceFormatted}</strong>` : ''}
                    </a>
                `;
            }
        });

        if (avail.bggMarket) {
            const mkt = avail.bggMarket;
            const listings = Array.isArray(mkt.listings) && mkt.listings.length > 0
                ? mkt.listings
                : (mkt.available && mkt.url ? [mkt] : []);
            listings.forEach(l => {
                if (l && !l.ignored && l.url) {
                    const priceFormatted = typeof formatPrice === 'function' ? formatPrice(l.price, 'bggMarket') : l.price;
                    const sellerLabel = l.seller ? `🏷️ BGG Market (${l.seller})` : '🏷️ BGG Market';
                    storeChipsHtml += `
                        <a href="${l.url}" target="_blank" class="kt-chip" title="View BGG Market listing">
                            <span class="kt-truncate">${escapeHtml(sellerLabel)}</span>
                            ${priceFormatted ? `<strong class="kt-ml-auto">${priceFormatted}</strong>` : ''}
                        </a>
                    `;
                }
            });
        }
    }

    const subtitle = [
        game.yearPublished && game.yearPublished !== 'N/A' ? game.yearPublished : '',
        designersText ? escapeHtml(designersText) : ''
    ].filter(Boolean).join(' · ');

    // Header, cover beside the key numbers, store links, actions
    bodyEl.innerHTML = `
        <div class="kt-modal__header" style="padding-right: 56px">
            <div class="kt-stack" style="--kt-gap: 2px">
                <h2 id="modal-game-title" class="kt-modal__title kt-fs-lg">${safeName}</h2>
                ${subtitle ? `<div class="kt-fs-sm kt-text-secondary">${subtitle}</div>` : ''}
            </div>
        </div>

        <div class="kt-modal__body">
            <div class="kt-cluster" style="align-items: flex-start; --kt-gap: 20px">
                <div class="kt-thumb" style="--kt-thumb-size: 180px">
                    <img src="${imageUrl}" alt="${safeName}">
                </div>
                <div class="kt-grid" style="flex: 1 1 300px; --kt-grid-min: 140px; --kt-grid-gap: 10px">
                    <div class="kt-stat kt-stat--inset">
                        <div class="kt-stat__label">My Rating</div>
                        <div class="kt-stat__value">${game.myRating > 0 ? `${game.myRating.toFixed(1)} ★` : '—'}</div>
                    </div>
                    <div class="kt-stat kt-stat--inset">
                        <div class="kt-stat__label">BGG Rating</div>
                        <div class="kt-stat__value">${game.rating > 0 ? `${game.rating.toFixed(1)} ★` : '—'}</div>
                    </div>
                    <div class="kt-stat kt-stat--inset">
                        <div class="kt-stat__label">Players</div>
                        <div class="kt-stat__value">${playersText}</div>${bestAtList.length > 0 ? `
                        <div class="kt-stat__sub">Best: ${escapeHtml(bestAtList.join(', '))}</div>` : ''}
                    </div>
                    <div class="kt-stat kt-stat--inset">
                        <div class="kt-stat__label">Play Time</div>
                        <div class="kt-stat__value">${game.playingTime > 0 ? `${game.playingTime} min` : '—'}</div>
                    </div>
                    <div class="kt-stat kt-stat--inset">
                        <div class="kt-stat__label">Total Plays</div>
                        <div class="kt-stat__value">${game.numPlays}</div>
                    </div>
                    <div class="kt-stat kt-stat--inset">
                        <div class="kt-stat__label">Last Played</div>
                        <div class="kt-stat__value">${lastPlayedText}</div>
                    </div>
                </div>
            </div>

            ${storeChipsHtml ? `
                <h3 class="kt-eyebrow kt-mt-5 kt-mb-2">Store Availability</h3>
                <div class="kt-grid" style="--kt-grid-min: 220px; --kt-grid-gap: 6px">
                    ${storeChipsHtml}
                </div>
            ` : ''}
        </div>

        <div class="kt-modal__footer">
            <button type="button" class="kt-btn" onclick="closeGameDetails()">Close</button>
            <a href="https://boardgamegeek.com/boardgame/${game.objectId}" target="_blank" rel="noopener noreferrer" class="kt-btn kt-btn--primary">
                View on BoardGameGeek &nearr;
            </a>
        </div>
    `;
}

// Attach to window
window.showGameDetails = showGameDetails;
window.closeGameDetails = closeGameDetails;
