const USERNAME = 'koraytugay';
const COLLECTION_XML_FILE = 'collection.xml';

async function getCollection(onlyOwned = true) {
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

        let items = Array.from(xmlDoc.querySelectorAll('item'));

        if (onlyOwned === 'wanttobuy') {
            items = items.filter(item => {
                const status = item.querySelector('status');
                const isWantToBuy = status && status.getAttribute('wanttobuy') === '1';
                const subtype = item.getAttribute('subtype');
                const isValidType = subtype === 'boardgame' || subtype === 'boardgameexpansion';
                return isWantToBuy && isValidType;
            });
        } else if (onlyOwned === true) {
            items = items.filter(item => {
                const status = item.querySelector('status');
                const isOwned = status && status.getAttribute('own') === '1';
                const isBoardGame = item.getAttribute('subtype') === 'boardgame';
                return isOwned && isBoardGame;
            });
        }

        if (items.length === 0) {
            throw new Error('No games found in collection');
        }

        return items.map(item => {
            const name = item.querySelector('name')?.textContent || 'Unknown Game';
            const yearPublished = item.querySelector('yearpublished')?.textContent || 'N/A';
            const thumbnail = item.querySelector('thumbnail')?.textContent || '';
            const image = item.querySelector('image')?.textContent || thumbnail;
            const objectId = item.getAttribute('objectid');

            // Resolve local images
            // Since we don't know the extension (jpg vs png), we check common ones or assume jpg
            // In a real environment, we'd check if the file exists on the server, but here
            // we'll assume the downloader did its job. We'll use .jpg as default but BGG uses many.
            // A better way is to check the extension from the original URL.
            const getLocalPath = (url, type) => {
                if (!url) return '';
                try {
                    const urlObj = new URL(url);
                    const ext = urlObj.pathname.split('.').pop() || 'jpg';
                    return `images/${type}/${objectId}.${ext}`;
                } catch (e) {
                    return url;
                }
            };

            const localThumbnail = getLocalPath(thumbnail, 'thumbnails');
            const localImage = getLocalPath(image, 'full');

            const minPlayers = parseInt(item.querySelector('stats')?.getAttribute('minplayers')) || 0;
            const maxPlayers = parseInt(item.querySelector('stats')?.getAttribute('maxplayers')) || 0;
            const playingTime = parseInt(item.querySelector('stats')?.getAttribute('playingtime')) || 0;
            const numPlays = parseInt(item.querySelector('numplays')?.textContent) || 0;
            const ratingValue = item.querySelector('stats rating average')?.getAttribute('value') || '0';
            const rating = parseFloat(ratingValue);
            const myRatingValue = item.querySelector('stats rating')?.getAttribute('value') || '0';
            const myRating = parseFloat(myRatingValue);

            return {
                name,
                yearPublished,
                thumbnail: localThumbnail || thumbnail,
                image: localImage || image || localThumbnail || thumbnail,
                minPlayers,
                maxPlayers,
                playingTime,
                numPlays,
                objectId,
                rating,
                myRating
            };
        });
    } catch (error) {
        console.error('Error fetching collection:', error);
        throw error;
    }
}

async function getPlaysForMonth(year, month) {
    const monthStr = String(month + 1).padStart(2, '0');
    const fileName = `plays/${year}-${monthStr}.xml`;
    
    try {
        const response = await fetch(fileName);

        if (!response.ok) {
            if (response.status === 404) return [];
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const xmlText = await response.text();
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlText, 'text/xml');

        const plays = xmlDoc.querySelectorAll('play');
        return Array.from(plays).map(play => {
            return {
                id: play.getAttribute('id'),
                date: play.getAttribute('date'),
                quantity: parseInt(play.getAttribute('quantity')) || 1,
                gameName: play.querySelector('item')?.getAttribute('name') || 'Unknown Game',
                gameId: play.querySelector('item')?.getAttribute('objectid'),
                location: play.getAttribute('location') || ''
            };
        });
    } catch (error) {
        console.warn(`Could not load plays for ${year}-${monthStr}:`, error);
        return [];
    }
}

async function getLastPlayDates() {
    const dates = {};
    const now = new Date();
    const fetchPromises = [];

    // Fetch last 12 months of plays in parallel
    for (let i = 0; i < 12; i++) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        fetchPromises.push(getPlaysForMonth(d.getFullYear(), d.getMonth()));
    }

    const allMonthlyPlays = await Promise.all(fetchPromises);
    
    allMonthlyPlays.forEach(plays => {
        plays.forEach(play => {
            const gameId = play.gameId;
            if (!dates[gameId] || play.date > dates[gameId]) {
                dates[gameId] = play.date;
            }
        });
    });

    return dates;
}

function calculateHIndex(games) {
    const plays = games.map(g => g.numPlays).sort((a, b) => b - a);
    let hIndex = 0;
    for (let i = 0; i < plays.length; i++) {
        if (plays[i] >= i + 1) {
            hIndex = i + 1;
        } else {
            break;
        }
    }
    return hIndex;
}
