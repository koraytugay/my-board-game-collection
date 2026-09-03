// thinkingabout.js - Thinking About Games (No stock checking)

let allGames = [];
let filteredGames = [];
let currentSort = "name";
let currentViewMode = "grid";

async function fetchCollection() {
    const loadingEl = document.getElementById("loading");
    const errorEl = document.getElementById("error");
    const controlsEl = document.getElementById("controls");

    try {
        const [collection, designersRes] = await Promise.all([
            getCollection("thinkingabout"),
            fetch("designers.json").then(res => res.ok ? res.json() : {}).catch(() => ({}))
        ]);

        allGames = collection.map(game => ({
            ...game,
            designers: designersRes[game.objectId]?.designers || []
        }));

        populateDesignerFilter();
        filteredGames = [...allGames];
        sortGames(currentSort);

        loadingEl.style.display = "none";
        controlsEl.style.display = "block";

        loadDarkModePreference();

    } catch (error) {
        console.error("Error fetching Thinking About collection:", error);
        loadingEl.style.display = "none";
        errorEl.style.display = "block";
        errorEl.textContent = "Failed to load Thinking About games: " + error.message;
    }
}

function populateDesignerFilter() {
    const designerSelect = document.getElementById("designer-filter");
    if (!designerSelect) return;

    const currentValue = designerSelect.value;
    designerSelect.innerHTML = "<option value=\"all\">All Designers</option>";

    const designerCountMap = new Map();
    allGames.forEach(game => {
        const designers = game.designers || [];
        designers.forEach(d => {
            if (d && d !== "(Uncredited)") {
                const key = d.toLowerCase();
                const existing = designerCountMap.get(key) || { designer: d, count: 0 };
                existing.count++;
                designerCountMap.set(key, existing);
            }
        });
    });

    const designers = Array.from(designerCountMap.values());
    designers.sort((a, b) => a.designer.localeCompare(b.designer, undefined, { sensitivity: "base" }));

    designers.forEach(item => {
        const option = document.createElement("option");
        option.value = item.designer;
        option.textContent = item.designer + " (" + item.count + ")";
        designerSelect.appendChild(option);
    });

    if (designers.some(d => d.designer === currentValue)) {
        designerSelect.value = currentValue;
    } else {
        designerSelect.value = "all";
    }
}

function applyFilters() {
    const searchInput = document.getElementById("search-input");
    const playerCountFilter = document.getElementById("player-count");
    const playTimeFilter = document.getElementById("play-time");
    const ratingFilter = document.getElementById("rating-filter");
    const designerFilter = document.getElementById("designer-filter");

    const searchTerm = (searchInput?.value || "").toLowerCase();
    const playerCount = playerCountFilter ? playerCountFilter.value : "all";
    const playTime = playTimeFilter ? playTimeFilter.value : "all";
    const minRating = ratingFilter ? ratingFilter.value : "all";
    const selectedDesigner = designerFilter ? designerFilter.value : "all";

    filteredGames = allGames.filter(game => {
        if (searchTerm && !game.name.toLowerCase().includes(searchTerm)) {
            return false;
        }

        if (playerCount !== "all") {
            if (playerCount === "1-only") {
                if (!(game.minPlayers === 1 && game.maxPlayers === 1)) return false;
            } else if (playerCount === "2-only") {
                if (!(game.minPlayers === 2 && game.maxPlayers === 2)) return false;
            } else {
                const count = parseInt(playerCount);
                if (count === 5) {
                    if (game.maxPlayers < 5) return false;
                } else {
                    if (game.minPlayers > count || game.maxPlayers < count) return false;
                }
            }
        }

        if (playTime !== "all") {
            const [min, max] = playTime.split("-").map(Number);
            if (game.playingTime < min || game.playingTime > max) return false;
        }

        if (minRating !== "all") {
            const min = parseFloat(minRating);
            if (game.rating < min) return false;
        }

        if (selectedDesigner !== "all") {
            const designers = game.designers || [];
            if (!designers.includes(selectedDesigner)) return false;
        }

        return true;
    });

    sortGames(currentSort);
}

