#!/usr/bin/env node

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

/**
 * Issuu Document Downloader

 */
class IssuuDownloader {
    constructor() {
        this.apiUrl = 'https://backend.img2pdf.net/download-pdf';
        this.statusUrl = 'https://backend.img2pdf.net/job';
        this.outputDir = 'downloads';
        this.lastPdfUrl = null; // Store the last downloaded PDF URL
    }

    /**
     * Makes an HTTP/HTTPS request
     */
    makeRequest(url, options = {}) {
        return new Promise((resolve, reject) => {
            const urlObj = new URL(url);
            const isHttps = urlObj.protocol === 'https:';
            const client = isHttps ? https : http;
            
            const requestOptions = {
                hostname: urlObj.hostname,
                port: urlObj.port || (isHttps ? 443 : 80),
                path: urlObj.pathname + urlObj.search,
                method: options.method || 'GET',
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                    'Accept': 'application/json',
                    ...options.headers
                }
            };

            const req = client.request(requestOptions, (res) => {
                // Collect raw Buffer chunks and concat to avoid encoding corruption
                const chunks = [];

                res.on('data', (chunk) => {
                    chunks.push(Buffer.from(chunk));
                });

                res.on('end', () => {
                    const buffer = Buffer.concat(chunks);
                    // Convert to string for JSON responses; caller may parse JSON
                    const dataStr = buffer.toString('utf8');

                    resolve({
                        statusCode: res.statusCode,
                        headers: res.headers,
                        data: dataStr
                    });
                });

                res.on('error', (err) => {
                    reject(err);
                });
            });

            req.on('error', (err) => {
                reject(err);
            });

            if (options.data) {
                req.write(options.data);
            }

            req.end();
        });
    }

    /**
     * Downloads a file from a URL
     */
    downloadFile(url, outputPath) {
        return new Promise((resolve, reject) => {
            const urlObj = new URL(url);
            const isHttps = urlObj.protocol === 'https:';
            const client = isHttps ? https : http;
            
            // Write to a temporary file first, then rename to avoid serving partial files
            const tmpPath = `${outputPath}.tmp`;
            const file = fs.createWriteStream(tmpPath);

            const request = client.get(url, (response) => {
                if (response.statusCode !== 200) {
                    // consume response and delete tmp file
                    response.resume();
                    file.destroy();
                    fs.unlink(tmpPath, () => {});
                    return reject(new Error(`Error downloading: ${response.statusCode}`));
                }

                response.pipe(file);

                // Handle response errors
                response.on('error', (err) => {
                    file.destroy();
                    fs.unlink(tmpPath, () => {});
                    reject(err);
                });

                // Handle file stream errors
                file.on('error', (err) => {
                    response.unpipe(file);
                    fs.unlink(tmpPath, () => {});
                    reject(err);
                });

                file.on('finish', () => {
                    // Ensure data is flushed to disk then rename
                    file.close((closeErr) => {
                        if (closeErr) {
                            fs.unlink(tmpPath, () => {});
                            return reject(closeErr);
                        }

                        // Atomically move temp file to final destination
                        fs.rename(tmpPath, outputPath, (renameErr) => {
                            if (renameErr) {
                                fs.unlink(tmpPath, () => {});
                                return reject(renameErr);
                            }
                            resolve();
                        });
                    });
                });
            });

            request.on('error', (err) => {
                file.destroy();
                fs.unlink(tmpPath, () => {}); // Delete partial file
                reject(err);
            });
        });
    }

    /**
     * Waits for a specified time
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Formats the file name to be safe for the file system
     */
    formatFileName(name) {
        return name.replace(/[^a-zA-Z0-9\-_\. ]/g, '').trim();
    }

    /**
     * Creates the output directory if it doesn't exist
     */
    ensureOutputDir() {
        if (!fs.existsSync(this.outputDir)) {
            fs.mkdirSync(this.outputDir, { recursive: true });
        }
    }

    /**
     * Initiates the conversion of the Issuu document to PDF
     */
    async startConversion(documentUrl) {
        console.log(`🔄 Starting conversion for: ${documentUrl}`);
        
        const payload = JSON.stringify({ url: documentUrl });
        
        try {
            const response = await this.makeRequest(this.apiUrl, {
                method: 'POST',
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.3',
                    'Accept': 'application/json',
                    'Accept-Encoding': 'utf8',
                    'Content-Length': Buffer.byteLength(payload).toString(),
                    'Content-Type': 'application/json',
                    'Custom-Request-Id': '44AA3F37-FBED-4B77-BE51-5CFC2FED5869',
                    'Origin': 'https://issuudownload.com',
                    'Priority': 'u=1, i',
                    'Referer': 'https://issuudownload.com/',
                    'Scope': 'issuu',
                    'Sec-Ch-ua': '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
                    'Sec-Ch-ua-Mobile': '?0',
                    'Sec-Ch-ua-Platform': '"Windows"',
                    'Sec-Fetch-Dest': 'empty',
                    'Sec-Fetch-Mode': 'cors',
                    'Sec-Fetch-Site': 'cross-site'
                },
                data: payload
            });

            if (response.statusCode !== 200) {
                throw new Error(`Request error: ${response.statusCode}`);
            }

            const result = JSON.parse(response.data);
            console.log(`📋 Server Response:`, result);
            
            return result;
        } catch (error) {
            console.error(`❌ Error starting conversion:`, error.message);
            throw error;
        }
    }

    /**
     * Checks the conversion status
     */
    async checkConversionStatus(jobId) {
        try {
            const response = await this.makeRequest(`${this.statusUrl}/${jobId}`, {
                method: 'GET',
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.3',
                    'Accept': 'application/json',
                    'Accept-Encoding': 'utf8',
                    'Content-Type': 'application/json',
                    'Custom-Request-Id': '44AA3F37-FBED-4B77-BE51-5CFC2FED5869',
                    'Origin': 'https://issuudownload.com',
                    'Priority': 'u=1, i',
                    'Referer': 'https://issuudownload.com/',
                    'Scope': 'issuu',
                    'Sec-Ch-ua': '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
                    'Sec-Ch-ua-Mobile': '?0',
                    'Sec-Ch-ua-Platform': '"Windows"',
                    'Sec-Fetch-Dest': 'empty',
                    'Sec-Fetch-Mode': 'cors',
                    'Sec-Fetch-Site': 'cross-site'
                }
            });
            
            if (response.statusCode !== 200) {
                throw new Error(`Error checking status: ${response.statusCode}`);
            }

            return JSON.parse(response.data);
        } catch (error) {
            console.error(`❌ Error checking status:`, error.message);
            throw error;
        }
    }

    /**
     * Downloads an Issuu document
     */
    async downloadDocument(documentUrl, customFileName = null) {
        try {
            this.ensureOutputDir();
            
            // Extract document name from URL
            const urlParts = documentUrl.split('/');
            const documentName = customFileName || urlParts[urlParts.length - 1].replace(/[_-]/g, ' ');
            const fileName = this.formatFileName(documentName) + '.pdf';
            const outputPath = path.join(this.outputDir, fileName);
            
            console.log(`📄 Document: ${documentName}`);
            console.log(`💾 Output File: ${outputPath}`);
            
            // Start conversion
            const conversionResult = await this.startConversion(documentUrl);
            
            // If the file is already ready
            if (conversionResult.outputFile) {
                console.log(`⬇️  Downloading PDF from: ${conversionResult.outputFile}`);
                this.lastPdfUrl = conversionResult.outputFile; // Store URL
                await this.downloadFile(conversionResult.outputFile, outputPath);
                
                const stats = fs.statSync(outputPath);
                console.log(`✅ Download complete!`);
                console.log(`📊 Size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
                return true;
            }
            
            // If we need to wait for processing
            if (conversionResult.id) {
                const jobId = conversionResult.id;
                console.log(`⏳ Waiting for processing (ID: ${jobId})...`);
                
                let attempts = 0;
                const maxAttempts = 30; // 5 minutes max
                
                while (attempts < maxAttempts) {
                    await this.sleep(10000); // Wait 10 seconds
                    
                    const status = await this.checkConversionStatus(jobId);
                    console.log(`📊 Status: ${status.status} - Progress: ${status.progress || 0}%`);
                    
                    if (status.status === 'succeeded' && status.outputFile) {
                        console.log(`⬇️  Downloading PDF from: ${status.outputFile}`);
                        this.lastPdfUrl = status.outputFile; // Store URL
                        await this.downloadFile(status.outputFile, outputPath);
                        
                        const stats = fs.statSync(outputPath);
                        console.log(`✅ Download complete!`);
                        console.log(`📊 Size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
                        return true;
                    }
                    
                    if (status.status === 'failed') {
                        throw new Error('Conversion failed on server');
                    }
                    
                    attempts++;
                }
                
                throw new Error('Timeout waiting for conversion');
            }
            
            throw new Error('Unexpected server response');
            
        } catch (error) {
            console.error(`💔 Error during download:`, error.message);
            return false;
        }
    }
}

