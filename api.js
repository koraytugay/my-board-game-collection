const USERNAME = 'koraytugay';
// Using relative paths to avoid CORS issues on GitHub Pages
const COLLECTION_XML_FILE = 'collection.xml';
const PLAYS_XML_FILE = 'plays.xml';

async function getCollection() {
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

        return Array.from(items).map(item => {
            const name = item.querySelector('name')?.textContent || 'Unknown Game';
            const yearPublished = item.querySelector('yearpublished')?.textContent || 'N/A';
            const thumbnail = item.querySelector('thumbnail')?.textContent || '';
            const image = item.querySelector('image')?.textContent || thumbnail;
            const minPlayers = parseInt(item.querySelector('stats')?.getAttribute('minplayers')) || 0;
            const maxPlayers = parseInt(item.querySelector('stats')?.getAttribute('maxplayers')) || 0;
            const playingTime = parseInt(item.querySelector('stats')?.getAttribute('playingtime')) || 0;
            const numPlays = parseInt(item.querySelector('numplays')?.textContent) || 0;
            const objectId = item.getAttribute('objectid');
            const ratingValue = item.querySelector('stats rating average')?.getAttribute('value') || '0';
            const rating = parseFloat(ratingValue);
            const myRatingValue = item.querySelector('stats rating')?.getAttribute('value') || '0';
            const myRating = parseFloat(myRatingValue);

            return {
                name,
                yearPublished,
                thumbnail: image || thumbnail,
                image: image || thumbnail,
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

async function getPlays() {
    try {
        const response = await fetch(PLAYS_XML_FILE);

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
        console.error('Error fetching plays:', error);
        return [];
    }
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
