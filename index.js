// Import necessary modules
const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const path = require('path');
const fs = require('fs');
const cron = require('node-cron');

// Initialize the Express application
const app = express();
const port = process.env.PORT ? Number(process.env.PORT) : 3000;

// Global error handlers
process.on('uncaughtException', (err) => {
    console.error('❌ Uncaught Exception:', err);
    console.error(err.stack);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
});

// Define the path for downloads
const downloadsPath = path.join(__dirname, 'downloads');

// Create the downloads directory if it doesn't exist
if (!fs.existsSync(downloadsPath)) {
    fs.mkdirSync(downloadsPath);
}

// Reuse Issuu downloader logic from working folder
const IssuuDownloader = require(path.join(__dirname, 'working', 'app'));
const issuuDownloader = new IssuuDownloader();

// Ensure downloader writes to our downloads directory
issuuDownloader.outputDir = downloadsPath;

async function fetchIssuesPageHtml() {
    const urls = [
        'https://weeklylink.com/issues/',
        'https://www.weeklylink.com/issues/'
    ];
    for (const url of urls) {
        try {
            const resp = await axios.get(url, { timeout: 20000, maxRedirects: 5, headers: { 'User-Agent': 'Mozilla/5.0' } });
            if (resp && resp.status >= 200 && resp.status < 300 && resp.data) {
                return String(resp.data);
            }
        } catch (e) {
            console.warn(`Failed to fetch ${url}: ${e.message}`);
        }
    }
    throw new Error('No pude obtener la página de issues de Weekly Link');
}

function extractIssuuUrlFromHtml(html) {
    // 1) Direct issuu link in anchors
    try {
        const $ = cheerio.load(html);
        const direct = $('a[href*="issuu.com"]').attr('href');
        if (direct) {
            return direct;
        }

        // 2) Issuu embedded iframe with params ?u=<user>&d=<doc>
        const iframeSrc = $('iframe[src*="issuu.com"]').attr('src');
        if (iframeSrc) {
            try {
                const u = new URL(iframeSrc);
                const user = u.searchParams.get('u');
                const doc = u.searchParams.get('d');
                if (user && doc) {
                    return `https://issuu.com/${user}/docs/${doc}`;
                }
                // Sometimes embed src already contains a docs url as a param or fragment
                const matchDocs = iframeSrc.match(/https?:\/\/issuu\.com\/[\w-]+\/docs\/[\w-]+/i);
                if (matchDocs) return matchDocs[0];
            } catch (_) {}
        }

        // 3) Regex fallback anywhere in the HTML
        const regex = /https?:\/\/issuu\.com\/[\w-]+\/docs\/[\w-]+/i;
        const m = html.match(regex);
        if (m) return m[0];
    } catch (_) {}
    return null;
}

/**
 * Downloads the latest issue from the Weekly Link website.
 */
async function downloadLatestIssue() {
    try {
        console.log('Buscando el último Issuu de Weekly Link...');
        const html = await fetchIssuesPageHtml();
        const issuuUrl = extractIssuuUrlFromHtml(html);
        if (!issuuUrl) throw new Error('No encontré el enlace de Issuu en la página de issues.');

        console.log(`Último Issuu detectado: ${issuuUrl}`);

        // Descargar usando la estrategia de IssuuDownloader
        const success = await issuuDownloader.downloadDocument(issuuUrl);
        if (!success) throw new Error('Falló la descarga desde Issuu.');

        // Mantener solo el archivo más reciente (borra anteriores después de éxito)
        try {
            const files = fs.readdirSync(downloadsPath).filter(f => f.endsWith('.pdf'));
            if (files.length > 1) {
                const sorted = files
                    .map(name => ({ name, time: fs.statSync(path.join(downloadsPath, name)).mtimeMs }))
                    .sort((a, b) => b.time - a.time);
                const keep = sorted[0].name;
                for (let i = 1; i < sorted.length; i++) {
                    const fp = path.join(downloadsPath, sorted[i].name);
                    try { fs.unlinkSync(fp); } catch (_) {}
                }
                console.log(`Último archivo conservado: ${keep}`);
            }
        } catch (e) {
            console.warn('No se pudo limpiar archivos antiguos:', e.message);
        }
    } catch (error) {
        console.error('Ocurrió un error durante la descarga:', error.message);
        throw error;
    }
}

// Schedule the download to run at 1 AM every day (timezone: America/New_York)
cron.schedule('0 1 * * *', () => {
    console.log('Running scheduled download...');
    downloadLatestIssue();
}, {
    scheduled: true,
    timezone: "America/New_York"
});

