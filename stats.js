const COLLECTION_XML_FILE = 'https://raw.githubusercontent.com/koraytugay/my-board-game-collection/refs/heads/main/collection.xml';

let allGames = [];

async function fetchCollection() {
    const loadingEl = document.getElementById('loading');
    const errorEl = document.getElementById('error');
    const statsContentEl = document.getElementById('stats-content');

    try {
        const response = await fetch(COLLECTION_XML_FILE);

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const xmlText = await response.text();
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlText, 'text/xml');

        const errorNode = xmlDoc.querySelector('parsererror');
        if (errorNode) {
            throw new Error('Error parsing XML response');
        }

        const items = xmlDoc.querySelectorAll('item');

        if (items.length === 0) {
            throw new Error('No games found in collection');
        }

        const games = Array.from(items).map(item => {
            const name = item.querySelector('name')?.textContent || 'Unknown Game';
            const yearPublished = item.querySelector('yearpublished')?.textContent || 'N/A';
            const minPlayers = item.querySelector('stats')?.getAttribute('minplayers') || '?';
            const maxPlayers = item.querySelector('stats')?.getAttribute('maxplayers') || '?';
            const playingTime = item.querySelector('stats')?.getAttribute('playingtime') || '?';
            const numPlays = item.querySelector('numplays')?.textContent || '0';
            const ratingValue = item.querySelector('stats rating average')?.getAttribute('value') || '0';
            const rating = parseFloat(ratingValue);
            const myRatingValue = item.querySelector('stats rating')?.getAttribute('value') || '0';
            const myRating = parseFloat(myRatingValue);

            return {
                name,
                yearPublished,
                minPlayers,
                maxPlayers,
                playingTime: parseInt(playingTime) || 0,
                numPlays: parseInt(numPlays),
                rating,
                myRating
            };
        });

        allGames = games;

        calculateStatistics();
        drawCharts();

        loadingEl.style.display = 'none';
        statsContentEl.style.display = 'block';

    } catch (error) {
        console.error('Error fetching collection:', error);
        loadingEl.style.display = 'none';
        errorEl.style.display = 'block';
        errorEl.textContent = `Failed to load collection: ${error.message}`;
    }
}

function calculateStatistics() {
    // Basic stats
    const totalGames = allGames.length;
    const totalPlays = allGames.reduce((sum, game) => sum + game.numPlays, 0);

    const validRatings = allGames.filter(g => g.rating > 0);
    const avgRating = validRatings.length > 0
        ? validRatings.reduce((sum, game) => sum + game.rating, 0) / validRatings.length
        : 0;

    const validMyRatings = allGames.filter(g => g.myRating > 0);
    const avgMyRating = validMyRatings.length > 0
        ? validMyRatings.reduce((sum, game) => sum + game.myRating, 0) / validMyRatings.length
        : 0;

    const validPlayTimes = allGames.filter(g => g.playingTime > 0);
    const avgPlayTime = validPlayTimes.length > 0
        ? Math.round(validPlayTimes.reduce((sum, game) => sum + game.playingTime, 0) / validPlayTimes.length)
        : 0;

    const mostPlayed = allGames.reduce((max, game) =>
        game.numPlays > max.numPlays ? game : max
    , allGames[0]);

    // Additional insights
    const soloGames = allGames.filter(g => g.minPlayers === '1').length;
    const unplayedGames = allGames.filter(g => g.numPlays === 0).length;
    const highRatedGames = allGames.filter(g => g.rating >= 7.5).length;
    const recentGames = allGames.filter(g => {
        const year = parseInt(g.yearPublished);
        return !isNaN(year) && year >= 2020;
    }).length;

    // Update DOM
    document.getElementById('total-games').textContent = totalGames;
    document.getElementById('total-plays').textContent = totalPlays;
    document.getElementById('avg-rating').textContent = avgRating.toFixed(2);
    document.getElementById('avg-my-rating').textContent = avgMyRating > 0 ? avgMyRating.toFixed(2) : 'N/A';
    document.getElementById('avg-playtime').textContent = avgPlayTime;
    document.getElementById('most-played-name').textContent = mostPlayed.name;

    document.getElementById('solo-games-count').textContent = soloGames;
    document.getElementById('unplayed-count').textContent = unplayedGames;
    document.getElementById('high-rated-count').textContent = highRatedGames;
    document.getElementById('recent-games-count').textContent = recentGames;
}

