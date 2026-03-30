let allPlays = [];
let allGames = [];
let currentDate = new Date();

async function initCalendar() {
    const loadingEl = document.getElementById('loading');
    const contentEl = document.getElementById('calendar-content');
    const errorEl = document.getElementById('error');

    try {
        allGames = await getCollection();
        
        loadingEl.style.display = 'none';
        contentEl.style.display = 'block';
        
        loadDarkMode();
        await updateMonthData();
        
        document.getElementById('prev-month').addEventListener('click', async () => {
            currentDate.setMonth(currentDate.getMonth() - 1);
            await updateMonthData();
        });
        
        document.getElementById('next-month').addEventListener('click', async () => {
            currentDate.setMonth(currentDate.getMonth() + 1);
            await updateMonthData();
        });

    } catch (error) {
        console.error('Error loading calendar:', error);
        loadingEl.style.display = 'none';
        errorEl.style.display = 'block';
        errorEl.textContent = 'Failed to load initial data.';
    }
}

async function updateMonthData() {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    allPlays = await getPlaysForMonth(year, month);
    renderCalendar();
}

function renderCalendar() {
    const gridEl = document.getElementById('calendar-grid');
    const monthDisplay = document.getElementById('current-month-display');
    
    const labels = gridEl.querySelectorAll('.calendar-day-label');
    gridEl.innerHTML = '';
    labels.forEach(label => gridEl.appendChild(label));

    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    
    monthDisplay.textContent = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(currentDate);

    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    
    // Adjust for Monday start (0=Sun, 1=Mon, ..., 6=Sat)
    // Convert: Sun(0)->6, Mon(1)->0, Tue(2)->1, ..., Sat(6)->5
    let startOffset = firstDay.getDay() - 1;
    if (startOffset === -1) startOffset = 6;

    const startDay = new Date(firstDay);
    startDay.setDate(firstDay.getDate() - startOffset);

    // End of grid (ensuring a full week)
    let endOffset = 7 - lastDay.getDay();
    if (lastDay.getDay() === 0) endOffset = 0; // Already Sun

    const endDay = new Date(lastDay);
    if (endOffset > 0 && endOffset < 7) {
        endDay.setDate(lastDay.getDate() + endOffset);
    }

    let loopDay = new Date(startDay);
    const today = new Date();

    while (loopDay <= endDay) {
        const dayEl = document.createElement('div');
        dayEl.className = 'calendar-day';
        if (loopDay.getMonth() !== month) dayEl.classList.add('other-month');
        if (loopDay.toDateString() === today.toDateString()) dayEl.classList.add('today');
        
        const yearStr = loopDay.getFullYear();
        const monthStr = String(loopDay.getMonth() + 1).padStart(2, '0');
        const dayStr = String(loopDay.getDate()).padStart(2, '0');
        const dateStr = `${yearStr}-${monthStr}-${dayStr}`;
        
        dayEl.innerHTML = `<span class="day-number">${loopDay.getDate()}</span>`;
        
        const dayPlays = allPlays.filter(p => p.date === dateStr);
        
        if (dayPlays.length > 0) {
            // Aggregate plays by gameId
            const aggregated = {};
            dayPlays.forEach(play => {
                const id = play.gameId;
                if (!aggregated[id]) {
                    aggregated[id] = {
                        name: play.gameName,
                        id: play.gameId,
                        count: 0
                    };
                }
                aggregated[id].count += play.quantity;
            });

            const playsContainer = document.createElement('div');
            playsContainer.className = 'calendar-plays-container';
            
            Object.values(aggregated).forEach(entry => {
                const gameData = allGames.find(g => g.objectId === entry.id);
                const playEl = document.createElement('div');
                playEl.className = 'play-thumbnail-entry';
                
                let imgHtml = '';
                if (gameData && gameData.thumbnail) {
                    imgHtml = `<img src="${gameData.thumbnail}" alt="${entry.name}">`;
                } else {
                    // Fallback for games not in collection
                    imgHtml = `<div class="play-placeholder-img"><span>?</span></div>`;
                }

                playEl.innerHTML = `
                    <div class="thumbnail-wrapper">
                        ${imgHtml}
                        ${entry.count > 1 ? `<span class="play-count-badge">x${entry.count}</span>` : ''}
                    </div>
                    <span class="game-name-tooltip">${entry.name}</span>
                `;
                
                playEl.onclick = () => window.open(`https://boardgamegeek.com/boardgame/${entry.id}`, '_blank');
                playsContainer.appendChild(playEl);
            });
            dayEl.appendChild(playsContainer);
        }

        gridEl.appendChild(dayEl);
        loopDay.setDate(loopDay.getDate() + 1);
    }
}

function loadDarkMode() {
    const isDark = localStorage.getItem('darkMode') === 'true';
    if (isDark) {
        document.body.classList.add('dark-mode');
    }
}

document.addEventListener('DOMContentLoaded', initCalendar);
