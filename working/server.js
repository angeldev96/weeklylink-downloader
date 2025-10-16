#!/usr/bin/env node

/**
 * Issuu Document Downloader API Server
 * 
 * This file starts the API server for automatic Issuu document downloads.
 */

// Import the API server
const app = require('./api');

// The server is already configured in api.js, we just need to import it
console.log('Starting automatic Issuu document download server...');
