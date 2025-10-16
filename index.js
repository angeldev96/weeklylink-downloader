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

// Define the /download endpoint to serve the latest file
app.get('/download', (req, res) => {
    const files = fs
        .readdirSync(downloadsPath)
        .filter(f => !f.endsWith('.crdownload'));
    if (files.length > 0) {
        const latest = files
            .map(name => ({ name, time: fs.statSync(path.join(downloadsPath, name)).mtimeMs }))
            .sort((a, b) => b.time - a.time)[0].name;
        const latestFile = path.join(downloadsPath, latest);
        res.download(latestFile, (err) => {
            if (err) {
                console.error('Error sending the file:', err);
                if (!res.headersSent) {
                    res.status(500).send('Error sending the file.');
                }
            }
        });
    } else {
        res.status(404).send('File not found. It may not have been downloaded yet.');
    }
});

// Start the Express server
app.listen(port, () => {
    console.log(`Server listening at http://localhost:${port}`);
    // Trigger an initial download when the server starts
    console.log('Running initial download...');
    downloadLatestIssue().catch(() => console.warn('Initial download failed; will retry on schedule.'));
    console.log('Scheduled download will run at 1 AM every day.');
});

// Optional: manual trigger endpoint
app.get('/refresh', async (req, res) => {
    try {
        await downloadLatestIssue();
        res.json({ ok: true, message: 'Download completed' });
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});