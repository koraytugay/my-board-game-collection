let allPlays = [];
let currentDate = new Date();

async function initCalendar() {
    const loadingEl = document.getElementById('loading');
    const contentEl = document.getElementById('calendar-content');
    const errorEl = document.getElementById('error');

    try {
        allPlays = await getPlays();
        loadingEl.style.display = 'none';
        contentEl.style.display = 'block';
        
        loadDarkMode();
        renderCalendar();
        
        document.getElementById('prev-month').addEventListener('click', () => {
            currentDate.setMonth(currentDate.getMonth() - 1);
            renderCalendar();
        });
        
        document.getElementById('next-month').addEventListener('click', () => {
            currentDate.setMonth(currentDate.getMonth() + 1);
            renderCalendar();
        });

    } catch (error) {
        console.error('Error loading calendar:', error);
        loadingEl.style.display = 'none';
        errorEl.style.display = 'block';
        errorEl.textContent = 'Failed to load play data.';
    }
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

    // First day of month
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    
    // Start of grid (may include days from prev month)
    const startDay = new Date(firstDay);
    startDay.setDate(firstDay.getDate() - firstDay.getDay());

    // End of grid (may include days from next month)
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
        
        const dateStr = loopDay.toISOString().split('T')[0];
        
        dayEl.innerHTML = `<span class="day-number">${loopDay.getDate()}</span>`;
        
        const dayPlays = allPlays.filter(p => p.date === dateStr);
        dayPlays.forEach(play => {
            const playEl = document.createElement('div');
            playEl.className = 'play-entry';
            playEl.textContent = play.gameName + (play.quantity > 1 ? ` (x${play.quantity})` : '');
            playEl.title = `${play.gameName}\nLocation: ${play.location || 'N/A'}`;
            playEl.onclick = () => window.open(`https://boardgamegeek.com/boardgame/${play.gameId}`, '_blank');
            dayEl.appendChild(playEl);
        });

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
