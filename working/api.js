const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const IssuuDownloader = require('./app');
const IssueTracker = require('./issueTracker');
const DownloadScheduler = require('./scheduler');
const CacheManager = require('./cacheManager');

// Create instances
const downloader = new IssuuDownloader();
const tracker = new IssueTracker();
const scheduler = new DownloadScheduler();
const cache = new CacheManager();

// Create Express server
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use('/downloads', express.static(path.join(__dirname, 'downloads')));
app.use('/cache', express.static(path.join(__dirname, 'cache')));

// Endpoint to get latest issue information
app.get('/api/latest', async (req, res) => {
    try {
        const latestIssueNumber = await tracker.getLatestIssueNumber();
        const latestIssueUrl = tracker.getIssueUrl(latestIssueNumber);
        
        // Check if it's in cache
        const isInCache = cache.isIssueInCache(latestIssueNumber);
        let downloadUrl = null;
        
        if (isInCache) {
            const metadata = cache.getMetadata();
            downloadUrl = `/cache/${encodeURIComponent(metadata.fileName)}`;
        } else {
            // Check if file already exists in downloads
            const fileName = `issue ${latestIssueNumber}.pdf`;
            const filePath = path.join(downloader.outputDir, fileName);
            const fileExists = fs.existsSync(filePath);
            
            if (fileExists) {
                downloadUrl = `/downloads/${encodeURIComponent(fileName)}`;
                
                // If exists in downloads but not in cache, save it to cache
                try {
                    cache.cacheFile(filePath, latestIssueNumber);
                    downloadUrl = `/cache/${encodeURIComponent(`latest_issue_${latestIssueNumber}.pdf`)}`;
                } catch (cacheError) {
                    console.error('Error saving to cache:', cacheError);
                }
            }
        }
        
        res.json({
            issueNumber: latestIssueNumber,
            issueUrl: latestIssueUrl,
            isDownloaded: !!downloadUrl,
            downloadUrl: downloadUrl
        });
    } catch (error) {
        console.error('Error getting latest issue information:', error);
        res.status(500).json({ error: 'Error getting latest issue information' });
    }
});

// Endpoint to download the latest issue
app.get('/api/download/latest', async (req, res) => {
    try {
        const latestIssueUrl = await tracker.getLatestIssueUrl();
        const issueNumber = parseInt(latestIssueUrl.split('_').pop(), 10);
        
        // Check if already in cache
        if (cache.isIssueInCache(issueNumber)) {
            const metadata = cache.getMetadata();
            const cachedFilePath = cache.getCachedFilePath();

            // Serve file as a stream with Content-Length and checksum header
            try {
                const stats = fs.statSync(cachedFilePath);
                res.setHeader('Content-Disposition', `attachment; filename=\"issue_${metadata.issueNumber}.pdf\"`);
                res.setHeader('Content-Type', 'application/pdf');
                res.setHeader('Content-Length', stats.size);
                if (metadata && metadata.checksum) {
                    res.setHeader('X-Content-Checksum', metadata.checksum);
                }

                const stream = fs.createReadStream(cachedFilePath);
                stream.on('error', (err) => {
                    console.error('Stream error while serving cached file:', err);
                    if (!res.headersSent) {
                        res.status(500).json({ error: 'Error reading cached file' });
                    } else {
                        res.end();
                    }
                });
                return stream.pipe(res);
            } catch (err) {
                console.error('Error serving cached file as stream:', err);
                return res.status(500).json({ error: 'Error serving cached file' });
            }
        }
        
        // Check if file already exists in downloads
        const fileName = `issue ${issueNumber}.pdf`;
        const filePath = path.join(downloader.outputDir, fileName);
        
        if (fs.existsSync(filePath)) {
            // If exists in downloads but not in cache, save it to cache
            try {
                const cachedPath = cache.cacheFile(filePath, issueNumber);

                try {
                    const stats = fs.statSync(cachedPath);
                    res.setHeader('Content-Disposition', `attachment; filename=\"issue_${issueNumber}.pdf\"`);
                    res.setHeader('Content-Type', 'application/pdf');
                    res.setHeader('Content-Length', stats.size);
                    const metadata = cache.getMetadata();
                    if (metadata && metadata.checksum) {
                        res.setHeader('X-Content-Checksum', metadata.checksum);
                    }

                    const stream = fs.createReadStream(cachedPath);
                    stream.on('error', (err) => {
                        console.error('Stream error while serving file:', err);
                        if (!res.headersSent) {
                            res.status(500).json({ error: 'Error reading file' });
                        } else {
                            res.end();
                        }
                    });
                    return stream.pipe(res);
                } catch (streamErr) {
                    console.error('Error streaming cached file:', streamErr);
                    return res.status(500).json({ error: 'Error serving file' });
                }
            } catch (cacheError) {
                console.error('Error saving to cache:', cacheError);

                // If error saving to cache, serve original file as stream
                try {
                    const stats = fs.statSync(filePath);
                    res.setHeader('Content-Disposition', `attachment; filename=\"issue_${issueNumber}.pdf\"`);
                    res.setHeader('Content-Type', 'application/pdf');
                    res.setHeader('Content-Length', stats.size);

                    const stream = fs.createReadStream(filePath);
                    stream.on('error', (err) => {
                        console.error('Stream error while serving original file:', err);
                        if (!res.headersSent) {
                            res.status(500).json({ error: 'Error reading file' });
                        } else {
                            res.end();
                        }
                    });
                    return stream.pipe(res);
                } catch (origErr) {
                    console.error('Error serving original file:', origErr);
                    return res.status(500).json({ error: 'Error serving file' });
                }
            }
        }
        
        // Start background download
        res.json({
            success: true,
            message: `Download of issue ${issueNumber} started. This process may take several minutes.`,
            status: 'downloading'
        });
        
        // Perform download after sending response
        const success = await downloader.downloadDocument(latestIssueUrl);
        console.log(`Download of issue ${issueNumber} ${success ? 'completed' : 'failed'}.`);
        
        // If download was successful, save to cache
        if (success) {
            try {
                cache.cacheFile(filePath, issueNumber);
                console.log(`Issue ${issueNumber} saved to cache.`);
            } catch (cacheError) {
                console.error('Error saving to cache:', cacheError);
            }
        }
    } catch (error) {
        console.error('Error downloading latest issue:', error);
        // No response sent here because a response was already sent
    }
});

