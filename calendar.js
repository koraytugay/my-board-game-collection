let allPlays = [];
let allGames = [];
let currentDate = new Date();
async function initCalendar() {
    const loadingEl = document.getElementById('loading');
    const contentEl = document.getElementById('calendar-content');
    const errorEl = document.getElementById('error');

    try {
        // Set to 1st of the month to avoid overflow bugs (e.g., March 30 -> Feb 30 becomes March 2)
        currentDate.setDate(1);

        // Fetch collection once, including unowned games for thumbnails
        allGames = await getCollection(false);
        
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
    
    const labels = gridEl.querySelectorAll('.kt-calendar__weekday');
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
        dayEl.className = 'kt-calendar__day';
        if (loopDay.getMonth() !== month) dayEl.classList.add('is-outside');
        if (loopDay.toDateString() === today.toDateString()) dayEl.classList.add('is-today');
        
        const yearStr = loopDay.getFullYear();
        const monthStr = String(loopDay.getMonth() + 1).padStart(2, '0');
        const dayStr = String(loopDay.getDate()).padStart(2, '0');
        const dateStr = `${yearStr}-${monthStr}-${dayStr}`;
        
        dayEl.innerHTML = `<div class="kt-calendar__date">${loopDay.getDate()}</div>`;
        
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

            Object.values(aggregated).forEach(entry => {
                const gameData = allGames.find(g => g.objectId === entry.id);
                const imgSrc = gameData ? (gameData.thumbnail || gameData.image) : '';
                const playEl = document.createElement('button');
                playEl.type = 'button';
                playEl.className = 'kt-thumb kt-thumb--md kt-tooltip';
                playEl.dataset.tooltip = entry.name;
                playEl.setAttribute('aria-label', entry.name);
                playEl.innerHTML = `
                    ${imgSrc
                        ? `<img src="${imgSrc}" alt="${escapeHtml(entry.name)}" loading="lazy">`
                        : '<div class="kt-media-placeholder"></div>'}
                    ${entry.count > 1 ? `<span class="kt-thumb__corner">×${entry.count}</span>` : ''}
                `;
                playEl.onclick = () => {
                    if (typeof showGameDetails === 'function') {
                        showGameDetails(entry.id);
                    } else {
                        window.open(`https://boardgamegeek.com/boardgame/${entry.id}`, '_blank');
                    }
                };
                dayEl.appendChild(playEl);
            });
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
