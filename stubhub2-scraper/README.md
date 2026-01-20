# StubHub2 Scraper

A TypeScript-based web scraper using Playwright to capture StubHub explore page data with screenshots and video recordings.

## Features

- Uses Playwright with a real Chromium browser
- Navigates to StubHub explore page with specific location and date parameters
- Takes full-page screenshots
- Records video of the browsing session
- Runs in headless mode for automation

## Requirements

- Node.js 20+
- npm

## Installation

```bash
npm install
npx playwright install chromium
```

## Usage

### Build

```bash
npm run build
```

### Run

```bash
npm start
```

### Development (build + run)

```bash
npm run dev
```

### Environment Variables

- `ENABLE_VIDEO` - Set to `false` to disable video recording (default: `true`)

## Output

- **Screenshots**: Saved to `screenshots/` directory
- **Videos**: Saved to `videos/` directory (if enabled)

## Target URL

The scraper navigates to:
```
https://www.stubhub.com/explore?lat=MzYuMjQ3&lon=LTExNS4yMTg%3D&from=1768809600000&to=1768895999999
```

Parameters:
- `lat=MzYuMjQ3` - Latitude (Las Vegas area, base64 encoded)
- `lon=LTExNS4yMTg%3D` - Longitude (Las Vegas area, base64 encoded)
- `from=1768809600000` - Start date timestamp (Unix milliseconds)
- `to=1768895999999` - End date timestamp (Unix milliseconds)

## GitHub Actions

The scraper can be run automatically via GitHub Actions:

### Manual Trigger

1. Go to the Actions tab in GitHub
2. Select "StubHub2 Scraper" workflow
3. Click "Run workflow"
4. Choose whether to enable video recording
5. Click "Run workflow"

### Scheduled Run

The workflow runs automatically daily at 10 AM UTC.

### Artifacts

After each run, the following artifacts are available for download:
- **screenshots** - PNG screenshots of the page
- **browser-videos** - WebM video recordings (if enabled)

Artifacts are retained for 7 days.
