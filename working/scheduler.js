const cron = require('node-cron');
const path = require('path');
const fs = require('fs');
const IssuuDownloader = require('./app');
const IssueTracker = require('./issueTracker');
const CacheManager = require('./cacheManager');

class DownloadScheduler {
    constructor() {
        this.downloader = new IssuuDownloader();
        this.tracker = new IssueTracker();
        this.cache = new CacheManager();
        this.logDir = 'logs';
        this.ensureLogDir();
    }

    /**
     * Creates the logs directory if it doesn't exist
     */
    ensureLogDir() {
        if (!fs.existsSync(this.logDir)) {
            fs.mkdirSync(this.logDir, { recursive: true });
        }
    }

    /**
     * Logs a message to the log file
     * @param {string} message - The message to log
     */
    logMessage(message) {
        const date = new Date();
        const logFile = path.join(this.logDir, `download-${date.toISOString().split('T')[0]}.log`);
        const logEntry = `[${date.toISOString()}] ${message}\n`;
        
        fs.appendFileSync(logFile, logEntry);
        console.log(message);
    }

    /**
     * Downloads the latest available issue and saves it to cache
     */
    async downloadLatestIssue() {
        try {
            this.logMessage('Starting scheduled download of latest issue...');
            
            // Get the latest issue URL
            const latestIssueUrl = await this.tracker.getLatestIssueUrl();
            const issueNumber = parseInt(latestIssueUrl.split('_').pop(), 10);
            
            this.logMessage(`Latest issue URL: ${latestIssueUrl}`);
            
            // Check if already in cache
            if (this.cache.isIssueInCache(issueNumber)) {
                this.logMessage(`Issue ${issueNumber} is already in cache.`);
                return;
            }
            
            // Check if file already exists in downloads
            const fileName = `issue ${issueNumber}.pdf`;
            const filePath = path.join(this.downloader.outputDir, fileName);
            
            let downloadSuccess = false;
            
            if (fs.existsSync(filePath)) {
                this.logMessage(`Issue ${issueNumber} has already been downloaded previously.`);
                downloadSuccess = true;
            } else {
                // Download the document
                this.logMessage(`Downloading issue ${issueNumber}...`);
                downloadSuccess = await this.downloader.downloadDocument(latestIssueUrl);
                
                if (downloadSuccess) {
                    this.logMessage(`Issue ${issueNumber} downloaded successfully.`);
                } else {
                    this.logMessage(`Error downloading issue ${issueNumber}.`);
                    return;
                }
            }
            
            // Save to cache if download was successful
            if (downloadSuccess) {
                try {
                    const cachedPath = this.cache.cacheFile(filePath, issueNumber);
                    this.logMessage(`Issue ${issueNumber} saved to cache: ${cachedPath}`);
                } catch (cacheError) {
                    this.logMessage(`Error saving to cache: ${cacheError.message}`);
                }
            }
        } catch (error) {
            this.logMessage(`Error in scheduled download: ${error.message}`);
        }
    }

    /**
     * Schedules weekly download for every Wednesday at 9:00 AM
     * and daily check at 10:00 AM for new issues
     */
    scheduleWeeklyDownload() {
        // Run every Wednesday at 9:00 AM
        cron.schedule('0 9 * * 3', async () => {
            await this.downloadLatestIssue();
        });
        
        // Check daily at 10:00 AM if there's a new issue available
        cron.schedule('0 10 * * *', async () => {
            try {
                const latestIssueNumber = await this.tracker.getLatestIssueNumber();
                if (!this.cache.isCacheUpToDate(latestIssueNumber)) {
                    this.logMessage(`New issue detected (${latestIssueNumber}). Updating cache...`);
                    await this.downloadLatestIssue();
                } else {
                    this.logMessage(`Cache is up to date. Latest issue: ${latestIssueNumber}`);
                }
            } catch (error) {
                this.logMessage(`Error checking for updates: ${error.message}`);
            }
        });
        
        this.logMessage('Weekly download scheduled for Wednesdays at 9:00 AM');
        this.logMessage('Daily check scheduled for 10:00 AM');
    }

    /**
     * Runs an immediate download of the latest issue
     */
    async runImmediateDownload() {
        await this.downloadLatestIssue();
    }
}

module.exports = DownloadScheduler;
