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
        
        // We need to fetch enough months to cover:
        // 1. This Month
        // 2. This 6 Months (current month + 5 previous)
        // 3. This Year (all months of currentYear)
        // 4. Last Year (all months of currentYear - 1)
        
        // To cover all of last year and this year, we fetch everything from 
        // Jan 1 of (currentYear - 1) to (currentYear, currentMonth).
        
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
    const gameTimeframes = {}; // gameId -> { timeframe, count, lastDate }
    
    // Sort plays by date descending so we find the "most recent" timeframe first
    plays.sort((a, b) => b.date.localeCompare(a.date));

    plays.forEach(play => {
        const playDate = new Date(play.date);
        const playYear = playDate.getFullYear();
        const playMonth = playDate.getMonth();
        const gameId = play.gameId;

        let timeframe = '';
        
        // Within This Month
        if (playYear === currentYear && playMonth === currentMonth) {
            timeframe = 'this-month';
        } 
        // Within This 6 Months (excluding this month)
        else if (isWithinLastNMonths(playDate, 6)) {
            timeframe = 'this-6-months';
        }
        // Within This Year (excluding above)
        else if (playYear === currentYear) {
            timeframe = 'this-year';
        }
        // Within Last Year
        else if (playYear === currentYear - 1) {
            timeframe = 'last-year';
        }

        if (timeframe) {
            if (!gameTimeframes[gameId]) {
                gameTimeframes[gameId] = {
                    timeframe: timeframe,
                    count: 0,
                    lastDate: play.date,
                    name: play.gameName,
                    id: gameId
                };
            }
            
            // Only add plays if they are within the ALREADY ASSIGNED timeframe for this game
            // (Since we process plays desc, the first timeframe matched is the "most recent" one)
            if (gameTimeframes[gameId].timeframe === timeframe) {
                gameTimeframes[gameId].count += play.quantity;
                if (play.date > gameTimeframes[gameId].lastDate) {
                    gameTimeframes[gameId].lastDate = play.date;
                }
            }
        }
    });

    // Bucket games by timeframe
    const buckets = {
        'this-month': [],
        'this-6-months': [],
        'this-year': [],
        'last-year': []
    };

    Object.values(gameTimeframes).forEach(item => {
        buckets[item.timeframe].push(item);
    });

    // Render each bucket
    renderBucket('this-month-list', buckets['this-month']);
    renderBucket('this-6-months-list', buckets['this-6-months']);
    renderBucket('this-year-list', buckets['this-year']);
    renderBucket('last-year-list', buckets['last-year']);
}

function isWithinLastNMonths(date, n) {
    const now = new Date();
    const threshold = new Date(now.getFullYear(), now.getMonth() - n + 1, 1);
    return date >= threshold;
}

function renderBucket(containerId, items) {
    const container = document.getElementById(containerId);
    items.sort((a, b) => b.count - a.count);

    if (items.length === 0) {
        container.innerHTML = '<p class="empty-state">No plays recorded for this period.</p>';
        return;
    }

    container.innerHTML = items.map(item => {
        const gameData = allGames.find(g => g.objectId === item.id);
        // Use high quality image if available
        const imageUrl = gameData ? (gameData.image || gameData.thumbnail) : '';
        
        return `
            <div class="history-item" onclick="window.open('https://boardgamegeek.com/boardgame/${item.id}', '_blank')">
                <img src="${imageUrl || 'https://via.placeholder.com/180x180?text=?'}" alt="${item.name}" class="history-item-img">
                <div class="history-item-plays">
                    <span class="plays-number">${item.count}</span>
                    <span class="plays-label">plays</span>
                </div>
                <div class="history-item-info">
                    <h3>${item.name}</h3>
                    <p>Last: ${item.lastDate}</p>
                </div>
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
