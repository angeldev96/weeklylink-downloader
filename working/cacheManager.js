const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

/**
 * Cache manager for downloaded files
 * Maintains only the latest available file and removes previous ones
 */
class CacheManager {
    constructor() {
        this.cacheDir = 'cache';
        this.ensureCacheDir();
    }

    /**
     * Creates the cache directory if it doesn't exist
     */
    ensureCacheDir() {
        if (!fs.existsSync(this.cacheDir)) {
            fs.mkdirSync(this.cacheDir, { recursive: true });
        }
    }

    /**
     * Saves a file to cache
     * @param {string} sourceFilePath - Source file path
     * @param {number} issueNumber - Issue number
     * @returns {string} - Cached file path
     */
    cacheFile(sourceFilePath, issueNumber) {
        if (!fs.existsSync(sourceFilePath)) {
            throw new Error(`Source file does not exist: ${sourceFilePath}`);
        }

        // Clear previous cache
        this.clearCache();

        // Create cache filename
        const cacheFileName = `latest_issue_${issueNumber}.pdf`;
        const cacheFilePath = path.join(this.cacheDir, cacheFileName);

        // Copy file to cache (synchronously)
        fs.copyFileSync(sourceFilePath, cacheFilePath);

        console.log(`File saved to cache: ${cacheFilePath}`);

        // Compute checksum and size
        try {
            const fileBuffer = fs.readFileSync(cacheFilePath);
            const checksum = crypto.createHash('sha256').update(fileBuffer).digest('hex');
            const stats = fs.statSync(cacheFilePath);

            // Save metadata with checksum and size
            this.saveMetadata(issueNumber, checksum, stats.size);
        } catch (err) {
            console.error('Error computing checksum for cache file:', err);
            // Save metadata without checksum
            this.saveMetadata(issueNumber);
        }
        
        return cacheFilePath;
    }

    /**
     * Saves metadata for the latest issue in cache
     * @param {number} issueNumber - Issue number
     */
    saveMetadata(issueNumber, checksum = null, fileSize = null) {
        const metadata = {
            issueNumber,
            cachedAt: new Date().toISOString(),
            fileName: `latest_issue_${issueNumber}.pdf`
        };

        if (checksum) metadata.checksum = checksum;
        if (fileSize !== null) metadata.fileSize = fileSize;

        fs.writeFileSync(
            path.join(this.cacheDir, 'metadata.json'),
            JSON.stringify(metadata, null, 2)
        );
    }

    /**
     * Gets metadata for the latest issue in cache
     * @returns {Object|null} - Metadata or null if no cache exists
     */
    getMetadata() {
        const metadataPath = path.join(this.cacheDir, 'metadata.json');
        
        if (!fs.existsSync(metadataPath)) {
            return null;
        }
        
        try {
            const data = fs.readFileSync(metadataPath, 'utf8');
            return JSON.parse(data);
        } catch (error) {
            console.error('Error reading cache metadata:', error);
            return null;
        }
    }

    /**
     * Checks if a specific issue is in cache
     * @param {number} issueNumber - Issue number to check
     * @returns {boolean} - true if in cache
     */
    isIssueInCache(issueNumber) {
        const metadata = this.getMetadata();
        return metadata !== null && metadata.issueNumber === issueNumber;
    }

    /**
     * Gets the cached file path
     * @returns {string|null} - File path or null if doesn't exist
     */
    getCachedFilePath() {
        const metadata = this.getMetadata();
        
        if (!metadata) {
            return null;
        }
        
        const filePath = path.join(this.cacheDir, metadata.fileName);
        
        if (!fs.existsSync(filePath)) {
            return null;
        }
        
        return filePath;
    }

    /**
     * Clears all files from cache except metadata.json
     */
    clearCache() {
        if (!fs.existsSync(this.cacheDir)) {
            return;
        }
        
        const files = fs.readdirSync(this.cacheDir);
        
        for (const file of files) {
            if (file !== 'metadata.json') {
                const filePath = path.join(this.cacheDir, file);
                fs.unlinkSync(filePath);
                console.log(`File removed from cache: ${filePath}`);
            }
        }
    }

    /**
     * Checks if cache is up to date by comparing with issue number
     * @param {number} latestIssueNumber - Latest available issue number
     * @returns {boolean} - true if cache is up to date
     */
    isCacheUpToDate(latestIssueNumber) {
        const metadata = this.getMetadata();
        return metadata !== null && metadata.issueNumber >= latestIssueNumber;
    }
}

module.exports = CacheManager;
