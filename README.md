# Weekly Link Downloader

This project is a Node.js application that automatically downloads the latest issue of the "Weekly Link" publication and serves it through a web server.

## Features

- **Automatic Downloads**: The application is scheduled to download the latest issue every day at 1:00 AM (America/New_York timezone).
- **Initial Download**: A download is also triggered when the server starts, ensuring the latest file is available immediately.
- **File Server**: An Express server is set up to serve the downloaded PDF file.
- **Automatic Cleanup**: Before each new download, the previously downloaded file is deleted.

## Prerequisites

- Node.js (v18.x or later recommended)
- npm

## Installation

1.  Clone the repository:
    ```bash
    git clone <repository-url>
    ```
2.  Navigate to the project directory:
    ```bash
    cd weeklylink-downloader
    ```
3.  Install the dependencies:
    ```bash
    npm install
    ```

## Usage

1.  Start the server:
    ```bash
    node index.js
    ```
2.  The server will start, and the initial download will begin.
3.  Once the download is complete, you can access the PDF by navigating to the following URL in your browser:
    [http://localhost:3000/download](http://localhost:3000/download)

## How It Works

The application uses `puppeteer` to automate a web browser. It navigates to the Weekly Link issues page, interacts with the embedded Issuu PDF viewer, and clicks the download button.

The downloaded file is stored in the `downloads` directory.

`node-cron` is used to schedule the daily downloads.

The Express server listens for GET requests on the `/download` endpoint and serves the latest file from the `downloads` directory.

## Deployment on Railway

This application is configured to be deployed on services like Railway. The necessary arguments for running Puppeteer in a sandboxed environment (`--no-sandbox`, `--disable-setuid-sandbox`) are already included.