import { chromium, Browser, Page } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface ConcertDeal {
  title: string;
  venue: string;
  date: string;
  time: string;
  price: string;
  prices: string[]; // Array of cheapest 3 prices
  url: string;
}

interface DealWithStatus extends ConcertDeal {
  status: 'new' | 'price_drop' | 'no_change' | 'price_increase';
  previousPrice?: string;
}

interface StateFile {
  lastRun: string;
  deals: ConcertDeal[];
}

// Configuration constants
const LOCATION = 'Las Vegas';
const DAYS_AHEAD = 3;
const TICKET_QUANTITY = 2;
const DEBUG = false; // Set to true to output all events without filtering
const ONE_TIME_RUN = false; // Set to false for cron mode (compares with previous state)

/**
 * Available event categories for filtering:
 * 
 * MUSIC/CONCERTS:
 * - 'concert', 'band', 'music', 'singer', 'artist', 'tour', 'festival'
 * 
 * ENTERTAINMENT/SHOWS:
 * - 'magic', 'magician', 'comedy', 'comedian', 'dance', 'disco', 'tribute'
 * 
 * THEATER/PERFORMANCES:
 * - 'theater', 'theatre', 'musical', 'broadway', 'cirque', 'opera'
 * 
 * SPORTS:
 * - 'nba', 'nfl', 'nhl', 'mlb', 'mls', 'ufc', 'boxing', 'wrestling'
 * - 'basketball', 'football', 'hockey', 'baseball', 'soccer', 'tennis'
 * - 'rodeo', 'racing', 'fight', 'game', 'vs', 'cup', 'finals', 'bowl'
 * 
 * OTHER:
 * - 'conference', 'convention', 'expo', 'fair', 'award'
 * 
 * Note: Leave EXCLUDED_KEYWORDS empty [] to include all events
 */

// Keywords to EXCLUDE from results (events matching these will be filtered out)
const EXCLUDED_KEYWORDS = [
  // Sports
  'nba', 'nfl', 'nhl', 'mlb', 'mls', 'ufc', 'basketball', 'football', 
  'hockey', 'baseball', 'soccer', 'rodeo', 'finals', 'cup', 'game', 
  'vs', 'bowl', 'boxing', 'wrestling', 'tennis', 'racing',
  // Specific teams/events you want to exclude
  'magic', 'knicks', 'raiders', 'giants'
];

/**
 * List of specific events to EXCLUDE by name (case-insensitive regex matching)
 * 
 * Each string is treated as a regex pattern and matched against the lowercased event title.
 * 
 * Examples:
 * - 'gavin adcock' - excludes any event with "gavin adcock" in the title
 * - 'bruno mars' - excludes any event with "bruno mars" in the title
 * - '^imagine dragons' - excludes events starting with "imagine dragons"
 * - 'taylor swift.*concert' - excludes events matching "taylor swift" followed by "concert"
 */
const EXCLUDED_EVENTS: string[] = [
  'gavin adcock',
  '*wizard of oz*',
  'discoshow',
  'Mat Franco',
  'Stephen Wilson*',
  'X Rocks',
  '*Mad Apple*',
  'Colin Cloud',
  '*Zac Brown*'
];

/**
 * Price range filter (for 2 tickets, as specified by TICKET_QUANTITY)
 * Set to null to disable filtering
 * 
 * Examples:
 * - MIN_PRICE: 50, MAX_PRICE: 500 - only show events with cheapest price between $50-$500
 * - MIN_PRICE: null, MAX_PRICE: 200 - only show events under $200
 * - MIN_PRICE: 100, MAX_PRICE: null - only show events over $100
 */
const MIN_PRICE: number | null = 10; // Minimum price (e.g., 50 for $50)
const MAX_PRICE: number | null = 100; // Maximum price (e.g., 500 for $500)

// State file configuration
const STATE_FILE_PATH = path.join(__dirname, '..', 'state.json');
const OUTPUT_FILE_PATH = path.join(__dirname, '..', 'output.json');

/**
 * Gets the end date for filtering (3 days from now)
 */
function getEndDate(): Date {
  const endDate = new Date();
  endDate.setDate(endDate.getDate() + DAYS_AHEAD);
  return endDate;
}

