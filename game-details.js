/**
 * Game Details Modal - Rich Game Inspector
 * Exposes window.showGameDetails(objectId)
 */

let gdCachedCollection = null;
let gdCachedDesigners = null;
let gdCachedPlays = null;
let gdCachedAvailability = null;

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
            fetch('availability.json').then(r => r.ok ? r.json() : {}).then(data => {
                gdCachedAvailability = data;
            }).catch(() => {
                gdCachedAvailability = {};
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
        const startYear = 2024;
        const fetchPromises = [];

        const totalMonths = (currentYear - startYear) * 12 + currentMonth + 1;
        for (let i = 0; i < totalMonths; i++) {
            const d = new Date(currentYear, currentMonth - i, 1);
            if (d.getFullYear() < startYear) break;
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
        backdrop.className = 'game-modal-backdrop';
        backdrop.innerHTML = `
            <div class="game-modal-container" role="dialog" aria-modal="true" aria-labelledby="modal-game-title">
                <button type="button" class="game-modal-close-btn" aria-label="Close modal">&times;</button>
                <div id="game-modal-body" class="game-modal-content">
                    <p style="text-align: center; color: #718096; padding: 40px 0;">Loading game details...</p>
                </div>
            </div>
        `;
        document.body.appendChild(backdrop);

        // Event listeners for closing
        const closeBtn = backdrop.querySelector('.game-modal-close-btn');
        closeBtn.addEventListener('click', closeGameDetails);

        backdrop.addEventListener('click', (e) => {
            if (e.target === backdrop) {
                closeGameDetails();
            }
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && backdrop.classList.contains('active')) {
                closeGameDetails();
            }
        });
    }
    return backdrop;
}

function closeGameDetails() {
    const backdrop = document.getElementById('game-details-modal');
    if (backdrop) {
        backdrop.classList.remove('active');
        document.body.style.overflow = '';
    }
}

function gdEscapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
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
    bodyEl.innerHTML = '<p style="text-align: center; color: #718096; padding: 40px 0;">Loading game details...</p>';
    backdrop.classList.add('active');
    document.body.style.overflow = 'hidden';

    await ensureDataLoaded();

    const game = gdCachedCollection.find(g => String(g.objectId) === String(objectId)) || {
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

    // Get Designers
    let designersList = [];
    if (gdCachedDesigners && gdCachedDesigners[objectId] && gdCachedDesigners[objectId].designers) {
        designersList = gdCachedDesigners[objectId].designers;
    }

    // Get Plays & Last Played date
    const plays = await fetchAllPlaysForGame(objectId);
    plays.sort((a, b) => b.date.localeCompare(a.date));

    let lastPlayedText = 'Never played';
    if (plays.length > 0) {
        lastPlayedText = gdFormatDate(plays[0].date);
    } else if (game.numPlays > 0) {
        lastPlayedText = `${game.numPlays} ${game.numPlays === 1 ? 'play' : 'plays'}`;
    }

    const safeName = gdEscapeHtml(game.name);
    const imageUrl = game.image || game.thumbnail || 'https://via.placeholder.com/300x300?text=No+Image';

    // Player range text
    let playersText = '—';
    if (game.minPlayers && game.maxPlayers) {
        playersText = game.minPlayers === game.maxPlayers 
            ? `${game.minPlayers} Players` 
            : `${game.minPlayers} - ${game.maxPlayers} Players`;
    }

    // Designers text
    const designersText = designersList.length > 0 ? designersList.join(', ') : '';

    // Availability from availability.json if any
    const avail = gdCachedAvailability ? gdCachedAvailability[objectId] : null;
    let storeChipsHtml = '';
    if (avail) {
        const storeNames = {
            boardGameBliss: 'BoardGameBliss',
            fourZeroOneGames: '401 Games',
            lvlUpGames: 'LVLUP Games',
            asDesJeux: 'As des Jeux',
            greatBoardgames: 'Great Boardgames',
            meeplemart: 'Meeplemart',
            amazonCa: 'Amazon',
            woodForSheep: 'Wood for Sheep',
            faceToFaceGames: 'Face to Face',
            obsidianGames: 'Obsidian Games',
            jjCards: 'J&J Cards',
            boardgamesCa: 'Boardgames.ca',
            screenFreeGames: 'Screen Free',
            allSystemsGo: 'All Systems Go',
            tabletopCafe: 'Tabletop Cafe',
            elevatedBoardGames: 'Elevated BG',
            buttonShyEtsy: 'Button Shy',
            zatu: 'Zatu Games'
        };

        Object.keys(storeNames).forEach(key => {
            const store = avail[key];
            if (store && store.available && store.url) {
                storeChipsHtml += `
                    <a href="${store.url}" target="_blank" class="store-chip" title="View on ${storeNames[key]}">
                        <span class="store-chip-name">${storeNames[key]}</span>
                        ${store.price ? `<span class="store-chip-price">${store.price}</span>` : ''}
                    </a>
                `;
            }
        });
    }

    // Build streamlined modal body with large cover art
    bodyEl.innerHTML = `
        <div class="game-modal-hero">
            <div class="game-modal-cover-wrap">
                <img src="${imageUrl}" alt="${safeName}" class="game-modal-cover">
            </div>
            <div class="game-modal-header-info">
                <h2 id="modal-game-title" class="game-modal-title">${safeName}</h2>
                <div class="game-modal-submeta">
                    ${game.yearPublished && game.yearPublished !== 'N/A' ? `<span>${game.yearPublished}</span>` : ''}
                    ${designersText ? `<span class="bullet">&bull;</span><span>${gdEscapeHtml(designersText)}</span>` : ''}
                </div>
            </div>
        </div>

        <div class="game-modal-stats-grid">
            <div class="game-modal-stat-card">
                <span class="game-modal-stat-label">My Rating</span>
                <span class="game-modal-stat-value">${game.myRating > 0 ? `${game.myRating.toFixed(1)} ★` : '—'}</span>
            </div>
            <div class="game-modal-stat-card">
                <span class="game-modal-stat-label">BGG Rating</span>
                <span class="game-modal-stat-value">${game.rating > 0 ? `${game.rating.toFixed(1)} ★` : '—'}</span>
            </div>
            <div class="game-modal-stat-card">
                <span class="game-modal-stat-label">Players</span>
                <span class="game-modal-stat-value">${playersText}</span>
            </div>
            <div class="game-modal-stat-card">
                <span class="game-modal-stat-label">Play Time</span>
                <span class="game-modal-stat-value">${game.playingTime > 0 ? `${game.playingTime} min` : '—'}</span>
            </div>
            <div class="game-modal-stat-card">
                <span class="game-modal-stat-label">Total Plays</span>
                <span class="game-modal-stat-value">${game.numPlays}</span>
            </div>
            <div class="game-modal-stat-card">
                <span class="game-modal-stat-label">Last Played</span>
                <span class="game-modal-stat-value" style="font-size: 0.96rem;">${lastPlayedText}</span>
            </div>
        </div>

        ${storeChipsHtml ? `
            <div class="game-modal-section">
                <h3 class="game-modal-section-title">Store Availability</h3>
                <div class="game-modal-stores">
                    ${storeChipsHtml}
                </div>
            </div>
        ` : ''}

        <div class="game-modal-footer">
            <a href="https://boardgamegeek.com/boardgame/${game.objectId}" target="_blank" rel="noopener noreferrer" class="game-modal-bgg-link">
                View on BoardGameGeek &nearr;
            </a>
            <button type="button" class="game-modal-secondary-btn" onclick="closeGameDetails()">Close</button>
        </div>
    `;
}

// Attach to window
window.showGameDetails = showGameDetails;
window.closeGameDetails = closeGameDetails;
