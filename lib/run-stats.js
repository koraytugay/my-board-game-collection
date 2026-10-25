// Counters for one availability run (checks, 429s, failures) and the end-of-run summary.

const runStats = {
    runType: '',      // set by check-availability.js
    logFileName: '',  // set by check-availability.js
    startTime: Date.now(),
    storesChecked: 0,
    storesSkipped: 0,
    total429s: 0,
    rateLimitsByHost: {},
    failuresByStore: {},

    record429(hostname, waitSec, headers) {
        this.total429s++;
        if (!this.rateLimitsByHost[hostname]) {
            this.rateLimitsByHost[hostname] = {
                count: 0,
                totalWaitSec: 0,
                lastHeaders: null
            };
        }
        this.rateLimitsByHost[hostname].count++;
        this.rateLimitsByHost[hostname].totalWaitSec += waitSec;
        this.rateLimitsByHost[hostname].lastHeaders = headers;
    },

    recordFailure(storeKey, errorMsg) {
        if (!this.failuresByStore[storeKey]) {
            this.failuresByStore[storeKey] = { count: 0, lastError: errorMsg };
        }
        this.failuresByStore[storeKey].count++;
        this.failuresByStore[storeKey].lastError = errorMsg;
    },

    printSummary(gameCount) {
        const elapsedSec = Math.round((Date.now() - this.startTime) / 1000);
        const mins = Math.floor(elapsedSec / 60);
        const secs = elapsedSec % 60;
        console.log('\n' + '='.repeat(60));
        console.log(`RUN SUMMARY: ${this.runType.toUpperCase()}`);
        console.log('-'.repeat(60));
        console.log(`Log File:              runlogs/${this.logFileName}`);
        console.log(`Timestamp (UTC):       ${new Date().toISOString()}`);
        console.log(`Duration:              ${mins}m ${secs}s`);
        console.log(`Games Evaluated:       ${gameCount}`);
        console.log(`Store Checks Made:     ${this.storesChecked}`);
        console.log(`Store Checks Skipped:  ${this.storesSkipped} (6-hour cache)`);
        console.log(`Total 429 Events:      ${this.total429s}`);

        if (Object.keys(this.rateLimitsByHost).length > 0) {
            console.log('\n429 Rate Limits by Host:');
            for (const [host, data] of Object.entries(this.rateLimitsByHost)) {
                console.log(`  - ${host}: ${data.count} hits (total backoff: ${data.totalWaitSec}s, last headers: ${JSON.stringify(data.lastHeaders)})`);
            }
        }

        if (Object.keys(this.failuresByStore).length > 0) {
            console.log('\nStore Fetch Failures:');
            for (const [store, data] of Object.entries(this.failuresByStore)) {
                console.log(`  - ${store}: ${data.count} failures (last error: ${data.lastError})`);
            }
        }
        console.log('='.repeat(60) + '\n');
    }
};

module.exports = { runStats };
