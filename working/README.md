# Issuu Document Downloader

A powerful Node.js application for automatically downloading Issuu documents with intelligent caching, scheduling, and a RESTful API.

## 🚀 Features

- **Automatic Downloads**: Downloads Issuu documents in PDF format automatically
- **Smart Caching**: Maintains the latest document in cache for instant access
- **RESTful API**: Full-featured API for managing downloads and cache
- **Intelligent Scheduling**: Weekly downloads every Wednesday at 9:00 AM
- **Daily Monitoring**: Checks for new issues daily at 10:00 AM
- **CLI Interface**: Command-line interface for direct usage
- **Automatic Cleanup**: Removes old files when new issues are available

## 📋 Requirements

- Node.js 12.0.0 or higher
- Internet connection for Issuu access
- Sufficient disk space for PDF storage

## 🛠️ Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd node-issue-downloader
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Start the server**
   ```bash
   npm start
   ```

The server will start at `http://localhost:3000`

## 📖 Usage

### API Server

Start the API server with automatic scheduling:

```bash
npm start
```

#### Available Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/latest` | Get information about the latest issue |
| `GET` | `/api/download/latest` | Download the latest issue directly |
| `GET` | `/api/cached-file` | Get the cached file for instant download |
| `GET` | `/api/status/:issueNumber` | Check download status for a specific issue |
| `GET` | `/api/downloads` | List all downloaded issues |
| `GET` | `/downloads/:filename` | Download a specific file from downloads folder |
| `GET` | `/cache/:filename` | Download a specific file from cache |

#### Example API Usage

**Get latest issue information:**
```bash
curl http://localhost:3000/api/latest
```

**Download latest issue:**
```bash
curl -O http://localhost:3000/api/download/latest
```

**Get cached file directly:**
```bash
curl -O http://localhost:3000/api/cached-file
```

### Command Line Interface

**Download a specific document:**
```bash
npm run cli <ISSUU_URL> [custom_name]
```

**Example:**
```bash
npm run cli https://issuu.com/thebpview/docs/issue_297 "Issue 297 Custom Name"
```

**Download latest available issue:**
```bash
npm run download-latest
```

## ⏰ Scheduling System

The application includes an intelligent scheduling system:

- **Weekly Downloads**: Every Wednesday at 9:00 AM
- **Daily Monitoring**: Every day at 10:00 AM
- **Automatic Cache Updates**: New issues are automatically cached
- **Smart Cleanup**: Old files are removed when new ones are available

### Schedule Configuration

You can modify the scheduling in `scheduler.js`:

```javascript
// Weekly download (Wednesday at 9:00 AM)
cron.schedule('0 9 * * 3', async () => {
    await this.downloadLatestIssue();
});

// Daily check (10:00 AM)
cron.schedule('0 10 * * *', async () => {
    // Check for new issues
});
```

## 🗄️ Cache System

The cache system provides instant access to the latest document:

- **Single File Storage**: Only the latest issue is kept in cache
- **Automatic Updates**: Cache is updated when new issues are available
- **Fast Access**: Cached files are served instantly via `/api/cached-file`
- **Metadata Tracking**: Tracks issue numbers and cache timestamps

### Cache Structure

```
cache/
├── latest_issue_297.pdf    # Latest cached issue
└── metadata.json           # Cache metadata
```

## 📁 File Structure

```
node-issue-downloader/
├── app.js                  # Main downloader class
├── api.js                  # Express API server
├── server.js               # Server entry point
├── issueTracker.js         # Issue detection logic
├── scheduler.js            # Download scheduling
├── cacheManager.js         # Cache management
├── package.json            # Dependencies and scripts
├── downloads/              # Downloaded PDFs
├── cache/                  # Cached latest issue
└── logs/                   # Download logs
```

## 🔧 Configuration

### Environment Variables

- `PORT`: Server port (default: 3000)

### Customization

You can customize various aspects:

- **Download Directory**: Modify `outputDir` in `app.js`
- **Cache Directory**: Modify `cacheDir` in `cacheManager.js`
- **Schedule Times**: Modify cron expressions in `scheduler.js`
- **API Endpoints**: Add new routes in `api.js`

## 📊 API Response Examples

### Latest Issue Information
```json
{
  "issueNumber": 297,
  "issueUrl": "https://issuu.com/thebpview/docs/issue_297",
  "isDownloaded": true,
  "downloadUrl": "/cache/latest_issue_297.pdf"
}
```

### Download Status
```json
{
  "issueNumber": 297,
  "status": "cached",
  "fileSize": 148123456,
  "fileSizeMB": "141.25",
  "downloadUrl": "/cache/latest_issue_297.pdf",
  "cachedAt": "2025-01-15T10:00:00.000Z"
}
```

### Downloads List
```json
{
  "downloads": [
    {
      "fileName": "issue 297.pdf",
      "issueNumber": 297,
      "fileSize": "141.25 MB",
      "downloadUrl": "/downloads/issue%20297.pdf",
      "createdAt": "2025-01-15T09:00:00.000Z"
    }
  ]
}
```

## 🚨 Error Handling

The application includes comprehensive error handling:

- **Network Errors**: Retries and fallback mechanisms
- **File System Errors**: Graceful degradation
- **API Errors**: Proper HTTP status codes and error messages
- **Logging**: All errors are logged for debugging

## 🔍 Troubleshooting

### Common Issues

1. **Port Already in Use**
   ```bash
   # Change port in api.js or set environment variable
   PORT=3001 npm start
   ```

2. **Download Failures**
   - Check internet connection
   - Verify Issuu URL accessibility
   - Check available disk space

3. **Cache Issues**
   - Clear cache directory manually
   - Restart the server
   - Check file permissions

### Debug Mode

Enable detailed logging by modifying log levels in the respective files.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🙏 Acknowledgments

- Built with Node.js and Express
- Uses node-cron for scheduling
- Implements intelligent caching strategies
- Designed for high-performance document delivery

## 📞 Support

For issues and questions:
- Check the troubleshooting section
- Review the API documentation
- Open an issue on GitHub

---

**Note**: This application is designed for educational and personal use. Please respect Issuu's terms of service and copyright laws when downloading documents.