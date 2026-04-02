const fs = require('fs');
const https = require('https');
const path = require('path');

const COLLECTION_FILE = 'collection.xml';
const IMAGES_DIR = 'images';
const THUMBNAILS_DIR = path.join(IMAGES_DIR, 'thumbnails');
const FULL_DIR = path.join(IMAGES_DIR, 'full');

// Ensure directories exist
[IMAGES_DIR, THUMBNAILS_DIR, FULL_DIR].forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
});

/**
 * Downloads a file from a URL to a local path
 */
function downloadFile(url, dest) {
    return new Promise((resolve, reject) => {
        if (!url || url.trim() === '') {
            resolve(false);
            return;
        }

        const file = fs.createWriteStream(dest);
        https.get(url, (response) => {
            if (response.statusCode !== 200) {
                file.close();
                fs.unlink(dest, () => {}); // Delete the empty file
                console.error(`Failed to download ${url}: HTTP ${response.statusCode}`);
                resolve(false);
                return;
            }
            response.pipe(file);
            file.on('finish', () => {
                file.close();
                resolve(true);
            });
        }).on('error', (err) => {
            fs.unlink(dest, () => {});
            console.error(`Error downloading ${url}: ${err.message}`);
            resolve(false);
        });
    });
}

/**
 * Main function
 */
async function run() {
    console.log('Starting image synchronization...');
    const content = fs.readFileSync(COLLECTION_FILE, 'utf8');
    
    // Improved regex to capture objectid and its corresponding images
    const itemRegex = /<item objecttype="thing" objectid="(\d+)"[^>]*>([\s\S]*?)<\/item>/g;
    let match;
    let count = 0;
    let downloaded = 0;

    const tasks = [];

    while ((match = itemRegex.exec(content)) !== null) {
        const objectId = match[1];
        const itemContent = match[2];

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

    console.log(`Found ${count} items in collection. ${tasks.length} new images to download.`);

    // Process tasks in small batches to avoid overwhelming the network
    const batchSize = 5;
    for (let i = 0; i < tasks.length; i += batchSize) {
        const batch = tasks.slice(i, i + batchSize);
        await Promise.all(batch.map(task => task()));
        console.log(`Progress: ${i + batch.length}/${tasks.length}...`);
    }

    console.log(`Finished. Total downloaded: ${downloaded}`);
}

run().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