/**
 * Loads the previous state from the state file
 */
function loadPreviousState(): StateFile | null {
  try {
    if (fs.existsSync(STATE_FILE_PATH)) {
      const data = fs.readFileSync(STATE_FILE_PATH, 'utf-8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('Error loading previous state:', error);
  }
  return null;
}

/**
 * Saves the current state to the state file
 */
function saveState(deals: ConcertDeal[]): void {
  try {
    const state: StateFile = {
      lastRun: new Date().toISOString(),
      deals
    };
    fs.writeFileSync(STATE_FILE_PATH, JSON.stringify(state, null, 2));
  } catch (error) {
    console.error('Error saving state:', error);
  }
}

/**
 * Compares current deals with previous state and marks changes
 */
function compareWithPreviousState(currentDeals: ConcertDeal[], previousState: StateFile | null): DealWithStatus[] {
  const dealsWithStatus: DealWithStatus[] = [];
  
  if (!previousState || previousState.deals.length === 0) {
    // First run - all deals are new
    return currentDeals.map(deal => ({
      ...deal,
      status: 'new' as const
    }));
  }
  
  // Create a map of previous deals by URL for quick lookup
  const previousDealsMap = new Map<string, ConcertDeal>();
  previousState.deals.forEach(deal => {
    previousDealsMap.set(deal.url, deal);
  });
  
  for (const currentDeal of currentDeals) {
    const previousDeal = previousDealsMap.get(currentDeal.url);
    
    if (!previousDeal) {
      // New deal
      dealsWithStatus.push({
        ...currentDeal,
        status: 'new'
      });
    } else {
      // Existing deal - compare prices
      const currentPrice = currentDeal.prices.length > 0 
        ? parseInt(currentDeal.prices[0].replace(/[$,]/g, ''))
        : 0;
      const previousPrice = previousDeal.prices.length > 0
        ? parseInt(previousDeal.prices[0].replace(/[$,]/g, ''))
        : 0;
      
      if (currentPrice === 0 || previousPrice === 0) {
        // Can't compare prices
        dealsWithStatus.push({
          ...currentDeal,
          status: 'no_change',
          previousPrice: previousDeal.price
        });
      } else if (currentPrice < previousPrice) {
        // Price drop
        dealsWithStatus.push({
          ...currentDeal,
          status: 'price_drop',
          previousPrice: previousDeal.price
        });
      } else if (currentPrice > previousPrice) {
        // Price increase
        dealsWithStatus.push({
          ...currentDeal,
          status: 'price_increase',
          previousPrice: previousDeal.price
        });
      } else {
        // No change
        dealsWithStatus.push({
          ...currentDeal,
          status: 'no_change',
          previousPrice: previousDeal.price
        });
      }
    }
  }
  
  return dealsWithStatus;
}

/**
 * Saves output in JSON format for cron mode
 */
function saveOutputJson(deals: DealWithStatus[]): void {
  try {
    const output = {
      timestamp: new Date().toISOString(),
      location: LOCATION,
      daysAhead: DAYS_AHEAD,
      ticketQuantity: TICKET_QUANTITY,
      totalDeals: deals.length,
      newDeals: deals.filter(d => d.status === 'new').length,
      priceDrops: deals.filter(d => d.status === 'price_drop').length,
      deals: deals.map(deal => ({
        title: deal.title,
        venue: deal.venue,
        date: deal.date,
        time: deal.time,
        currentPrice: deal.price,
        previousPrice: deal.previousPrice,
        allPrices: deal.prices,
        url: deal.url,
        status: deal.status
      }))
    };
    
    fs.writeFileSync(OUTPUT_FILE_PATH, JSON.stringify(output, null, 2));
    console.log(`\n✓ Output saved to: ${OUTPUT_FILE_PATH}`);
  } catch (error) {
    console.error('Error saving output:', error);
  }
}

/**
 * Gets the cheapest ticket prices for an event
 */
async function getPricesForEvent(page: Page, eventUrl: string): Promise<string[]> {
  const prices: string[] = [];
  
  try {
    console.log(`  Fetching prices for event...`);
    
    // Navigate to the event page
    await page.goto(eventUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);
    
    // Close any popup/modal that might appear
    try {
      const closeButtons = page.locator('button[aria-label*="close" i], button:has-text("×"), [data-testid*="close"]');
      if (await closeButtons.count() > 0) {
        await closeButtons.first().click({ timeout: 2000 });
        await page.waitForTimeout(500);
      }
    } catch (e) {
      // No modal to close
    }
    
    // Look for "Find Tickets" or similar button to show listings
    const findTicketsSelectors = [
      'button:has-text("Find tickets")',
      'button:has-text("See tickets")',
      'button:has-text("View tickets")',
      'a:has-text("Find tickets")'
    ];
    
    for (const selector of findTicketsSelectors) {
      const button = page.locator(selector).first();
      if (await button.count() > 0) {
        try {
          await button.click({ timeout: 2000 });
          await page.waitForTimeout(2000);
          console.log(`  Clicked to view tickets`);
          break;
        } catch (e) {
          continue;
        }
      }
    }
    
    // Wait for quantity modal to appear if it exists
    await page.waitForTimeout(1000);
    
    // Look for quantity selector/input (look inside modal if present)
    const quantitySelectors = [
      '[data-testid="quantity-modal"] input',
      '[data-testid="quantity-modal"] input[type="number"]',
      'input[type="number"]',
      'input[inputmode="numeric"]',
      'select[name*="quantity" i]',
      'input[name*="quantity" i]',
      'input[aria-label*="quantity" i]'
    ];
    
    let quantitySet = false;
    for (const selector of quantitySelectors) {
      const quantityInput = page.locator(selector).first();
      if (await quantityInput.count() > 0) {
        try {
          if (await quantityInput.isVisible({ timeout: 2000 })) {
            await quantityInput.click();
            await page.waitForTimeout(300);
            await quantityInput.fill('');
            await quantityInput.fill(TICKET_QUANTITY.toString());
            await page.waitForTimeout(500);
            
            // Look for submit/continue button in modal
            const submitButtons = page.locator('[data-testid="quantity-modal"] button, button:has-text("Continue"), button:has-text("Update"), button:has-text("Apply")');
            if (await submitButtons.count() > 0) {
              await submitButtons.first().click();
              console.log(`  Set quantity to ${TICKET_QUANTITY} and submitted`);
            } else {
              await page.keyboard.press('Enter');
              console.log(`  Set quantity to ${TICKET_QUANTITY}`);
            }
            
            quantitySet = true;
            await page.waitForTimeout(3000); // Wait for prices to load
            break;
          }
        } catch (e) {
          continue;
        }
      }
    }
    
    if (!quantitySet) {
      console.log(`  Quantity selector not found, checking for prices directly`);
    }
    
    // Wait for price elements to appear
    await page.waitForTimeout(3000);
    
    // Try to extract all prices from the entire page
    const allPrices = await page.evaluate(() => {
      const priceSet = new Set<string>();
      const bodyText = (document as any).body.innerText;
      
      // Match prices like $123, $1,234, etc.
      const matches = bodyText.match(/\$[\d,]+/g);
      if (matches) {
        matches.forEach((match: string) => {
          // Remove commas and convert to number for validation
          const numericValue = parseInt(match.replace(/[$,]/g, ''));
          // Only include reasonable ticket prices (above $10, below $10,000)
          if (numericValue >= 10 && numericValue < 10000) {
            priceSet.add(match);
          }
        });
      }
      
      return Array.from(priceSet);
    });
    
    if (allPrices.length > 0) {
      prices.push(...allPrices);
      console.log(`  Found ${allPrices.length} price options`);
    }
    
    // Sort prices numerically and get cheapest 3
    if (prices.length > 0) {
      const sortedPrices = prices
        .map(p => ({ original: p, numeric: parseInt(p.replace(/[$,]/g, '')) }))
        .sort((a, b) => a.numeric - b.numeric)
        .map(p => p.original)
        .slice(0, 3);
      
      console.log(`  Found ${sortedPrices.length} prices\n`);
      return sortedPrices;
    }
    
    console.log(`  No prices found\n`);
    return [];
    
  } catch (error) {
    console.log(`  Error getting prices:`, error);
    return [];
  }
}

/**
 * Checks if an event date string is within the next 3 days
 */
function isWithinDateRange(dateString: string): boolean {
  try {
    const eventDate = new Date(dateString);
    const now = new Date();
    const endDate = getEndDate();
    
    return eventDate >= now && eventDate <= endDate;
  } catch {
    return false;
  }
}

/**
 * Fetches last minute deals from StubHub for the specified location
 */
async function fetchLastMinuteConcertDeals(): Promise<ConcertDeal[]> {
  const deals: ConcertDeal[] = [];
  let browser: Browser | null = null;
  
  try {
    console.log(`Fetching last-minute deals from StubHub for ${LOCATION}...`);
    console.log(`Date range: Today through ${getEndDate().toLocaleDateString()}`);
    console.log(`Ticket quantity: ${TICKET_QUANTITY}\n`);
    
    // Launch browser
    browser = await chromium.launch({
      headless: true
    });
    
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });
    
    const page = await context.newPage();
    
    // Start at StubHub homepage
    console.log('Navigating to StubHub homepage...\n');
    await page.goto('https://www.stubhub.com/', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(2000);
    
    // Close any modal that might appear
    try {
      const closeButton = page.locator('button[aria-label*="close" i], button:has-text("×")').first();
      if (await closeButton.count() > 0 && await closeButton.isVisible()) {
        await closeButton.click({ timeout: 2000 });
        await page.waitForTimeout(500);
      }
    } catch (e) {
      // No modal
    }
    
    // Find and use the search box
    console.log('Searching for Las Vegas concerts...\n');
    const searchInput = page.locator('input[placeholder*="Search" i], input[type="search"]').first();
    
    if (await searchInput.count() > 0) {
      await searchInput.click();
      await searchInput.fill('Las Vegas concerts');
      await page.waitForTimeout(1000);
      await page.keyboard.press('Enter');
      await page.waitForTimeout(5000); // Increased wait time
      console.log('Search completed\n');
      
      // Wait a bit more for prices to load dynamically
      await page.waitForTimeout(3000);
    } else {
      // Fallback: navigate directly to Vegas concerts
      console.log('Search not found, navigating directly...\n');
      await page.goto('https://www.stubhub.com/concert-tickets/grouping/222?query=las%20vegas', { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.waitForTimeout(5000);
    }
    
    // Try to find event cards with multiple selectors
    const selectors = [
      '[class*="EventCard"]',
      '[data-testid*="event"]',
      'a[href*="/event/"]',
      '[class*="event-card"]'
    ];
    
    let eventsFound = false;
    
    for (const selector of selectors) {
      const count = await page.locator(selector).count();
      
      if (count > 0) {
        console.log(`Found ${count} events with selector: ${selector}\n`);
        eventsFound = true;
        
        // Extract event information - try a simpler approach with the links
        const eventLinks = await page.locator(selector).evaluateAll((elements) => {
          return elements.map(el => {
            const link = el.tagName === 'A' ? el as any : el.querySelector('a');
            if (!link) return null;
            
            const url = link.href || '';
            // Extract title from URL (e.g., /national-finals-rodeo-las-vegas-tickets...)
            const urlParts = url.split('/').filter(Boolean);
            let titleFromUrl = '';
            if (urlParts.length > 0) {
              // Get the event name from URL
              const eventPart = urlParts.find((part: string) => part.includes('-tickets-'));
              if (eventPart) {
                titleFromUrl = eventPart
                  .replace(/-tickets-.*$/, '')
                  .split('-')
                  .map((word: string) => word.charAt(0).toUpperCase() + word.slice(1))
                  .join(' ');
              }
            }
            
            // Try to get title from link text, but clean it up
            const rawTitle = link.textContent?.trim() || link.getAttribute('aria-label') || '';
            
            // Clean up title - remove date/time/venue info that might be appended
            let title = rawTitle;
            // Remove patterns like "Today • Thu, Dec 11 • 7:00 PM..." and everything after
            title = title.replace(/(?:Today|Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s*•.*$/i, '').trim();
            // Remove "#NUMBER" at the end
            title = title.replace(/#\d+$/, '').trim();
            
            // If title is empty, use the URL-based title
            if (!title) {
              title = titleFromUrl;
            }
            
            // Keep the raw title for date extraction
            const titleWithDate = rawTitle;
            
            // Get parent element to find related info
            const parent = link.closest('[class*="card"], [class*="Card"], [class*="event"], [class*="Event"], [class*="result"], [class*="Result"]') || link.parentElement;
            
            let date = '';
            let venue = '';
            let price = '';
            
            if (parent) {
              // Extract date - it's often in the title text
              const dateMatch = titleWithDate.match(/(Today|Mon|Tue|Wed|Thu|Fri|Sat|Sun),?\s+(\w+\s+\d+)\s*•\s*(\d+:\d+\s*[AP]M)/i);
              if (dateMatch) {
                date = `${dateMatch[1]}, ${dateMatch[2]} • ${dateMatch[3]}`;
              }
              
              // Extract venue - usually appears after the time
              const venueMatch = titleWithDate.match(/\d+:\d+\s*[AP]M(.+?)(?:#\d+)?$/i);
              if (venueMatch) {
                venue = venueMatch[1].trim();
              }
              
              // Try to find venue element if not found in title
              if (!venue) {
                const venueEl = parent.querySelector('[class*="venue"], [class*="Venue"], [class*="location"], [class*="Location"]');
                venue = venueEl?.textContent?.trim() || '';
              }
              
              // Extract price - try multiple selectors
              const priceSelectors = [
                '[class*="price"]',
                '[class*="Price"]', 
                '[class*="ListPrice"]',
                '[data-testid*="price"]'
              ];
              
              for (const priceSelector of priceSelectors) {
                const priceEl = parent.querySelector(priceSelector);
                if (priceEl) {
                  const priceText = priceEl.textContent?.trim() || '';
                  if (priceText.includes('$')) {
                    price = priceText;
                    break;
                  }
                }
              }
              
              // If still no price, search all text nodes for dollar signs
              if (!price) {
                const allText = parent.textContent || '';
                const priceMatch = allText.match(/\$[\d,]+/);
                if (priceMatch) {
                  price = priceMatch[0];
                }
              }
            }
            
            return {
              title: title || titleFromUrl,
              venue,
              date,
              time: '',
              price,
              url
            };
          }).filter(Boolean);
        });
        
        
        // Debug mode: output all events found before filtering
        if (DEBUG) {
          console.log('\n=== DEBUG MODE: All Events Found (Before Filtering) ===\n');
          eventLinks.forEach((event, idx) => {
            if (event) {
              console.log(`[${idx + 1}/${eventLinks.length}] ${event.title}`);
              console.log(`  Venue: ${event.venue || 'N/A'}`);
              console.log(`  Date: ${event.date || 'N/A'}`);
              console.log(`  Price: ${event.price || 'N/A'}`);
              console.log(`  URL: ${event.url}`);
              console.log('');
            }
          });
          console.log('=== End Debug Output ===\n');
        }
        
        // Filter and process events
        const now = new Date();
        const endDate = getEndDate();
        
        for (const event of eventLinks) {
          if (!event) continue;
          if (event.title && event.url) {
            // Try to parse date from the event info
            let includeEvent = true;
            
            // In debug mode, skip all filtering
            if (DEBUG) {
              includeEvent = true;
            } else {
              // Check if event is within next 3 days
              if (event.date) {
                const dateStr = event.date.toLowerCase();
                
                // Check if it's "today" or "thu, dec 11" (today's date)
                if (dateStr.includes('today') || dateStr.includes('thu, dec 11')) {
                  includeEvent = true;
                } else {
                  // Try to parse the date
                  const dateMatch = event.date.match(/(Mon|Tue|Wed|Thu|Fri|Sat|Sun),?\s+(\w+)\s+(\d+)/i);
                  if (dateMatch) {
                    try {
                      const month = dateMatch[2];
                      const day = parseInt(dateMatch[3]);
                      const currentYear = now.getFullYear();
                      const eventDate = new Date(`${month} ${day}, ${currentYear}`);
                      
                      // Set to end of day for proper comparison
                      eventDate.setHours(23, 59, 59, 999);
                      
                      // If the parsed date is in the past, it might be next year
                      if (eventDate < now) {
                        eventDate.setFullYear(currentYear + 1);
                      }
                      
                      // Only include if within next 3 days
                      if (eventDate <= endDate) {
                        includeEvent = true;
                      } else {
                        includeEvent = false;
                      }
                    } catch {
                      // If we can't parse, exclude it to be safe
                      includeEvent = false;
                    }
                  } else {
                    // No recognizable date format, exclude
                    includeEvent = false;
                  }
                }
              } else {
                // No date information, exclude
                includeEvent = false;
              }
            }
            
            // Filter based on excluded keywords (skip in debug mode)
            const titleLower = event.title.toLowerCase();
            const keywordMatch = !EXCLUDED_KEYWORDS.some(keyword => titleLower.includes(keyword.toLowerCase()));
            
            // Filter based on excluded events regex patterns (skip in debug mode)
            const eventMatch = !EXCLUDED_EVENTS.some(pattern => {
              try {
                const regex = new RegExp(pattern, 'i');
                return regex.test(titleLower);
              } catch {
                // If regex is invalid, fall back to simple includes
                return titleLower.includes(pattern.toLowerCase());
              }
            });
            
            const isIncluded = DEBUG || (keywordMatch && eventMatch);
            
            if (includeEvent && isIncluded) {
              deals.push({
                title: event.title,
                venue: event.venue || 'Venue not specified',
                date: event.date || 'Date not specified',
                time: event.time || '',
                price: event.price || 'Price not available',
                prices: [], // Will be populated later
                url: event.url
              });
            }
          }
        }
        
        break;
      }
    }
    
    if (!eventsFound) {
      console.log('No events found with standard selectors.\n');
      console.log('Page title:', await page.title());
      console.log('Page URL:', page.url());
    }
    
    // Now fetch prices for each deal
    if (deals.length > 0) {
      console.log(`\nFetching prices for ${deals.length} event(s)...\n`);
      
      for (let i = 0; i < deals.length; i++) {
        const deal = deals[i];
        console.log(`[${i + 1}/${deals.length}] ${deal.title}`);
        
        const prices = await getPricesForEvent(page, deal.url);
        deal.prices = prices;
        
        // Update the price field with the cheapest price if available
        if (prices.length > 0) {
          deal.price = prices[0];
        }
      }
      
      // Apply price range filtering (skip in debug mode)
      if (!DEBUG && (MIN_PRICE !== null || MAX_PRICE !== null)) {
        const originalCount = deals.length;
        const filteredDeals = deals.filter(deal => {
          if (deal.prices.length === 0) {
            return false; // Exclude if no price information
          }
          
          // Get the cheapest price (first in the sorted array)
          const cheapestPrice = deal.prices[0];
          const numericPrice = parseInt(cheapestPrice.replace(/[$,]/g, ''));
          
          // Check minimum price
          if (MIN_PRICE !== null && numericPrice < MIN_PRICE) {
            return false;
          }
          
          // Check maximum price
          if (MAX_PRICE !== null && numericPrice > MAX_PRICE) {
            return false;
          }
          
          return true;
        });
        
        // Update deals array
        deals.length = 0;
        deals.push(...filteredDeals);
        
        const filteredCount = originalCount - deals.length;
        if (filteredCount > 0) {
          console.log(`\nFiltered out ${filteredCount} event(s) based on price range (${MIN_PRICE ? `$${MIN_PRICE}` : 'any'} - ${MAX_PRICE ? `$${MAX_PRICE}` : 'any'})\n`);
        }
      }
    }
    
  } catch (error) {
    console.error('Error fetching data from StubHub:');
    console.error(error);
    throw error;
  } finally {
    if (browser) {
      await browser.close();
    }
  }
  
  return deals;
}

/**
 * Formats and displays concert deals
 */
function displayDeals(deals: ConcertDeal[]): void {
  if (deals.length === 0) {
    console.log('No last minute deals found.');
    return;
  }
  
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`  LAST MINUTE DEALS FOR ${LOCATION.toUpperCase()} - ${deals.length} FOUND`);
  console.log('═══════════════════════════════════════════════════════════════\n');
  
  deals.forEach((deal, index) => {
    console.log(`${index + 1}. ${deal.title}`);
    console.log(`   Venue: ${deal.venue}`);
    console.log(`   Date: ${deal.date}${deal.time ? ' ' + deal.time : ''}`);
    
    if (deal.prices.length > 0) {
      console.log(`   Cheapest Prices (for ${TICKET_QUANTITY} tickets):`);
      deal.prices.forEach((price, i) => {
        console.log(`     ${i + 1}. ${price}`);
      });
    } else {
      console.log(`   Price: ${deal.price}`);
    }
    
    console.log(`   URL: ${deal.url}`);
    console.log('');
  });
  
  console.log('═══════════════════════════════════════════════════════════════\n');
}

/**
 * Displays deals with status information (for cron mode)
 */
function displayDealsWithStatus(deals: DealWithStatus[]): void {
  if (deals.length === 0) {
    console.log('No changes detected.');
    return;
  }
  
  const newDeals = deals.filter(d => d.status === 'new');
  const priceDrops = deals.filter(d => d.status === 'price_drop');
  const noChanges = deals.filter(d => d.status === 'no_change');
  const priceIncreases = deals.filter(d => d.status === 'price_increase');
  
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`  DEAL CHANGES FOR ${LOCATION.toUpperCase()}`);
  console.log('═══════════════════════════════════════════════════════════════\n');
  
  console.log(`Summary:`);
  console.log(`  New Deals: ${newDeals.length}`);
  console.log(`  Price Drops: ${priceDrops.length}`);
  console.log(`  No Changes: ${noChanges.length}`);
  console.log(`  Price Increases: ${priceIncreases.length}`);
  console.log(`  Total: ${deals.length}\n`);
  
  if (newDeals.length > 0) {
    console.log('🆕 NEW DEALS:');
    console.log('─────────────────────────────────────────────────────────────\n');
    newDeals.forEach((deal, index) => {
      console.log(`${index + 1}. ${deal.title}`);
      console.log(`   Venue: ${deal.venue}`);
      console.log(`   Date: ${deal.date}${deal.time ? ' ' + deal.time : ''}`);
      console.log(`   Price: ${deal.price}`);
      console.log(`   URL: ${deal.url}`);
      console.log('');
    });
  }
  
  if (priceDrops.length > 0) {
    console.log('📉 PRICE DROPS:');
    console.log('─────────────────────────────────────────────────────────────\n');
    priceDrops.forEach((deal, index) => {
      console.log(`${index + 1}. ${deal.title}`);
      console.log(`   Venue: ${deal.venue}`);
      console.log(`   Date: ${deal.date}${deal.time ? ' ' + deal.time : ''}`);
      console.log(`   Previous: ${deal.previousPrice} → Current: ${deal.price}`);
      console.log(`   URL: ${deal.url}`);
      console.log('');
    });
  }
  
  console.log('═══════════════════════════════════════════════════════════════\n');
}

/**
 * Main function
 */
async function main(): Promise<void> {
  try {
    console.log(`Mode: ${ONE_TIME_RUN ? 'ONE-TIME RUN' : 'CRON MODE'}\n`);
    
    const deals = await fetchLastMinuteConcertDeals();
    
    if (ONE_TIME_RUN) {
      // One-time run: display human-readable output
      displayDeals(deals);
    } else {
      // Cron mode: compare with previous state
      const previousState = loadPreviousState();
      const dealsWithStatus = compareWithPreviousState(deals, previousState);
      
      // Filter to only show new deals and price drops
      const noteworthyDeals = dealsWithStatus.filter(
        d => d.status === 'new' || d.status === 'price_drop'
      );
      
      // Display summary
      displayDealsWithStatus(dealsWithStatus);
      
      // Save output as JSON
      saveOutputJson(dealsWithStatus);
      
      // Save current state for next run
      saveState(deals);
      
      // Log noteworthy deals count
      if (noteworthyDeals.length > 0) {
        console.log(`✓ ${noteworthyDeals.length} noteworthy deal(s) found (new or price drops)`);
      } else {
        console.log('ℹ No new deals or price drops detected');
      }
    }
  } catch (error) {
    console.error('Failed to fetch last minute concert deals');
    process.exit(1);
  }
}

// Run the script
main();