// Endpoint to get download status
app.get('/api/status/:issueNumber', (req, res) => {
    const issueNumber = parseInt(req.params.issueNumber, 10);
    
    // Check if it's in cache
    if (cache.isIssueInCache(issueNumber)) {
        const metadata = cache.getMetadata();
        const cachedFilePath = cache.getCachedFilePath();
        const stats = fs.statSync(cachedFilePath);
        
        return res.json({
            issueNumber,
            status: 'cached',
            fileSize: stats.size,
            fileSizeMB: (stats.size / 1024 / 1024).toFixed(2),
            downloadUrl: `/cache/${encodeURIComponent(metadata.fileName)}`,
            cachedAt: metadata.cachedAt
        });
    }
    
    // If not in cache, check in downloads
    const fileName = `issue ${issueNumber}.pdf`;
    const filePath = path.join(downloader.outputDir, fileName);
    
    if (fs.existsSync(filePath)) {
        const stats = fs.statSync(filePath);
        res.json({
            issueNumber,
            status: 'completed',
            fileSize: stats.size,
            fileSizeMB: (stats.size / 1024 / 1024).toFixed(2),
            downloadUrl: `/downloads/${encodeURIComponent(fileName)}`
        });
    } else {
        res.json({
            issueNumber,
            status: 'not_found'
        });
    }
});

// Endpoint to list all downloaded issues
app.get('/api/downloads', (req, res) => {
    try {
        if (!fs.existsSync(downloader.outputDir)) {
            return res.json({ downloads: [] });
        }
        
        const files = fs.readdirSync(downloader.outputDir)
            .filter(file => file.endsWith('.pdf'))
            .map(file => {
                const filePath = path.join(downloader.outputDir, file);
                const stats = fs.statSync(filePath);
                const match = file.match(/issue\s+(\d+)\.pdf/i);
                const issueNumber = match ? parseInt(match[1], 10) : null;
                
                return {
                    fileName: file,
                    issueNumber,
                    fileSize: (stats.size / 1024 / 1024).toFixed(2) + ' MB',
                    downloadUrl: `/downloads/${encodeURIComponent(file)}`,
                    createdAt: stats.birthtime
                };
            })
            .sort((a, b) => (b.issueNumber || 0) - (a.issueNumber || 0));
        
        res.json({ downloads: files });
    } catch (error) {
        console.error('Error listing downloads:', error);
        res.status(500).json({ error: 'Error listing downloads' });
    }
});

// Start download scheduler
scheduler.scheduleWeeklyDownload();

// Endpoint to get cached file directly
app.get('/api/cached-file', (req, res) => {
    try {
        const cachedFilePath = cache.getCachedFilePath();
        
        if (!cachedFilePath) {
            return res.status(404).json({
                error: 'No cached file available'
            });
        }
        
        const metadata = cache.getMetadata();
        
        // Serve file directly with absolute path
        res.sendFile(path.resolve(cachedFilePath), {
            headers: {
                'Content-Disposition': `attachment; filename="issue_${metadata.issueNumber}.pdf"`,
                'Content-Type': 'application/pdf'
            }
        });
    } catch (error) {
        console.error('Error serving cached file:', error);
        res.status(500).json({ error: 'Error serving cached file' });
    }
});

// Start server
app.listen(PORT, () => {
    console.log(`API Server started at http://localhost:${PORT}`);
    console.log('Available endpoints:');
    console.log('- GET  /api/latest          - Get latest issue information');
    console.log('- GET  /api/download/latest - Download latest issue');
    console.log('- GET  /api/cached-file     - Get cached file directly');
    console.log('- GET  /api/status/:issueNumber - Check download status');
    console.log('- GET  /api/downloads       - List all downloaded issues');
    console.log('- GET  /downloads/:filename  - Download specific file');
    console.log('- GET  /cache/:filename      - Download specific file from cache');
});

module.exports = app;
