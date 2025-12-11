# StubHub Last Minute Concert Deals

A TypeScript script that fetches and displays last minute concert deals from StubHub.

## Features

- Fetches last minute concert deals from StubHub
- Displays concert information including:
  - Event title
  - Venue
  - Date and time
  - Ticket prices
  - Event URL
- Clean, formatted console output

## Prerequisites

- Node.js (v18 or higher recommended)
- npm or yarn

## Installation

1. Navigate to the project directory:
```bash
cd stubhub-last-minute-deals-concerts
```

2. Install dependencies:
```bash
npm install
```

## Usage

### Development Mode

Build and run the script:
```bash
npm run dev
```

### Production Mode

1. Build the TypeScript code:
```bash
npm run build
```

2. Run the compiled JavaScript:
```bash
npm start
```

### Type Checking

Check for TypeScript errors without building:
```bash
npm run lint
```

## How It Works

The script performs the following steps:

1. Makes an HTTP request to StubHub's last minute deals page for concerts
2. Parses the HTML response using Cheerio (jQuery-like library)
3. Extracts concert information from the page structure
4. Formats and displays the results in the console

## Notes

- StubHub may use bot detection mechanisms that could block automated requests
- The HTML structure of StubHub's website may change, which could affect parsing
- Consider the following alternatives if the script encounters issues:
  - Use StubHub's official API (requires API key and registration)
  - Implement rate limiting and request delays
  - Use a proxy service for requests

## Output Example

```
═══════════════════════════════════════════════════════════════
  LAST MINUTE CONCERT DEALS - 5 FOUND
═══════════════════════════════════════════════════════════════

1. Taylor Swift - The Eras Tour
   Venue: MetLife Stadium
   Date: Dec 15, 2023 7:00 PM
   Price: From $125
   URL: https://www.stubhub.com/event/...

2. The Weeknd
   Venue: Madison Square Garden
   Date: Dec 16, 2023 8:00 PM
   Price: From $89
   URL: https://www.stubhub.com/event/...

═══════════════════════════════════════════════════════════════
```

## Dependencies

- **axios**: HTTP client for making requests
- **cheerio**: Fast, flexible HTML parsing library
- **typescript**: TypeScript compiler and type definitions

## License

ISC
