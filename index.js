const express = require('express');
const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');
const cron = require('node-cron');

const app = express();
const port = 3000;

const downloadsPath = path.join(__dirname, 'downloads');

if (!fs.existsSync(downloadsPath)) {
    fs.mkdirSync(downloadsPath);
}

async function downloadLatestIssue() {
    // Clear the downloads directory before starting a new download
    const files = fs.readdirSync(downloadsPath);
    for (const file of files) {
        fs.unlinkSync(path.join(downloadsPath, file));
        console.log(`Deleted old file: ${file}`);
    }

    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();
    const client = await page.target().createCDPSession();

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

            const downloadButtonSelector = 'button[data-testid="download-button"]';
            console.log('Waiting for the download button to be available in the iframe...');
            await frame.waitForSelector(downloadButtonSelector, { visible: true, timeout: 60000 });

            console.log('Clicking the download button...');
            await frame.click(downloadButtonSelector);

            console.log('Download button pressed. Waiting for the download to complete...');
            await new Promise(resolve => setTimeout(resolve, 600000)); // 10 minutes

            console.log('Download should be complete.');
        } else {
            throw new Error('Could not find the iframe.');
        }
    } catch (error) {
        console.error('An error occurred during the download process:', error);
    } finally {
        await browser.close();
        console.log('Browser closed.');
    }
}

// Schedule the download to run at 1 AM every day
cron.schedule('0 1 * * *', () => {
    console.log('Running scheduled download...');
    downloadLatestIssue();
}, {
    scheduled: true,
    timezone: "America/New_York" // Adjust to your timezone
});

app.get('/download', (req, res) => {
    const files = fs.readdirSync(downloadsPath);
    if (files.length > 0) {
        // Assuming the first file is the one we want to serve
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

app.listen(port, () => {
    console.log(`Server listening at http://localhost:${port}`);
    console.log('Running initial download...');
    downloadLatestIssue();
    console.log('Scheduled download will run at 1 AM every day.');
});