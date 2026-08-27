const nodemailer = require('nodemailer');
const { execSync } = require('child_process');

function parseArgs() {
    const args = process.argv.slice(2);
    const result = {};
    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (arg.startsWith('--status=')) {
            result.status = arg.split('=')[1];
        } else if (arg === '--status' && args[i + 1]) {
            result.status = args[++i];
        } else if (arg.startsWith('--workflow=')) {
            result.workflow = arg.split('=')[1];
        } else if (arg === '--workflow' && args[i + 1]) {
            result.workflow = args[++i];
        } else if (arg.startsWith('--message=')) {
            result.message = arg.split('=')[1];
        } else if (arg === '--message' && args[i + 1]) {
            result.message = args[++i];
        }
    }
    return result;
}

function getGitCommitInfo() {
    try {
        const lastCommit = execSync('git log -1 --pretty=format:"%h - %s (%cr)"', { encoding: 'utf8' }).trim();
        return lastCommit;
    } catch (e) {
        return null;
    }
}

function formatDates() {
    const now = new Date();
    const utcStr = now.toUTCString();
    let localStr = '';
    try {
        localStr = new Intl.DateTimeFormat('en-US', {
            timeZone: 'America/Toronto',
            dateStyle: 'medium',
            timeStyle: 'medium'
        }).format(now) + ' (Toronto Time)';
    } catch (e) {
        localStr = utcStr;
    }
    return { utcStr, localStr };
}

async function sendNotificationEmail(subject, htmlBody, textBody) {
    const icloudEmail = process.env.ICLOUD_EMAIL;
    const icloudPassword = process.env.ICLOUD_APP_PASSWORD;
    const recipientEmail = process.env.NOTIFICATION_EMAIL || icloudEmail;

    if (!icloudEmail || !icloudPassword) {
        console.log('[INFO] ICLOUD_EMAIL or ICLOUD_APP_PASSWORD secret is not configured. Skipping email dispatch.');
        return;
    }

    console.log(`[INFO] Preparing email notification via iCloud SMTP (from: ${icloudEmail} to: ${recipientEmail})...`);

    const transporter = nodemailer.createTransport({
        host: 'smtp.mail.me.com',
        port: 587,
        secure: false, // Port 587 uses STARTTLS
        auth: {
            user: icloudEmail,
            pass: icloudPassword
        }
    });

    const mailOptions = {
        from: `"Board Game Collection" <${icloudEmail}>`,
        to: recipientEmail,
        subject: subject,
        text: textBody,
        html: htmlBody
    };

    try {
        const info = await transporter.sendMail(mailOptions);
        console.log(`[SUCCESS] Notification email sent successfully! Message ID: ${info.messageId}`);
    } catch (err) {
        console.error(`[ERROR] Failed to send email via iCloud SMTP:`, err.message);
    }
}

