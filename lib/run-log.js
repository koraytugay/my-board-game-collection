// Per-run log file in runlogs/: tees console output into it and prunes logs older than 14 days.
const fs = require('fs');
const path = require('path');

const RUNLOGS_DIR = path.join(__dirname, '..', 'runlogs');

function getFormattedTimestamp() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}_${pad(d.getUTCHours())}-${pad(d.getUTCMinutes())}-${pad(d.getUTCSeconds())}Z`;
}

// Automatically prune logs older than 14 days to keep repo size healthy
function pruneOldLogs(maxDays = 14) {
    try {
        const cutoff = Date.now() - (maxDays * 24 * 60 * 60 * 1000);
        const files = fs.readdirSync(RUNLOGS_DIR);
        for (const file of files) {
            if (file.endsWith('.log')) {
                const p = path.join(RUNLOGS_DIR, file);
                const stat = fs.statSync(p);
                if (stat.mtimeMs < cutoff) {
                    fs.unlinkSync(p);
                }
            }
        }
    } catch (_) {}
}

function formatLogEntry(level, args) {
    const iso = new Date().toISOString();
    const text = args.map(a => {
        if (typeof a === 'object' && a !== null) {
            try { return JSON.stringify(a); } catch (_) { return String(a); }
        }
        return String(a);
    }).join(' ');
    return `[${iso}] [${level}] ${text}\n`;
}

// Opens runlogs/<timestamp>_<runType>.log and tees console.log/warn/error into it.
function startRunLog(runType) {
    if (!fs.existsSync(RUNLOGS_DIR)) {
        fs.mkdirSync(RUNLOGS_DIR, { recursive: true });
    }

    const logFileName = `${getFormattedTimestamp()}_${runType}.log`;
    const logFilePath = path.join(RUNLOGS_DIR, logFileName);
    const logStream = fs.createWriteStream(logFilePath, { flags: 'a' });

    pruneOldLogs(14);

    // Tee console output to log file with timestamps
    const origLog = console.log;
    const origWarn = console.warn;
    const origError = console.error;

    console.log = (...args) => {
        origLog(...args);
        logStream.write(formatLogEntry('INFO', args));
    };
    console.warn = (...args) => {
        origWarn(...args);
        logStream.write(formatLogEntry('WARN', args));
    };
    console.error = (...args) => {
        origError(...args);
        logStream.write(formatLogEntry('ERROR', args));
    };

    return { logFileName, logStream };
}

module.exports = { startRunLog };
