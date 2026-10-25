// nav.js - Renders the shared navigation into the <nav class="page-nav"> placed right before this script.
(function renderPageNav() {
    const NAV_ROWS = [
        [
            ['index.html', 'Collection'],
            ['tierlist.html', 'Tier List'],
            ['calendar.html', 'Play Calendar'],
            ['history.html', 'Play History'],
            ['stats.html', 'Statistics'],
            ['challenges.html', 'Collection Challenges'],
            ['tournament.html', 'Game Tournament']
        ],
        [
            ['wanttobuy.html', 'Want to Buy'],
            ['wanttoplay.html', 'Want to Play'],
            ['wantintrade.html', 'Want in Trade'],
            ['liketohave.html', 'Like to Have'],
            ['thinkingabout.html', 'Thinking About'],
            ['recommended.html', 'Recommended Games'],
            ['stores.html', 'Stores'],
            ['smartbuy.html', 'Smart Buy'],
            ['wanttosell.html', 'Want to Sell']
        ]
    ];

    const nav = document.currentScript.previousElementSibling;
    const currentPage = location.pathname.split('/').pop() || 'index.html';

    nav.innerHTML = NAV_ROWS.map(row => `
        <div class="nav-row">
            ${row.map(([href, label]) => `<a href="${href}" class="nav-link${href === currentPage ? ' active' : ''}">${label}</a>`).join('\n            ')}
        </div>`).join('') + '\n    ';
})();
