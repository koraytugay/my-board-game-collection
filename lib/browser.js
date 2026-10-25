// Shared headless browser (Puppeteer) for stores that need one.

let globalBrowser = null;

async function getBrowserInstance() {
    if (!globalBrowser) {
        try {
            const puppeteer = require('puppeteer');
            globalBrowser = await puppeteer.launch({
                headless: true,
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-blink-features=AutomationControlled',
                    '--user-agent=Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'
                ]
            });
        } catch (e) {
            console.error('[ERROR] Could not launch Puppeteer:', e.message);
            globalBrowser = null;
        }
    }
    return globalBrowser;
}

async function closeBrowser() {
    if (globalBrowser) {
        try {
            await globalBrowser.close();
            if (typeof globalBrowser.process === 'function' && globalBrowser.process()) {
                globalBrowser.process().kill('SIGKILL');
            }
        } catch (_) {}
    }
}

module.exports = { getBrowserInstance, closeBrowser };