// Define the /download endpoint to serve the latest file with optimized streaming
app.get('/download', async (req, res) => {
    try {
        console.log('📥 Download request received');
        
        if (!fs.existsSync(downloadsPath)) {
            console.log('📁 Creating downloads directory');
            fs.mkdirSync(downloadsPath, { recursive: true });
        }
        
        const allFiles = fs.readdirSync(downloadsPath);
        const files = allFiles.filter(f => f.endsWith('.pdf') && !f.endsWith('.tmp'));
        
        // Si no hay archivos, descargar uno ahora
        if (files.length === 0) {
            console.log('⚠️ No files available, downloading now...');
            try {
                await downloadLatestIssue();
                // Recheck after download
                const newFiles = fs.readdirSync(downloadsPath).filter(f => f.endsWith('.pdf') && !f.endsWith('.tmp'));
                if (newFiles.length === 0) {
                    return res.status(500).json({ error: 'Failed to download file' });
                }
            } catch (downloadError) {
                console.error('❌ Download failed:', downloadError);
                return res.status(500).json({ error: 'Failed to download file: ' + downloadError.message });
            }
        }
        
        // Get latest file again
        const allFilesAfter = fs.readdirSync(downloadsPath);
        const filesAfter = allFilesAfter.filter(f => f.endsWith('.pdf') && !f.endsWith('.tmp'));
        
        const latest = filesAfter
            .map(name => ({ name, time: fs.statSync(path.join(downloadsPath, name)).mtimeMs }))
            .sort((a, b) => b.time - a.time)[0].name;
        
        const latestFile = path.join(downloadsPath, latest);
        console.log('📄 Serving file:', latestFile);
        
        if (!fs.existsSync(latestFile)) {
            return res.status(404).json({ error: 'File not found' });
        }
        
        const stats = fs.statSync(latestFile);
        console.log('📊 File size:', (stats.size / 1024 / 1024).toFixed(2), 'MB');
        
        // Set headers for streaming
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Length', stats.size);
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(latest)}"`);
        res.setHeader('Cache-Control', 'public, max-age=86400'); // Cache for 24 hours
        res.setHeader('Accept-Ranges', 'bytes');
        
        // Use streaming for large files (más eficiente que sendFile para archivos grandes)
        const stream = fs.createReadStream(latestFile, {
            highWaterMark: 1024 * 1024 // 1MB chunks para mejor performance
        });
        
        stream.on('error', (err) => {
            console.error('❌ Stream error:', err);
            if (!res.headersSent) {
                res.status(500).json({ error: 'Error streaming file' });
            } else {
                res.end();
            }
        });
        
        stream.on('end', () => {
            console.log('✅ File streamed successfully');
        });
        
        // Pipe the file stream to response
        stream.pipe(res);
        
    } catch (error) {
        console.error('💥 Error in /download endpoint:', error);
        if (!res.headersSent) {
            res.status(500).json({ error: 'Internal server error: ' + error.message });
        }
    }
});

// Health check endpoint
app.get('/health', (req, res) => {
    try {
        const files = fs.existsSync(downloadsPath) 
            ? fs.readdirSync(downloadsPath).filter(f => f.endsWith('.pdf') && !f.endsWith('.tmp'))
            : [];
        res.json({
            status: 'ok',
            downloadsPath,
            filesAvailable: files.length,
            files: files.map(name => {
                const filePath = path.join(downloadsPath, name);
                const stats = fs.statSync(filePath);
                return {
                    name,
                    size: `${(stats.size / 1024 / 1024).toFixed(2)} MB`,
                    modified: new Date(stats.mtimeMs).toISOString()
                };
            })
        });
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
});

// Start the Express server
app.listen(port, () => {
    console.log(`Server listening at http://localhost:${port}`);
    console.log('✅ Server ready!');
    console.log('📁 Downloads directory:', downloadsPath);
    console.log('📁 Downloads directory (resolved):', path.resolve(downloadsPath));
    console.log('📁 Downloads directory exists:', fs.existsSync(downloadsPath));
    
    // Check if there are existing files
    if (fs.existsSync(downloadsPath)) {
        const files = fs.readdirSync(downloadsPath).filter(f => f.endsWith('.pdf') && !f.endsWith('.tmp'));
        if (files.length > 0) {
            console.log(`📄 Found ${files.length} existing file(s)`);
        } else {
            console.log('⚠️  No files found - will download on first request');
        }
    } else {
        console.log('⚠️  Downloads directory does not exist - will be created on first request');
    }
    
    console.log('⏰ Scheduled download will run at 1 AM every day (America/New_York)');
}).on('error', (err) => {
    console.error('❌ Server error:', err);
    process.exit(1);
});

// Optional: manual trigger endpoints
app.get('/refresh', async (req, res) => {
    try {
        await downloadLatestIssue();
        res.json({ ok: true, message: 'Download completed' });
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});