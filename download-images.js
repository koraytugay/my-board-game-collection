const fs = require('fs');
const https = require('https');
const path = require('path');

const COLLECTION_FILE = 'collection.xml';
const RECOMMENDATIONS_FILE = 'recommendations.json';
const IMAGES_DIR = 'images';
const THUMBNAILS_DIR = path.join(IMAGES_DIR, 'thumbnails');
const FULL_DIR = path.join(IMAGES_DIR, 'full');
const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// Ensure directories exist
[IMAGES_DIR, THUMBNAILS_DIR, FULL_DIR].forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
});

/**
 * Downloads a file from a URL to a local path with redirect support
 */
function downloadFile(url, dest, maxRedirects = 3) {
    return new Promise((resolve) => {
        if (!url || url.trim() === '') {
            return resolve(false);
        }
        if (fs.existsSync(dest)) {
            return resolve(true);
        }

        const execute = (currentUrl, redirectsLeft) => {
            const file = fs.createWriteStream(dest);
            https.get(currentUrl, { headers: { 'User-Agent': USER_AGENT } }, (response) => {
                if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location && redirectsLeft > 0) {
                    file.close();
                    fs.unlink(dest, () => {});
                    const nextUrl = new URL(response.headers.location, currentUrl).href;
                    return execute(nextUrl, redirectsLeft - 1);
                }
                if (response.statusCode !== 200) {
                    file.close();
                    fs.unlink(dest, () => {});
                    console.error(`Failed to download ${currentUrl}: HTTP ${response.statusCode}`);
                    return resolve(false);
                }
                response.pipe(file);
                file.on('finish', () => {
                    file.close();
                    resolve(true);
                });
            }).on('error', (err) => {
                fs.unlink(dest, () => {});
                console.error(`Error downloading ${currentUrl}: ${err.message}`);
                resolve(false);
            });
        };

        execute(url, maxRedirects);
    });
}

function pruneOrphanedImages(validIds) {
    if (!validIds || validIds.size === 0) return;
    let prunedCount = 0;
    [THUMBNAILS_DIR, FULL_DIR].forEach(dir => {
        if (!fs.existsSync(dir)) return;
        const files = fs.readdirSync(dir);
        files.forEach(file => {
            const objectId = path.parse(file).name;
            if (!validIds.has(objectId)) {
                try {
                    fs.unlinkSync(path.join(dir, file));
                    prunedCount++;
                } catch (e) {
                    console.error(`Failed to remove orphaned image ${file}:`, e.message);
                }
            }
        });
    });
    if (prunedCount > 0) {
        console.log(`Pruned ${prunedCount} orphaned image file(s).`);
    }
}

/**
 * Main function
 */
async function run() {
    console.log('Starting image synchronization...');
    if (!fs.existsSync(COLLECTION_FILE)) {
        console.error(`Error: ${COLLECTION_FILE} not found`);
        return;
    }

    const content = fs.readFileSync(COLLECTION_FILE, 'utf8');
    const validIds = new Set();
    
    // Improved regex to capture objectid and its corresponding images
    const itemRegex = /<item objecttype="thing" objectid="(\d+)"[^>]*>([\s\S]*?)<\/item>/g;
    let match;
    let count = 0;
    let downloaded = 0;

    const tasks = [];

    while ((match = itemRegex.exec(content)) !== null) {
        const objectId = match[1];
        const itemContent = match[2];

        // Skip user-rejected games (wishlistpriority="5")
        if (itemContent.includes('wishlistpriority="5"')) {
            continue;
        }

        validIds.add(objectId);

        const thumbnailMatch = /<thumbnail>([^<]+)<\/thumbnail>/.exec(itemContent);
        const imageMatch = /<image>([^<]+)<\/image>/.exec(itemContent);

        const thumbnailUrl = thumbnailMatch ? thumbnailMatch[1].trim() : null;
        const imageUrl = imageMatch ? imageMatch[1].trim() : null;

        if (thumbnailUrl) {
            const ext = path.extname(new URL(thumbnailUrl).pathname) || '.jpg';
            const dest = path.join(THUMBNAILS_DIR, `${objectId}${ext}`);
            if (!fs.existsSync(dest)) {
                tasks.push(async () => {
                    const success = await downloadFile(thumbnailUrl, dest);
                    if (success) downloaded++;
                });
            }
        }

        if (imageUrl) {
            const ext = path.extname(new URL(imageUrl).pathname) || '.jpg';
            const dest = path.join(FULL_DIR, `${objectId}${ext}`);
            if (!fs.existsSync(dest)) {
                tasks.push(async () => {
                    const success = await downloadFile(imageUrl, dest);
                    if (success) downloaded++;
                });
            }
        }
        count++;
    }

    // Also protect images referenced by recommendations
    if (fs.existsSync(RECOMMENDATIONS_FILE)) {
        try {
            const recsData = JSON.parse(fs.readFileSync(RECOMMENDATIONS_FILE, 'utf8'));
            const recs = recsData.recommendations || [];
            recs.forEach(rec => {
                if (rec.objectId) {
                    validIds.add(String(rec.objectId));
                }
            });
            console.log(`Protected ${recs.length} recommended games from image pruning.`);
        } catch (e) {
            console.error('Failed to parse recommendations file for image protection:', e.message);
        }
    }

    console.log(`Found ${count} active items in collection. ${tasks.length} new images to download.`);

    // Process tasks in small batches to avoid overwhelming the network
    const batchSize = 5;
    for (let i = 0; i < tasks.length; i += batchSize) {
        const batch = tasks.slice(i, i + batchSize);
        await Promise.all(batch.map(task => task()));
        console.log(`Progress: ${Math.min(i + batch.length, tasks.length)}/${tasks.length}...`);
    }

    console.log(`Finished downloads. Total downloaded: ${downloaded}`);

    // Prune orphaned images
    pruneOrphanedImages(validIds);
}

run().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
