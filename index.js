// Import necessary modules
const express = require('express');
const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');
const cron = require('node-cron');

// Initialize the Express application
const app = express();
const port = 3000;

// Define the path for downloads
const downloadsPath = path.join(__dirname, 'downloads');

// Create the downloads directory if it doesn't exist
if (!fs.existsSync(downloadsPath)) {
    fs.mkdirSync(downloadsPath);
}

/**
 * Downloads the latest issue from the Weekly Link website.
 */
async function downloadLatestIssue() {
    // Clear the downloads directory before starting a new download
    const files = fs.readdirSync(downloadsPath);
    for (const file of files) {
        fs.unlinkSync(path.join(downloadsPath, file));
        console.log(`Deleted old file: ${file}`);
    }

    // Launch a headless browser instance with specific arguments for containerized environments
    const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    const page = await browser.newPage();
    const client = await page.target().createCDPSession();

    // Configure the browser to allow and save downloads to the specified path
    await client.send('Page.setDownloadBehavior', {
        behavior: 'allow',
        downloadPath: downloadsPath,
    });

    try {
        console.log('Navigating to the issues page...');
        await page.goto('https://weeklylink.com/issues/', { waitUntil: 'networkidle2' });

        console.log('Waiting for the iframe to load...');
        const iframeElement = await page.waitForSelector('iframe[src*="issuu.com"]');
        const frame = await iframeElement.contentFrame();

        if (frame) {
            console.log('Switched to iframe context.');

            // Wait for the download button to be available in the iframe and click it
            const downloadButtonSelector = 'button[data-testid="download-button"]';
            console.log('Waiting for the download button to be available in the iframe...');
            await frame.waitForSelector(downloadButtonSelector, { visible: true, timeout: 60000 });

            console.log('Clicking the download button...');
            await frame.click(downloadButtonSelector);

            // Wait for a fixed amount of time to allow the download to complete
            console.log('Download button pressed. Waiting for the download to complete...');
            await new Promise(resolve => setTimeout(resolve, 600000)); // 10 minutes

            console.log('Download should be complete.');
        } else {
            throw new Error('Could not find the iframe.');
        }
    } catch (error) {
        console.error('An error occurred during the download process:', error);
    } finally {
        // Ensure the browser is closed
        await browser.close();
        console.log('Browser closed.');
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
    const files = fs.readdirSync(downloadsPath);
    if (files.length > 0) {
        // Serve the first file found in the downloads directory
        const latestFile = path.join(downloadsPath, files[0]);
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
    downloadLatestIssue();
    console.log('Scheduled download will run at 1 AM every day.');
});