/**
 * Main function
 */
async function main() {
    const args = process.argv.slice(2);
    
    if (args.length === 0) {
        console.log('🔽 Issuu Document Downloader');
        console.log('=====================================');
        console.log('');
        console.log('Usage:');
        console.log('  node app.js <ISSUU_URL> [custom_name]');
        console.log('');
        console.log('Examples:');
        console.log('  node app.js https://issuu.com/thebpview/docs/issue_296');
        console.log('  node app.js https://issuu.com/thebpview/docs/issue_296 "Issue 296 Custom Name"');
        console.log('');
        process.exit(1);
    }
    
    const documentUrl = args[0];
    const customFileName = args[1] || null;
    
    // Validate URL
    if (!documentUrl.includes('issuu.com')) {
        console.error('❌ Error: URL must be from issuu.com');
        process.exit(1);
    }
    
    console.log('🔽 Issuu Document Downloader');
    console.log('=====================================');
    console.log('');
    
    const downloader = new IssuuDownloader();
    const success = await downloader.downloadDocument(documentUrl, customFileName);
    
    if (success) {
        console.log('');
        console.log('🎉 Download successful! Check the "downloads" folder.');
    } else {
        console.log('');
        console.log('💔 Download failed. Check previous errors.');
        process.exit(1);
    }
}

// Execute if called directly
if (require.main === module) {
    main().catch(error => {
        console.error('💥 Fatal Error:', error.message);
        process.exit(1);
    });
}

module.exports = IssuuDownloader;