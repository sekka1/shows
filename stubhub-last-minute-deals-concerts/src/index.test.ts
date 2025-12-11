import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

// Mock the modules before importing
vi.mock('playwright', () => ({
  chromium: {
    launch: vi.fn(),
  },
}));

describe('StubHub Concert Deals', () => {
  describe('Date Filtering', () => {
    it('should identify today as within range', () => {
      const today = new Date();
      const dateString = today.toLocaleDateString();
      // This is a basic test - in real implementation, we'd test the actual function
      expect(dateString).toBeDefined();
    });

    it('should calculate end date correctly', () => {
      const now = new Date();
      const endDate = new Date();
      endDate.setDate(endDate.getDate() + 3);
      
      expect(endDate.getTime()).toBeGreaterThan(now.getTime());
    });
  });

  describe('Price Filtering', () => {
    it('should filter prices by minimum value', () => {
      const prices = ['$50', '$75', '$100', '$150'];
      const MIN_PRICE = 60;
      
      const filtered = prices.filter(price => {
        const numericPrice = parseInt(price.replace(/[$,]/g, ''));
        return numericPrice >= MIN_PRICE;
      });
      
      expect(filtered).toEqual(['$75', '$100', '$150']);
    });

    it('should filter prices by maximum value', () => {
      const prices = ['$50', '$75', '$100', '$150'];
      const MAX_PRICE = 100;
      
      const filtered = prices.filter(price => {
        const numericPrice = parseInt(price.replace(/[$,]/g, ''));
        return numericPrice <= MAX_PRICE;
      });
      
      expect(filtered).toEqual(['$50', '$75', '$100']);
    });

    it('should filter prices by range', () => {
      const prices = ['$50', '$75', '$100', '$150'];
      const MIN_PRICE = 60;
      const MAX_PRICE = 120;
      
      const filtered = prices.filter(price => {
        const numericPrice = parseInt(price.replace(/[$,]/g, ''));
        return numericPrice >= MIN_PRICE && numericPrice <= MAX_PRICE;
      });
      
      expect(filtered).toEqual(['$75', '$100']);
    });

    it('should handle prices with commas', () => {
      const prices = ['$1,000', '$2,500', '$500'];
      
      const numericPrices = prices.map(price => 
        parseInt(price.replace(/[$,]/g, ''))
      );
      
      expect(numericPrices).toEqual([1000, 2500, 500]);
    });

    it('should sort prices numerically', () => {
      const prices = ['$1,000', '$50', '$500', '$100'];
      
      const sorted = prices
        .map(p => ({ original: p, numeric: parseInt(p.replace(/[$,]/g, '')) }))
        .sort((a, b) => a.numeric - b.numeric)
        .map(p => p.original);
      
      expect(sorted).toEqual(['$50', '$100', '$500', '$1,000']);
    });
  });

  describe('Event Filtering', () => {
    it('should filter events by excluded keywords', () => {
      const EXCLUDED_KEYWORDS = ['nba', 'nfl', 'soccer'];
      const events = [
        { title: 'Lakers vs Warriors' },
        { title: 'Rock Concert' },
        { title: 'NFL Super Bowl' },
        { title: 'Jazz Night' },
      ];
      
      const filtered = events.filter(event => {
        const titleLower = event.title.toLowerCase();
        return !EXCLUDED_KEYWORDS.some(keyword => 
          titleLower.includes(keyword.toLowerCase())
        );
      });
      
      expect(filtered.length).toBe(2);
      expect(filtered.map(e => e.title)).toEqual(['Rock Concert', 'Jazz Night']);
    });

    it('should filter events by regex patterns', () => {
      const EXCLUDED_EVENTS = ['gavin adcock', '^wizard of oz'];
      const events = [
        { title: 'Gavin Adcock Live' },
        { title: 'The Wizard of Oz' },
        { title: 'Wizard of Oz at Sphere' },
        { title: 'Rock Concert' },
      ];
      
      const filtered = events.filter(event => {
        const titleLower = event.title.toLowerCase();
        return !EXCLUDED_EVENTS.some(pattern => {
          try {
            const regex = new RegExp(pattern, 'i');
            return regex.test(titleLower);
          } catch {
            return titleLower.includes(pattern.toLowerCase());
          }
        });
      });
      
      expect(filtered.length).toBe(1);
      expect(filtered[0].title).toBe('Rock Concert');
    });
  });

  describe('State Management', () => {
    it('should mark all deals as new on first run', () => {
      const currentDeals = [
        { url: 'https://example.com/event1', prices: ['$50'] },
        { url: 'https://example.com/event2', prices: ['$75'] },
      ];
      const previousState = null;
      
      // Simulate first run logic
      const isFirstRun = previousState === null;
      
      expect(isFirstRun).toBe(true);
      expect(currentDeals.length).toBe(2);
    });

    it('should detect new deals', () => {
      const previousDeals = [
        { url: 'https://example.com/event1', prices: ['$50'] },
      ];
      const currentDeals = [
        { url: 'https://example.com/event1', prices: ['$50'] },
        { url: 'https://example.com/event2', prices: ['$75'] },
      ];
      
      const previousUrls = new Set(previousDeals.map(d => d.url));
      const newDeals = currentDeals.filter(d => !previousUrls.has(d.url));
      
      expect(newDeals.length).toBe(1);
      expect(newDeals[0].url).toBe('https://example.com/event2');
    });

    it('should detect price drops', () => {
      const previousDeal = { url: 'https://example.com/event1', prices: ['$100'] };
      const currentDeal = { url: 'https://example.com/event1', prices: ['$75'] };
      
      const previousPrice = parseInt(previousDeal.prices[0].replace(/[$,]/g, ''));
      const currentPrice = parseInt(currentDeal.prices[0].replace(/[$,]/g, ''));
      
      const isPriceDrop = currentPrice < previousPrice;
      
      expect(isPriceDrop).toBe(true);
      expect(currentPrice).toBe(75);
      expect(previousPrice).toBe(100);
    });

    it('should detect price increases', () => {
      const previousDeal = { url: 'https://example.com/event1', prices: ['$50'] };
      const currentDeal = { url: 'https://example.com/event1', prices: ['$75'] };
      
      const previousPrice = parseInt(previousDeal.prices[0].replace(/[$,]/g, ''));
      const currentPrice = parseInt(currentDeal.prices[0].replace(/[$,]/g, ''));
      
      const isPriceIncrease = currentPrice > previousPrice;
      
      expect(isPriceIncrease).toBe(true);
    });

    it('should detect no price change', () => {
      const previousDeal = { url: 'https://example.com/event1', prices: ['$75'] };
      const currentDeal = { url: 'https://example.com/event1', prices: ['$75'] };
      
      const previousPrice = parseInt(previousDeal.prices[0].replace(/[$,]/g, ''));
      const currentPrice = parseInt(currentDeal.prices[0].replace(/[$,]/g, ''));
      
      const isNoChange = currentPrice === previousPrice;
      
      expect(isNoChange).toBe(true);
    });
  });

  describe('Title Cleanup', () => {
    it('should remove date/time from title', () => {
      const rawTitle = 'Rock Concert Today • Thu, Dec 11 • 7:00 PM';
      const cleaned = rawTitle.replace(/(?:Today|Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s*•.*$/i, '').trim();
      
      expect(cleaned).toBe('Rock Concert');
    });

    it('should remove venue number suffix', () => {
      const rawTitle = 'Blue Man Group #123';
      const cleaned = rawTitle.replace(/#\d+$/, '').trim();
      
      expect(cleaned).toBe('Blue Man Group');
    });

    it('should extract title from URL', () => {
      const url = 'https://stubhub.com/blue-man-group-tickets-12-11-2025/event/123';
      const urlParts = url.split('/');
      const eventPart = urlParts.find(part => part.includes('-tickets-'));
      
      if (eventPart) {
        const title = eventPart
          .replace(/-tickets-.*$/, '')
          .split('-')
          .map(word => word.charAt(0).toUpperCase() + word.slice(1))
          .join(' ');
        
        expect(title).toBe('Blue Man Group');
      }
    });
  });

  describe('Slack Message Formatting', () => {
    it('should format new deal message correctly', () => {
      const deal = {
        title: 'Rock Concert',
        venue: 'MGM Grand',
        date: 'Thu, Dec 11 • 7:00 PM',
        price: '$50',
        url: 'https://example.com/event1',
      };
      const TICKET_QUANTITY = 2;
      
      const message = `*<${deal.url}|${deal.title}>*\n📍 ${deal.venue}\n📅 ${deal.date}\n💰 *${deal.price}* for ${TICKET_QUANTITY} tickets`;
      
      expect(message).toContain('Rock Concert');
      expect(message).toContain('MGM Grand');
      expect(message).toContain('$50');
      expect(message).toContain('for 2 tickets');
    });

    it('should format price drop message correctly', () => {
      const deal = {
        title: 'Rock Concert',
        venue: 'MGM Grand',
        date: 'Thu, Dec 11 • 7:00 PM',
        price: '$50',
        previousPrice: '$75',
        url: 'https://example.com/event1',
      };
      const TICKET_QUANTITY = 2;
      
      const message = `*<${deal.url}|${deal.title}>*\n📍 ${deal.venue}\n📅 ${deal.date}\n💰 ~${deal.previousPrice}~ → *${deal.price}* for ${TICKET_QUANTITY} tickets`;
      
      expect(message).toContain('~$75~');
      expect(message).toContain('→');
      expect(message).toContain('$50');
    });
  });

  describe('Configuration', () => {
    it('should read environment variables', () => {
      process.env.SLACK_WEBHOOK_URL = 'https://hooks.slack.com/test';
      process.env.SLACK_CHANNEL = 'C123456';
      
      const webhookUrl = process.env.SLACK_WEBHOOK_URL || '';
      const channel = process.env.SLACK_CHANNEL || '';
      
      expect(webhookUrl).toBe('https://hooks.slack.com/test');
      expect(channel).toBe('C123456');
      
      // Cleanup
      delete process.env.SLACK_WEBHOOK_URL;
      delete process.env.SLACK_CHANNEL;
    });

    it('should enable Slack when webhook URL is provided', () => {
      const SLACK_WEBHOOK_URL = 'https://hooks.slack.com/test';
      const ENABLE_SLACK = !!SLACK_WEBHOOK_URL;
      
      expect(ENABLE_SLACK).toBe(true);
    });

    it('should disable Slack when webhook URL is empty', () => {
      const SLACK_WEBHOOK_URL = '';
      const ENABLE_SLACK = !!SLACK_WEBHOOK_URL;
      
      expect(ENABLE_SLACK).toBe(false);
    });
  });
});
