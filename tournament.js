let allGames = [];
let tournamentGames = [];
let winners = [];
let currentPair = [];
let currentIndex = 0;
let roundNumber = 1;
let totalMatchesInRound = 0;
let matchInRound = 1;

async function init() {
    const loadingEl = document.getElementById('loading');
    const setupView = document.getElementById('setup-view');

    try {
        allGames = await getCollection();
        loadingEl.style.display = 'none';
        setupView.style.display = 'block';
        
        loadDarkMode();
    } catch (error) {
        console.error('Error loading collection:', error);
        loadingEl.innerHTML = `<p class="error">Failed to load collection: ${error.message}</p>`;
    }
}

function loadDarkMode() {
    const isDark = localStorage.getItem('darkMode') === 'true';
    if (isDark) {
        document.body.classList.add('dark-mode');
    }
}

function startTournament(size) {
    let gamesToUse = [...allGames];
    shuffleArray(gamesToUse);

    if (size !== 'all') {
        const count = parseInt(size);
        gamesToUse = gamesToUse.slice(0, count);
    }

    tournamentGames = gamesToUse;
    roundNumber = 1;
    currentIndex = 0;
    winners = [];
    matchInRound = 1;
    totalMatchesInRound = Math.floor(tournamentGames.length / 2);

    document.getElementById('setup-view').style.display = 'none';
    document.getElementById('matchup-view').style.display = 'block';
    document.getElementById('winner-view').style.display = 'none';

    showNextMatch();
}

function showNextMatch() {
    if (currentIndex >= tournamentGames.length - 1) {
        // Round finished
        if (tournamentGames.length % 2 === 1) {
            // Last game had a bye
            winners.push(tournamentGames[tournamentGames.length - 1]);
        }

        if (winners.length === 1) {
            showWinner(winners[0]);
            return;
        }

        // Start next round
        tournamentGames = [...winners];
        winners = [];
        roundNumber++;
        currentIndex = 0;
        matchInRound = 1;
        totalMatchesInRound = Math.floor(tournamentGames.length / 2);
    }

    const gameA = tournamentGames[currentIndex];
    const gameB = tournamentGames[currentIndex + 1];
    currentPair = [gameA, gameB];

    updateMatchUI(gameA, gameB);
}

function updateMatchUI(gameA, gameB) {
    document.getElementById('round-name').textContent = getRoundName(tournamentGames.length);
    document.getElementById('match-count').textContent = `Match ${matchInRound} of ${totalMatchesInRound}`;
    
    // Progress bar calculation
    // This is a bit tricky across rounds, but let's just show progress in current round
    const progress = ((matchInRound - 1) / totalMatchesInRound) * 100;
    document.getElementById('progress-bar').style.width = `${progress}%`;

    fillGameDetails('game-a', gameA);
    fillGameDetails('game-b', gameB);
}

function getRoundName(count) {
    if (count <= 2) return "Final";
    if (count <= 4) return "Semi-Final";
    if (count <= 8) return "Quarter-Final";
    return `Round ${roundNumber}`;
}

function fillGameDetails(elementId, game) {
    const container = document.getElementById(elementId);
    container.querySelector('.game-image').src = game.image || game.thumbnail || 'https://via.placeholder.com/300x300?text=No+Image';
    container.querySelector('.game-name').textContent = game.name;
    container.querySelector('.game-year').textContent = game.yearPublished !== 'N/A' ? `(${game.yearPublished})` : '';
    
    // Set the click handler on the container itself
    container.onclick = () => selectWinner(game);
    
    // Ensure the button also works but doesn't double-trigger
    const btn = container.querySelector('.select-btn');
    btn.onclick = (e) => {
        e.stopPropagation();
        selectWinner(game);
    };
}

function selectWinner(game) {
    winners.push(game);
    currentIndex += 2;
    matchInRound++;
    showNextMatch();
}

function showWinner(game) {
    document.getElementById('matchup-view').style.display = 'none';
    const winnerView = document.getElementById('winner-view');
    winnerView.style.display = 'block';

    const display = document.getElementById('champion-display');
    display.innerHTML = `
        <div class="game-choice">
            <div class="game-image-wrapper">
                <img src="${game.image || game.thumbnail || 'https://via.placeholder.com/300x300?text=No+Image'}" alt="${game.name}" class="game-image">
            </div>
            <div class="game-details">
                <h2 class="game-name">${game.name}</h2>
                <p class="game-year">${game.yearPublished !== 'N/A' ? `(${game.yearPublished})` : ''}</p>
            </div>
        </div>
    `;
}

function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
}

// Event Listeners
document.addEventListener('DOMContentLoaded', () => {
    init();

    document.querySelectorAll('.size-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const size = btn.getAttribute('data-size');
            startTournament(size);
        });
    });

    document.getElementById('restart-btn').addEventListener('click', () => {
        document.getElementById('winner-view').style.display = 'none';
        document.getElementById('setup-view').style.display = 'block';
    });
});
