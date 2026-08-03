// recommended.js - Handling Recommended Games UI

let allRecommendations = [];
let filteredRecommendations = [];
let currentViewMode = 'grid';

document.addEventListener('DOMContentLoaded', () => {
    initDarkMode();
    loadRecommendations();
});

function initDarkMode() {
    const isDarkMode = localStorage.getItem('darkMode') === 'true';
    if (isDarkMode) {
        document.body.classList.add('dark-mode');
        const darkModeCheckbox = document.getElementById('dark-mode');
        if (darkModeCheckbox) darkModeCheckbox.checked = true;
    }
}

function toggleDarkMode(checked) {
    if (checked) {
        document.body.classList.add('dark-mode');
        localStorage.setItem('darkMode', 'true');
    } else {
        document.body.classList.remove('dark-mode');
        localStorage.setItem('darkMode', 'false');
    }
}

async function loadRecommendations() {
    const loadingEl = document.getElementById('loading');
    const errorEl = document.getElementById('error');
    const statsEl = document.getElementById('stats');
    const controlsEl = document.getElementById('controls');
    const containerEl = document.getElementById('recommendations-grid');

    try {
        const response = await fetch('recommendations.json');
        if (!response.ok) {
            throw new Error(`Failed to load recommendations.json (HTTP ${response.status})`);
        }

        const data = await response.json();
        allRecommendations = data.recommendations || [];
        filteredRecommendations = [...allRecommendations];

        loadingEl.style.display = 'none';

        if (allRecommendations.length === 0) {
            errorEl.textContent = 'No recommendations found. Run generate-recommendations.js to populate data.';
            errorEl.style.display = 'block';
            return;
        }

        statsEl.style.display = 'flex';
        controlsEl.style.display = 'block';

        // Update Stats Bar
        document.getElementById('total-recs').textContent = allRecommendations.length;
        const avgBgg = allRecommendations.reduce((acc, r) => acc + r.bggRating, 0) / allRecommendations.length;
        document.getElementById('avg-bgg-rating').textContent = avgBgg.toFixed(1);
        
        // Count unique owned games contributing to recommendations
        const sourceSet = new Set();
        allRecommendations.forEach(r => r.recommendedBy.forEach(s => sourceSet.add(s.ownedId)));
        document.getElementById('total-sources').textContent = sourceSet.size;

        // Render page
        sortRecommendations('match-desc');
    } catch (err) {
        console.error('Error loading recommendations:', err);
        loadingEl.style.display = 'none';
        errorEl.textContent = 'Unable to load recommended games. Please make sure recommendations.json has been generated.';
        errorEl.style.display = 'block';
    }
}

function applyFilters() {
    const searchVal = document.getElementById('search-input').value.toLowerCase().trim();
    const ratingVal = document.getElementById('rating-filter').value;
    const sortVal = document.getElementById('sort-select').value;

    filteredRecommendations = allRecommendations.filter(rec => {
        // Search filter: matches candidate name or source game names
        if (searchVal) {
            const nameMatch = rec.name.toLowerCase().includes(searchVal);
            const sourceMatch = rec.recommendedBy.some(s => s.ownedName.toLowerCase().includes(searchVal));
            if (!nameMatch && !sourceMatch) return false;
        }

        // Rating filter
        if (ratingVal !== 'all') {
            const minRating = parseFloat(ratingVal);
            if (rec.bggRating < minRating) return false;
        }

        return true;
    });

    sortRecommendations(sortVal);
}

function sortRecommendations(sortBy) {
    switch (sortBy) {
        case 'match-desc':
            filteredRecommendations.sort((a, b) => b.matchScore - a.matchScore);
            break;
        case 'rating-desc':
            filteredRecommendations.sort((a, b) => b.bggRating - a.bggRating);
            break;
        case 'rank-asc':
            filteredRecommendations.sort((a, b) => (a.bggRank || 999999) - (b.bggRank || 999999));
            break;
        case 'name-asc':
            filteredRecommendations.sort((a, b) => a.name.localeCompare(b.name));
            break;
        case 'year-desc':
            filteredRecommendations.sort((a, b) => (parseInt(b.yearPublished) || 0) - (parseInt(a.yearPublished) || 0));
            break;
        default:
            filteredRecommendations.sort((a, b) => b.matchScore - a.matchScore);
    }

    renderGrid();
}

function changeViewMode(mode) {
    currentViewMode = mode;
    renderGrid();
}

