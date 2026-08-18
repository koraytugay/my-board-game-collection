let allGames = [];

async function initHistory() {
    const loadingEl = document.getElementById('loading');
    const contentEl = document.getElementById('history-content');
    const errorEl = document.getElementById('error');

    try {
        allGames = await getCollection(false);
        
        const now = new Date();
        const currentYear = now.getFullYear();
        const currentMonth = now.getMonth();
        
        const fetchPromises = [];
        const startYear = currentYear - 1;
        const totalMonthsToFetch = (currentYear - startYear) * 12 + currentMonth + 1;

        for (let i = 0; i < totalMonthsToFetch; i++) {
            const d = new Date(currentYear, currentMonth - i, 1);
            if (d.getFullYear() < startYear) break;
            fetchPromises.push(getPlaysForMonth(d.getFullYear(), d.getMonth()));
        }

        const monthlyPlayData = await Promise.all(fetchPromises);
        const flattenedPlays = monthlyPlayData.flat();
        
        processAndRender(flattenedPlays, currentYear, currentMonth);
        
        loadingEl.style.display = 'none';
        contentEl.style.display = 'block';
        loadDarkMode();

    } catch (error) {
        console.error('Error loading history:', error);
        loadingEl.style.display = 'none';
        errorEl.style.display = 'block';
        errorEl.textContent = 'Failed to load play history.';
    }
}

function processAndRender(plays, currentYear, currentMonth) {
    const gameTimeframes = {}; // gameId -> { timeframe, lastDate, name, id }
    
    // Sort plays by date descending so we find the "most recent" timeframe first
    plays.sort((a, b) => b.date.localeCompare(a.date));

    plays.forEach(play => {
        const playDate = new Date(play.date);
        const playYear = playDate.getFullYear();
        const playMonth = playDate.getMonth();
        const gameId = play.gameId;

        // Skip if we already assigned this game to its most recent timeframe
        if (gameTimeframes[gameId]) return;

        let timeframe = '';
        
        // 1. Within This Month (Current calendar month)
        if (playYear === currentYear && playMonth === currentMonth) {
            timeframe = 'this-month';
        } 
        // 2. Within This Year (Jan 1st to today, excluding current month)
        else if (playYear === currentYear) {
            timeframe = 'this-year';
        }
        // 3. Within Last Year (Previous calendar year)
        else if (playYear === currentYear - 1) {
            timeframe = 'last-year';
        }

        if (timeframe) {
            gameTimeframes[gameId] = {
                timeframe: timeframe,
                lastDate: play.date,
                name: play.gameName,
                id: gameId
            };
        }
    });

    // Bucket games by timeframe
    const buckets = {
        'this-month': [],
        'this-year': [],
        'last-year': []
    };

    Object.values(gameTimeframes).forEach(item => {
        buckets[item.timeframe].push(item);
    });

    // Render each bucket
    renderBucket('this-month-list', 'this-month-count', buckets['this-month']);
    renderBucket('this-year-list', 'this-year-count', buckets['this-year']);
    renderBucket('last-year-list', 'last-year-count', buckets['last-year']);
}



function formatDate(dateStr) {
    if (!dateStr) return '';
    const [year, month, day] = dateStr.split('-');
    if (!year || !month || !day) return dateStr;
    const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
    return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(date);
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

function renderBucket(containerId, countId, items) {
    const container = document.getElementById(containerId);
    const countEl = document.getElementById(countId);
    
    if (countEl) {
        countEl.textContent = `${items.length} ${items.length === 1 ? 'game' : 'games'}`;
    }

    // Sort from most recently played to least recently played
    items.sort((a, b) => b.lastDate.localeCompare(a.lastDate) || a.name.localeCompare(b.name));

    if (items.length === 0) {
        container.innerHTML = '<p class="empty-state">No plays recorded for this period.</p>';
        return;
    }

    container.innerHTML = items.map(item => {
        const gameData = allGames.find(g => g.objectId === item.id);
        const imageUrl = gameData ? (gameData.image || gameData.thumbnail) : '';
        const safeName = escapeHtml(item.name);
        const formattedDate = formatDate(item.lastDate);
        
        return `
            <div class="history-item" onclick="typeof showGameDetails === 'function' ? showGameDetails('${item.id}') : window.open('https://boardgamegeek.com/boardgame/${item.id}', '_blank')" title="${safeName} (Last played: ${formattedDate})">
                <img src="${imageUrl || 'https://via.placeholder.com/180x180?text=?'}" alt="${safeName}" class="history-item-img" loading="lazy">
                ${formattedDate ? `<div class="history-item-date-overlay">${formattedDate}</div>` : ''}
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

document.addEventListener('DOMContentLoaded', initHistory);