function drawCharts() {
    drawYearChart();
    drawPlayerCountChart();
    drawPlayTimeChart();
    drawRatingChart();
    drawMostPlayedChart();
}

function drawYearChart() {
    const canvas = document.getElementById('year-chart');
    const ctx = canvas.getContext('2d');

    // Set canvas size
    const containerWidth = canvas.parentElement.clientWidth;
    canvas.width = containerWidth;
    canvas.height = 400;

    // Group games by decade
    const decades = {};
    allGames.forEach(game => {
        const year = parseInt(game.yearPublished);
        if (!isNaN(year)) {
            const decade = Math.floor(year / 10) * 10;
            decades[decade] = (decades[decade] || 0) + 1;
        }
    });

    const sortedDecades = Object.keys(decades).sort((a, b) => a - b);
    const values = sortedDecades.map(d => decades[d]);
    const maxValue = Math.max(...values);

    drawBarChart(ctx, canvas, sortedDecades.map(d => `${d}s`), values, maxValue, '#4CAF50');
}

function drawPlayerCountChart() {
    const canvas = document.getElementById('player-chart');
    const ctx = canvas.getContext('2d');

    const containerWidth = canvas.parentElement.clientWidth;
    canvas.width = containerWidth;
    canvas.height = 400;

    // Count games by minimum player count
    const playerCounts = {};
    allGames.forEach(game => {
        const min = game.minPlayers;
        if (min !== '?') {
            playerCounts[min] = (playerCounts[min] || 0) + 1;
        }
    });

    const sortedCounts = Object.keys(playerCounts).sort((a, b) => parseInt(a) - parseInt(b));
    const values = sortedCounts.map(c => playerCounts[c]);
    const maxValue = Math.max(...values);

    drawBarChart(ctx, canvas, sortedCounts.map(c => `${c}+`), values, maxValue, '#2196F3');
}

function drawPlayTimeChart() {
    const canvas = document.getElementById('playtime-chart');
    const ctx = canvas.getContext('2d');

    const containerWidth = canvas.parentElement.clientWidth;
    canvas.width = containerWidth;
    canvas.height = 400;

    // Group by play time ranges
    const ranges = {
        '0-30': 0,
        '31-60': 0,
        '61-90': 0,
        '91-120': 0,
        '121-180': 0,
        '180+': 0
    };

    allGames.forEach(game => {
        const time = game.playingTime;
        if (time <= 30) ranges['0-30']++;
        else if (time <= 60) ranges['31-60']++;
        else if (time <= 90) ranges['61-90']++;
        else if (time <= 120) ranges['91-120']++;
        else if (time <= 180) ranges['121-180']++;
        else ranges['180+']++;
    });

    const labels = Object.keys(ranges);
    const values = Object.values(ranges);
    const maxValue = Math.max(...values);

    drawBarChart(ctx, canvas, labels, values, maxValue, '#FF9800');
}

function drawRatingChart() {
    const canvas = document.getElementById('rating-chart');
    const ctx = canvas.getContext('2d');

    const containerWidth = canvas.parentElement.clientWidth;
    canvas.width = containerWidth;
    canvas.height = 400;

    // Group by rating ranges
    const ranges = {
        '0-5.0': 0,
        '5.1-6.0': 0,
        '6.1-7.0': 0,
        '7.1-8.0': 0,
        '8.1-9.0': 0,
        '9.1-10': 0
    };

    allGames.forEach(game => {
        const rating = game.rating;
        if (rating <= 5.0) ranges['0-5.0']++;
        else if (rating <= 6.0) ranges['5.1-6.0']++;
        else if (rating <= 7.0) ranges['6.1-7.0']++;
        else if (rating <= 8.0) ranges['7.1-8.0']++;
        else if (rating <= 9.0) ranges['8.1-9.0']++;
        else ranges['9.1-10']++;
    });

    const labels = Object.keys(ranges);
    const values = Object.values(ranges);
    const maxValue = Math.max(...values);

    drawBarChart(ctx, canvas, labels, values, maxValue, '#9C27B0');
}

