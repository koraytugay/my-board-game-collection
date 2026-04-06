let allGames = [];
let monthlyPlayData = []; // Array of monthly play arrays

async function initHistory() {
    const loadingEl = document.getElementById('loading');
    const contentEl = document.getElementById('history-content');
    const errorEl = document.getElementById('error');

    try {
        allGames = await getCollection(false); // Include all for historical plays
        
        const now = new Date();
        const fetchPromises = [];

        // Fetch last 12 months of plays
        for (let i = 0; i < 12; i++) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            fetchPromises.push(getPlaysForMonth(d.getFullYear(), d.getMonth()));
        }

        monthlyPlayData = await Promise.all(fetchPromises);
        
        // This Month
        renderGroup('this-month-list', [monthlyPlayData[0]]);
        
        // Last Month
        renderGroup('last-month-list', [monthlyPlayData[1]]);
        
        // Last 6 Months
        renderGroup('last-6-months-list', monthlyPlayData.slice(0, 6));
        
        // Last Year (12 months)
        renderGroup('last-year-list', monthlyPlayData.slice(0, 12));
        
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

function renderGroup(containerId, monthsData) {
    const container = document.getElementById(containerId);
    
    // Aggregate by gameId
    const aggregated = {};
    monthsData.forEach(month => {
        month.forEach(play => {
            const id = play.gameId;
            if (!aggregated[id]) {
                aggregated[id] = {
                    name: play.gameName,
                    id: play.gameId,
                    count: 0,
                    lastDate: play.date
                };
            }
            aggregated[id].count += play.quantity;
            if (play.date > aggregated[id].lastDate) {
                aggregated[id].lastDate = play.date;
            }
        });
    });

    const items = Object.values(aggregated).sort((a, b) => b.count - a.count);

    if (items.length === 0) {
        container.innerHTML = '<p class="empty-state">No plays recorded for this period.</p>';
        return;
    }

    container.innerHTML = items.map(item => {
        const gameData = allGames.find(g => g.objectId === item.id);
        const thumbnail = gameData ? gameData.thumbnail : '';
        
        return `
            <div class="history-item" onclick="window.open('https://boardgamegeek.com/boardgame/${item.id}', '_blank')">
                <img src="${thumbnail || 'https://via.placeholder.com/180x180?text=?'}" alt="${item.name}" class="history-item-img">
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
