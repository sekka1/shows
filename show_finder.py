#!/usr/bin/env python3
"""
Show Ticket Finder
Finds last minute show tickets and prices, then sends the information to Slack.
"""

import os
import sys
import json
import time
import logging
from datetime import datetime
from typing import Dict, List, Optional
import requests
from dotenv import load_dotenv

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


class ShowTicketFinder:
    """Finds show tickets and sends information to Slack."""
    
    def __init__(self, slack_webhook_url: str):
        """
        Initialize the ShowTicketFinder.
        
        Args:
            slack_webhook_url: The Slack webhook URL for sending messages
        """
        self.slack_webhook_url = slack_webhook_url
        
    def find_tickets(self, show_name: str, venue: str = None) -> List[Dict]:
        """
        Find available tickets for a show.
        
        This is a placeholder implementation. In a real-world scenario,
        you would integrate with ticket APIs like:
        - Ticketmaster API
        - SeatGeek API
        - StubHub API
        - Or scrape ticket websites
        
        Args:
            show_name: Name of the show
            venue: Venue name (optional)
            
        Returns:
            List of ticket information dictionaries
        """
        logger.info(f"Searching for tickets: {show_name}" + (f" at {venue}" if venue else ""))
        
        # Placeholder data - replace with actual API integration
        tickets = [
            {
                "show": show_name,
                "venue": venue or "Unknown Venue",
                "date": datetime.now().strftime("%Y-%m-%d"),
                "time": "8:00 PM",
                "section": "Orchestra",
                "row": "H",
                "seats": "15-16",
                "price": "$150.00",
                "availability": "Last Minute Deal",
                "url": "https://example.com/tickets"
            }
        ]
        
        logger.info(f"Found {len(tickets)} available tickets")
        return tickets
    
    def format_ticket_message(self, tickets: List[Dict]) -> str:
        """
        Format ticket information for Slack message.
        
        Args:
            tickets: List of ticket information
            
        Returns:
            Formatted message string
        """
        if not tickets:
            return "No last-minute tickets found."
        
        message_parts = ["🎭 *Last Minute Show Tickets Available!*\n"]
        
        for i, ticket in enumerate(tickets, 1):
            message_parts.append(f"\n*Ticket #{i}*")
            message_parts.append(f"• Show: {ticket.get('show', 'N/A')}")
            message_parts.append(f"• Venue: {ticket.get('venue', 'N/A')}")
            message_parts.append(f"• Date: {ticket.get('date', 'N/A')}")
            message_parts.append(f"• Time: {ticket.get('time', 'N/A')}")
            message_parts.append(f"• Section: {ticket.get('section', 'N/A')}, Row: {ticket.get('row', 'N/A')}, Seats: {ticket.get('seats', 'N/A')}")
            message_parts.append(f"• Price: {ticket.get('price', 'N/A')}")
            message_parts.append(f"• Status: {ticket.get('availability', 'Available')}")
            
            if ticket.get('url'):
                message_parts.append(f"• <{ticket['url']}|View Tickets>")
        
        return "\n".join(message_parts)
    
    def send_to_slack(self, message: str) -> bool:
        """
        Send a message to Slack via webhook.
        
        Args:
            message: The message to send
            
        Returns:
            True if successful, False otherwise
        """
        try:
            payload = {
                "text": message,
                "mrkdwn": True
            }
            
            response = requests.post(
                self.slack_webhook_url,
                json=payload,
                headers={'Content-Type': 'application/json'},
                timeout=10
            )
            
            if response.status_code == 200:
                logger.info("Successfully sent message to Slack")
                return True
            else:
                logger.error(f"Failed to send to Slack: {response.status_code} - {response.text}")
                return False
                
        except requests.exceptions.RequestException as e:
            logger.error(f"Error sending to Slack: {e}")
            return False
    
    def run(self, show_name: str, venue: str = None, interval: int = None):
        """
        Run the ticket finder.
        
        Args:
            show_name: Name of the show to search for
            venue: Venue name (optional)
            interval: Check interval in seconds (optional). If provided, runs continuously.
        """
        logger.info(f"Starting ShowTicketFinder for '{show_name}'")
        
        if interval:
            logger.info(f"Running in continuous mode with {interval}s interval")
            try:
                while True:
                    self._check_and_notify(show_name, venue)
                    logger.info(f"Sleeping for {interval} seconds...")
                    time.sleep(interval)
            except KeyboardInterrupt:
                logger.info("Stopped by user")
        else:
            self._check_and_notify(show_name, venue)
    
    def _check_and_notify(self, show_name: str, venue: str = None):
        """Check for tickets and notify via Slack."""
        tickets = self.find_tickets(show_name, venue)
        
        if tickets:
            message = self.format_ticket_message(tickets)
            self.send_to_slack(message)
        else:
            logger.info("No tickets found to report")


def main():
    """Main entry point."""
    # Load environment variables
    load_dotenv()
    
    # Get configuration from environment
    slack_webhook_url = os.getenv('SLACK_WEBHOOK_URL')
    show_name = os.getenv('SHOW_NAME', 'Hamilton')
    venue = os.getenv('SHOW_VENUE', 'Broadway')
    interval = os.getenv('CHECK_INTERVAL_SECONDS')
    
    # Validate configuration
    if not slack_webhook_url:
        logger.error("SLACK_WEBHOOK_URL environment variable is required")
        logger.error("Please copy .env.example to .env and configure it")
        sys.exit(1)
    
    # Parse interval if provided
    interval_seconds = None
    if interval:
        try:
            interval_seconds = int(interval)
        except ValueError:
            logger.error(f"Invalid CHECK_INTERVAL_SECONDS: {interval}")
            sys.exit(1)
    
    # Create finder and run
    finder = ShowTicketFinder(slack_webhook_url)
    finder.run(show_name, venue, interval_seconds)


if __name__ == "__main__":
    main()