async function run() {
    const cliArgs = parseArgs();
    const rawStatus = (cliArgs.status || process.env.JOB_STATUS || 'success').toLowerCase();
    const isSuccess = rawStatus === 'success';
    const isFailure = rawStatus === 'failure' || rawStatus === 'failed';
    
    const workflowName = cliArgs.workflow || process.env.GITHUB_WORKFLOW || 'Workflow Job';
    const serverUrl = process.env.GITHUB_SERVER_URL || 'https://github.com';
    const repository = process.env.GITHUB_REPOSITORY || 'koraytugay/my-board-game-collection';
    const runId = process.env.GITHUB_RUN_ID;
    const runUrl = runId ? `${serverUrl}/${repository}/actions/runs/${runId}` : `${serverUrl}/${repository}/actions`;
    const eventName = process.env.GITHUB_EVENT_NAME ? (process.env.GITHUB_EVENT_NAME === 'schedule' ? 'Scheduled (cron)' : process.env.GITHUB_EVENT_NAME) : 'Manual';
    const lastCommit = getGitCommitInfo();
    const customMessage = cliArgs.message || null;
    const { utcStr, localStr } = formatDates();

    const statusTitle = isSuccess ? 'Run was successful' : (isFailure ? 'Run failed' : `Run finished with status: ${rawStatus}`);
    const statusIcon = isSuccess ? '✅' : (isFailure ? '❌' : '⚠️');
    const subject = `${statusIcon} ${workflowName}: ${statusTitle}`;

    const statusBadgeColor = isSuccess ? '#c6f6d5' : (isFailure ? '#fed7d7' : '#feebc8');
    const statusBadgeTextColor = isSuccess ? '#22543d' : (isFailure ? '#742a2a' : '#7b341e');
    const headerBg = isSuccess ? '#1a202c' : (isFailure ? '#742a2a' : '#744210');

    const htmlBody = `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f4f6f8; color: #2d3748; margin: 0; padding: 20px; line-height: 1.5; }
            .container { max-width: 650px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.06); border: 1px solid #e2e8f0; }
            .header { background: ${headerBg}; color: #ffffff; padding: 24px; text-align: center; }
            .header h1 { margin: 0 0 6px 0; font-size: 1.3rem; font-weight: 700; }
            .header p { margin: 0; font-size: 0.9rem; color: #cbd5e0; }
            .content { padding: 24px; }
            .card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin-bottom: 16px; }
            .meta-row { display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px solid #edf2f7; font-size: 0.95rem; }
            .meta-row:last-child { border-bottom: none; }
            .meta-label { font-weight: 600; color: #4a5568; }
            .meta-value { color: #2d3748; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, monospace; font-size: 0.9rem; text-align: right; }
            .badge { display: inline-block; background: ${statusBadgeColor}; color: ${statusBadgeTextColor}; font-size: 0.8rem; font-weight: bold; padding: 3px 10px; border-radius: 9999px; }
            .btn { display: inline-block; background: #3182ce; color: #ffffff !important; padding: 10px 20px; font-size: 0.9rem; font-weight: 600; text-decoration: none; border-radius: 6px; margin-top: 8px; text-align: center; }
            .btn:hover { background: #2b6cb0; }
            .footer { background: #edf2f7; color: #718096; padding: 16px; text-align: center; font-size: 0.8rem; border-top: 1px solid #e2e8f0; }
            .footer a { color: #4a5568; text-decoration: underline; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>${statusIcon} ${workflowName}</h1>
                <p>${statusTitle}</p>
            </div>
            <div class="content">
                <div class="card">
                    <div class="meta-row">
                        <span class="meta-label">Status</span>
                        <span class="badge">${rawStatus.toUpperCase()}</span>
                    </div>
                    <div class="meta-row">
                        <span class="meta-label">Trigger</span>
                        <span class="meta-value">${eventName}</span>
                    </div>
                    <div class="meta-row">
                        <span class="meta-label">Toronto Time</span>
                        <span class="meta-value">${localStr}</span>
                    </div>
                    <div class="meta-row">
                        <span class="meta-label">UTC Time</span>
                        <span class="meta-value">${utcStr}</span>
                    </div>
                    ${lastCommit ? `
                    <div class="meta-row">
                        <span class="meta-label">Latest Commit</span>
                        <span class="meta-value">${lastCommit}</span>
                    </div>
                    ` : ''}
                    ${customMessage ? `
                    <div class="meta-row">
                        <span class="meta-label">Details</span>
                        <span class="meta-value">${customMessage}</span>
                    </div>
                    ` : ''}
                </div>
                <div style="text-align: center; margin-top: 16px;">
                    <a href="${runUrl}" target="_blank" class="btn">View GitHub Actions Run &rarr;</a>
                </div>
            </div>
            <div class="footer">
                Automated workflow notification from <a href="${serverUrl}/${repository}" target="_blank">${repository}</a>.<br>
                <a href="https://koraytugay.github.io/my-board-game-collection/" target="_blank">View Board Game Collection</a>
            </div>
        </div>
    </body>
    </html>
    `;

    const textBody = [
        `${statusIcon} ${workflowName}: ${statusTitle}`,
        `----------------------------------------`,
        `Status:       ${rawStatus.toUpperCase()}`,
        `Trigger:      ${eventName}`,
        `Toronto Time: ${localStr}`,
        `UTC Time:     ${utcStr}`,
        lastCommit ? `Latest Commit: ${lastCommit}` : null,
        customMessage ? `Details:       ${customMessage}` : null,
        `Run URL:       ${runUrl}`,
        `----------------------------------------`,
        `Repository:    ${serverUrl}/${repository}`
    ].filter(Boolean).join('\n');

    console.log(`[INFO] Sending status notification: ${subject}`);
    await sendNotificationEmail(subject, htmlBody, textBody);
}

run().catch(err => {
    console.error('Error running status notification:', err);
    // Don't fail the workflow if notification fails
    process.exit(0);
});