function sortGames(criteria) {
    currentSort = criteria;

    filteredGames.sort((a, b) => {
        switch (criteria) {
            case "name":
                return a.name.localeCompare(b.name);
            case "rating-desc":
                return b.rating - a.rating;
            case "rating-asc":
                return a.rating - b.rating;
            case "myrating-desc":
                return (b.myRating || 0) - (a.myRating || 0);
            case "myrating-asc":
                return (a.myRating || 0) - (b.myRating || 0);
            case "year-desc":
                return (b.yearPublished || 0) - (a.yearPublished || 0);
            case "year-asc":
                return (a.yearPublished || 0) - (b.yearPublished || 0);
            default:
                return 0;
        }
    });

    renderGames();
}

function renderGames() {
    const gamesGridEl = document.getElementById("games-grid");
    if (!gamesGridEl) return;

    if (currentViewMode === "grid") {
        gamesGridEl.className = "games-grid";
    } else if (currentViewMode === "compact") {
        gamesGridEl.className = "games-grid view-compact";
    } else if (currentViewMode === "list") {
        gamesGridEl.className = "games-grid view-list";
    }

    if (filteredGames.length === 0) {
        gamesGridEl.innerHTML = "<div class=\"no-results\">No games match your filters</div>";
        return;
    }

    gamesGridEl.innerHTML = "";
    filteredGames.forEach(game => {
        gamesGridEl.appendChild(createGameCard(game));
    });
}

function createGameCard(game) {
    const card = document.createElement("div");
    card.className = "game-card";
    card.onclick = () => {
        if (typeof showGameDetails === "function") {
            showGameDetails(game.objectId);
        } else {
            window.open("https://boardgamegeek.com/boardgame/" + game.objectId, "_blank");
        }
    };

    let badgesHtml = "";
    if (game.minPlayers <= 1) badgesHtml += "<span class=\"badge badge-solo\">Solo</span>";
    if (game.rating >= 8) badgesHtml += "<span class=\"badge badge-highly-rated\">Highly Rated</span>";

    const myRatingHtml = game.myRating > 0 ? `<div class="meta-item"><span>💚</span> ${game.myRating.toFixed(1)}</div>` : "";
    const commentHtml = game.comment ? `<div class="game-comment">${game.comment}</div>` : "";

    card.innerHTML = `
        <div class="game-badges">
            ${badgesHtml}
        </div>
        <img src="${game.image || game.thumbnail || "https://via.placeholder.com/300x300?text=No+Image"}" 
             alt="${game.name}" 
             class="game-thumbnail"
             loading="lazy">
        <div class="game-info">
            <div class="game-year">${game.yearPublished !== "N/A" ? game.yearPublished : ""}</div>
            <div class="game-name">${game.name}</div>
            <div class="game-meta">
                <div class="meta-item"><span>👥</span> ${game.minPlayers}-${game.maxPlayers}</div>
                <div class="meta-item"><span>⏱️</span> ${game.playingTime} min</div>
                <div class="meta-item"><span>⭐</span> ${game.rating.toFixed(1)}</div>
                ${myRatingHtml}
            </div>
            ${commentHtml}
        </div>
    `;
    return card;
}

function changeViewMode(mode) {
    currentViewMode = mode;
    renderGames();
}

function toggleDarkMode(checked) {
    if (checked) {
        document.body.classList.add("dark-mode");
    } else {
        document.body.classList.remove("dark-mode");
    }
    localStorage.setItem("darkMode", checked);
}

function loadDarkModePreference() {
    const isDark = localStorage.getItem("darkMode") === "true";
    const checkbox = document.getElementById("dark-mode");
    if (checkbox) checkbox.checked = isDark;
    if (isDark) {
        document.body.classList.add("dark-mode");
    }
}

document.addEventListener("DOMContentLoaded", () => {
    fetchCollection();
});