function renderGrid() {
    const gridEl = document.getElementById('recommendations-grid');
    gridEl.innerHTML = '';

    if (filteredRecommendations.length === 0) {
        gridEl.innerHTML = `<div style="grid-column: 1/-1; text-align: center; padding: 40px; color: #666;">
            <h3>No recommendations match your current filters.</h3>
        </div>`;
        return;
    }

    // Set view mode class
    gridEl.className = 'games-grid';
    if (currentViewMode === 'compact') gridEl.classList.add('compact-view');
    if (currentViewMode === 'list') gridEl.classList.add('list-view');

    filteredRecommendations.forEach(rec => {
        const card = document.createElement('div');
        card.className = 'game-card rec-card';

        const bggUrl = `https://boardgamegeek.com/boardgame/${rec.objectId}`;
        const rankDisplay = rec.bggRank ? `#${rec.bggRank}` : 'Unranked';
        const imageSrc = rec.image || rec.thumbnail || 'https://cf.geekdo-images.com/static/geekitem_default.png';

        // Render source chips (top 4 sources)
        const sourcesHtml = rec.recommendedBy.slice(0, 4).map(s => `
            <span class="source-chip" title="Rec #${s.bggRecRank} from your ${s.userRating}/10 rated game">
                ${escapeHtml(s.ownedName)}
                <span class="user-score-pill">★ ${s.userRating}</span>
            </span>
        `).join('');

        const extraSourcesCount = rec.recommendedBy.length > 4 ? rec.recommendedBy.length - 4 : 0;
        const extraChip = extraSourcesCount > 0 ? `<span class="source-chip">+${extraSourcesCount} more</span>` : '';

        card.innerHTML = `
            <div class="rec-image-wrapper">
                <span class="rank-badge" title="BGG Overall Rank">${rankDisplay}</span>
                <span class="match-badge" title="Algorithmic Match Score">🔥 Match: ${rec.matchScore}</span>
                <img class="rec-image" src="${escapeHtml(imageSrc)}" alt="${escapeHtml(rec.name)}" loading="lazy" onerror="this.src='https://cf.geekdo-images.com/static/geekitem_default.png'">
            </div>
            <div class="rec-content">
                <h3 class="rec-title">${escapeHtml(rec.name)}</h3>
                <div class="rec-meta-row">
                    <span>📅 ${escapeHtml(rec.yearPublished)}</span>
                    <span class="rec-rating">⭐ BGG ${rec.bggRating.toFixed(1)} (${rec.numVoters.toLocaleString()} votes)</span>
                </div>
                ${rec.description ? `<p class="rec-description">${escapeHtml(rec.description)}</p>` : ''}
                
                <div class="recommended-by-section">
                    <div class="recommended-by-title">Based on games you love:</div>
                    <div class="source-chips">
                        ${sourcesHtml}
                        ${extraChip}
                    </div>
                </div>

                <div class="rec-actions">
                    <a href="${bggUrl}" target="_blank" rel="noopener" class="btn-bgg">View on BGG ↗</a>
                    <button class="btn btn-secondary" onclick="openRecModal('${rec.objectId}')" style="padding: 8px 12px; font-size: 0.88rem;">Details</button>
                </div>
            </div>
        `;

        gridEl.appendChild(card);
    });
}

function openRecModal(objectId) {
    const rec = allRecommendations.find(r => r.objectId === objectId);
    if (!rec) return;

    const modal = document.getElementById('rec-modal');
    document.getElementById('modal-title').textContent = rec.name;
    document.getElementById('modal-img').src = rec.image || rec.thumbnail;
    document.getElementById('modal-year').textContent = `Published: ${rec.yearPublished}`;
    document.getElementById('modal-bgg-rating').textContent = rec.bggRating;
    document.getElementById('modal-bgg-rank').textContent = rec.bggRank ? `#${rec.bggRank}` : 'Unranked';
    document.getElementById('modal-bgg-voters').textContent = rec.numVoters.toLocaleString();
    document.getElementById('modal-match-score').textContent = rec.matchScore;
    document.getElementById('modal-description').textContent = rec.description || 'No description available.';
    document.getElementById('modal-bgg-link').href = `https://boardgamegeek.com/boardgame/${rec.objectId}`;

    const sourcesList = document.getElementById('modal-sources-list');
    sourcesList.innerHTML = rec.recommendedBy.map(s => `
        <div class="detail-item">
            <div>
                <strong>${escapeHtml(s.ownedName)}</strong>
                <div style="font-size: 0.8rem; color: #666;">BGG Rec Position #${s.bggRecRank}</div>
            </div>
            <div style="text-align: right;">
                <span class="user-score-pill" style="font-size: 0.85rem; padding: 2px 8px;">Your Rating: ${s.userRating}/10</span>
            </div>
        </div>
    `).join('');

    modal.style.display = 'flex';
}

function closeRecModal() {
    document.getElementById('rec-modal').style.display = 'none';
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;')
              .replace(/</g, '&lt;')
              .replace(/>/g, '&gt;')
              .replace(/"/g, '&quot;')
              .replace(/'/g, '&#039;');
}