function drawMostPlayedChart() {
    const canvas = document.getElementById('most-played-chart');
    const ctx = canvas.getContext('2d');

    const containerWidth = canvas.parentElement.clientWidth;
    canvas.width = containerWidth;
    canvas.height = 500;

    // Get top 10 most played games
    const topGames = [...allGames]
        .sort((a, b) => b.numPlays - a.numPlays)
        .slice(0, 10)
        .filter(g => g.numPlays > 0);

    if (topGames.length === 0) {
        ctx.fillStyle = '#666';
        ctx.font = '16px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('No play data available', canvas.width / 2, canvas.height / 2);
        return;
    }

    const labels = topGames.map(g => g.name);
    const values = topGames.map(g => g.numPlays);
    const maxValue = Math.max(...values);

    drawBarChart(ctx, canvas, labels, values, maxValue, '#F44336', true);
}

function drawBarChart(ctx, canvas, labels, values, maxValue, color, horizontal = false) {
    const padding = 60;
    const chartWidth = canvas.width - padding * 2;
    const chartHeight = canvas.height - padding * 2;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (horizontal) {
        // Horizontal bar chart for game names
        const barHeight = Math.min(40, chartHeight / labels.length - 10);
        const spacing = (chartHeight - (barHeight * labels.length)) / (labels.length + 1);

        // Draw bars
        labels.forEach((label, i) => {
            const value = values[i];
            const barWidth = (value / maxValue) * (chartWidth - 150);
            const x = padding + 150;
            const y = padding + spacing + i * (barHeight + spacing);

            // Bar
            ctx.fillStyle = color;
            ctx.fillRect(x, y, barWidth, barHeight);

            // Label (game name)
            ctx.fillStyle = '#333';
            ctx.font = '12px Arial';
            ctx.textAlign = 'right';
            ctx.textBaseline = 'middle';
            const maxLabelWidth = 140;
            let displayLabel = label;
            if (ctx.measureText(label).width > maxLabelWidth) {
                while (ctx.measureText(displayLabel + '...').width > maxLabelWidth && displayLabel.length > 0) {
                    displayLabel = displayLabel.slice(0, -1);
                }
                displayLabel += '...';
            }
            ctx.fillText(displayLabel, x - 10, y + barHeight / 2);

            // Value
            ctx.fillStyle = '#666';
            ctx.font = 'bold 14px Arial';
            ctx.textAlign = 'left';
            ctx.fillText(value, x + barWidth + 5, y + barHeight / 2);
        });

        // Draw y-axis
        ctx.strokeStyle = '#ddd';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(padding + 150, padding);
        ctx.lineTo(padding + 150, canvas.height - padding);
        ctx.stroke();

    } else {
        // Vertical bar chart
        const barWidth = Math.min(80, chartWidth / labels.length - 20);
        const spacing = (chartWidth - (barWidth * labels.length)) / (labels.length + 1);

        // Draw x-axis
        ctx.strokeStyle = '#ddd';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(padding, canvas.height - padding);
        ctx.lineTo(canvas.width - padding, canvas.height - padding);
        ctx.stroke();

        // Draw y-axis
        ctx.beginPath();
        ctx.moveTo(padding, padding);
        ctx.lineTo(padding, canvas.height - padding);
        ctx.stroke();

        // Draw bars
        labels.forEach((label, i) => {
            const value = values[i];
            const barHeight = (value / maxValue) * (chartHeight - 20);
            const x = padding + spacing + i * (barWidth + spacing);
            const y = canvas.height - padding - barHeight;

            // Bar
            ctx.fillStyle = color;
            ctx.fillRect(x, y, barWidth, barHeight);

            // Value on top
            ctx.fillStyle = '#666';
            ctx.font = 'bold 14px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'bottom';
            ctx.fillText(value, x + barWidth / 2, y - 5);

            // Label
            ctx.fillStyle = '#333';
            ctx.font = '12px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            ctx.save();
            ctx.translate(x + barWidth / 2, canvas.height - padding + 10);
            ctx.rotate(-Math.PI / 6);
            ctx.fillText(label, 0, 0);
            ctx.restore();
        });
    }
}

// Handle window resize
let resizeTimeout;
window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
        if (allGames.length > 0) {
            drawCharts();
        }
    }, 250);
});

fetchCollection();
