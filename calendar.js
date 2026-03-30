let allPlays = [];
let allGames = [];
let currentDate = new Date();

async function initCalendar() {
    const loadingEl = document.getElementById('loading');
    const contentEl = document.getElementById('calendar-content');
    const errorEl = document.getElementById('error');

    try {
        // Fetch collection once
        allGames = await getCollection();
        
        loadingEl.style.display = 'none';
        contentEl.style.display = 'block';
        
        loadDarkMode();
        
        // Initial render with current month data
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
    
    // Fetch only the file for the month we are looking at
    allPlays = await getPlaysForMonth(year, month);
    renderCalendar();
}

function renderCalendar() {
    const gridEl = document.getElementById('calendar-grid');
    const monthDisplay = document.getElementById('current-month-display');
    
    // Clear existing days (keep labels)
    const labels = gridEl.querySelectorAll('.calendar-day-label');
    gridEl.innerHTML = '';
    labels.forEach(label => gridEl.appendChild(label));

    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    
    monthDisplay.textContent = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(currentDate);

    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    
    const startDay = new Date(firstDay);
    startDay.setDate(firstDay.getDate() - firstDay.getDay());

    const endDay = new Date(lastDay);
    if (endDay.getDay() < 6) {
        endDay.setDate(lastDay.getDate() + (6 - lastDay.getDay()));
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
            const playsContainer = document.createElement('div');
            playsContainer.className = 'calendar-plays-container';
            
            dayPlays.forEach(play => {
                const gameData = allGames.find(g => g.objectId === play.gameId);
                const playEl = document.createElement('div');
                playEl.className = 'play-thumbnail-entry';
                
                if (gameData && gameData.thumbnail) {
                    playEl.innerHTML = `
                        <img src="${gameData.thumbnail}" alt="${play.gameName}" title="${play.gameName}${play.quantity > 1 ? ` (x${play.quantity})` : ''}">
                    `;
                } else {
                    playEl.className = 'play-entry';
                    playEl.textContent = play.gameName;
                }
                
                playEl.onclick = () => window.open(`https://boardgamegeek.com/boardgame/${play.gameId}`, '_blank');
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
