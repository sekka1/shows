# Show Ticket Finder

A Python application that finds last minute show tickets and prices, then sends the information to Slack.

## Features

- 🎭 Search for last-minute show tickets
- 💰 Display ticket prices and availability
- 📱 Send notifications to Slack via webhooks
- ⏰ Optional continuous monitoring mode
- 🔧 Easy configuration via environment variables

## Prerequisites

- Python 3.7 or higher
- A Slack workspace with webhook access

## Installation

1. Clone this repository:
```bash
git clone https://github.com/sekka1/shows.git
cd shows
```

2. Install dependencies:
```bash
pip install -r requirements.txt
```

3. Configure environment variables:
```bash
cp .env.example .env
# Edit .env with your Slack webhook URL and show preferences
```

## Configuration

Create a `.env` file based on `.env.example` with the following settings:

- `SLACK_WEBHOOK_URL`: Your Slack incoming webhook URL (required)
  - Get this from your Slack workspace: https://api.slack.com/messaging/webhooks
- `SHOW_NAME`: Name of the show to search for (default: "Hamilton")
- `SHOW_VENUE`: Venue name (default: "Broadway")
- `CHECK_INTERVAL_SECONDS`: Check interval in seconds for continuous mode (optional)

## Usage

### One-time Check

Run a single check for tickets:

```bash
python show_finder.py
```

### Continuous Monitoring

Set `CHECK_INTERVAL_SECONDS` in your `.env` file to enable continuous monitoring:

```bash
# In .env
CHECK_INTERVAL_SECONDS=3600  # Check every hour
```

Then run:

```bash
python show_finder.py
```

Press `Ctrl+C` to stop.

## Extending the Application

The current implementation includes a placeholder for ticket search. To integrate with real ticket APIs:

1. Sign up for a ticket provider API:
   - [Ticketmaster API](https://developer.ticketmaster.com/)
   - [SeatGeek API](https://platform.seatgeek.com/)
   - [StubHub API](https://developer.stubhub.com/)

2. Modify the `find_tickets()` method in `show_finder.py` to call the actual API

3. Add any additional API keys to `.env` and `.env.example`

## Example Slack Message

When tickets are found, you'll receive a Slack message like:

```
🎭 Last Minute Show Tickets Available!

Ticket #1
• Show: Hamilton
• Venue: Broadway
• Date: 2025-12-11
• Time: 8:00 PM
• Section: Orchestra, Row: H, Seats: 15-16
• Price: $150.00
• Status: Last Minute Deal
• View Tickets (link)
```

## Development

The application uses:
- `requests` for HTTP requests
- `python-dotenv` for environment variable management
- `beautifulsoup4` for potential web scraping (if needed)

## License

See [LICENSE](LICENSE) file for details.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.