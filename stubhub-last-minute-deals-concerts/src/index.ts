import axios from 'axios';
import * as cheerio from 'cheerio';

interface ConcertDeal {
  title: string;
  venue: string;
  date: string;
  time: string;
  price: string;
  url: string;
}

// Configuration constants
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const MIN_TITLE_LENGTH = 5;
const EVENT_SELECTORS = [
  '.EventCardstyle__StyledEventCard',
  '[data-testid="event-card"]',
  '.event-card',
  '.event-item',
  'article[class*="event"]',
  'div[class*="event-card"]'
];

/**
 * Fetches last minute concert deals from StubHub
 */
async function fetchLastMinuteConcertDeals(): Promise<ConcertDeal[]> {
  const deals: ConcertDeal[] = [];
  
  try {
    // StubHub's last minute deals page for concerts
    const url = 'https://www.stubhub.com/last-minute-deals/concerts';
    
    console.log('Fetching last minute concert deals from StubHub...');
    console.log(`URL: ${url}\n`);
    
    const response = await axios.get(url, {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1'
      },
      timeout: 30000
    });

    const $ = cheerio.load(response.data);
    
    // Parse the page for concert deals
    // Note: StubHub's structure may vary, so this is a general approach
    // that looks for common patterns in event listings
    
    // Look for event cards or listings
    let eventsFound = false;
    
    for (const selector of EVENT_SELECTORS) {
      const events = $(selector);
      
      if (events.length > 0) {
        eventsFound = true;
        console.log(`Found ${events.length} events using selector: ${selector}\n`);
        
        events.each((_, element) => {
          const $event = $(element);
          
          // Extract event details - try multiple patterns
          const title = $event.find('[class*="title"], [class*="name"], h2, h3, a[class*="event"]').first().text().trim() ||
                       $event.find('a').first().text().trim();
          
          const venue = $event.find('[class*="venue"], [class*="location"]').first().text().trim();
          
          const date = $event.find('[class*="date"], time').first().text().trim();
          
          const time = $event.find('[class*="time"]').first().text().trim();
          
          const price = $event.find('[class*="price"], [class*="cost"]').first().text().trim();
          
          const url = $event.find('a').first().attr('href') || '';
          const fullUrl = url.startsWith('http') ? url : `https://www.stubhub.com${url}`;
          
          if (title) {
            deals.push({
              title,
              venue: venue || 'Venue not specified',
              date: date || 'Date not specified',
              time: time || '',
              price: price || 'Price not available',
              url: fullUrl
            });
          }
        });
        
        break; // Found events, no need to try other selectors
      }
    }
    
    if (!eventsFound) {
      console.log('No events found with standard selectors. Attempting to extract from page structure...\n');
      
      // Fallback: look for links that might be events
      const links = $('a[href*="/event/"]');
      console.log(`Found ${links.length} event links\n`);
      
      const processedUrls = new Set<string>();
      
      links.each((_, element) => {
        const $link = $(element);
        const href = $link.attr('href');
        
        if (href && !processedUrls.has(href)) {
          processedUrls.add(href);
          
          const title = $link.text().trim() || $link.find('*').text().trim();
          const fullUrl = href.startsWith('http') ? href : `https://www.stubhub.com${href}`;
          
          if (title && title.length > MIN_TITLE_LENGTH) {
            const parent = $link.parent();
            const price = parent.find('[class*="price"]').text().trim();
            const date = parent.find('[class*="date"], time').text().trim();
            
            deals.push({
              title,
              venue: 'See event page',
              date: date || 'See event page',
              time: '',
              price: price || 'See event page',
              url: fullUrl
            });
          }
        }
      });
    }
    
  } catch (error) {
    if (axios.isAxiosError(error)) {
      console.error('Error fetching data from StubHub:');
      console.error(`Status: ${error.response?.status}`);
      console.error(`Message: ${error.message}`);
      
      if (error.response?.status === 403) {
        console.error('\nNote: StubHub may be blocking automated requests. Consider:');
        console.error('1. Using a proxy service');
        console.error('2. Accessing StubHub API directly (requires API key)');
        console.error('3. Running this script less frequently');
      }
    } else {
      console.error('Unexpected error:', error);
    }
    throw error;
  }
  
  return deals;
}

/**
 * Formats and displays concert deals
 */
function displayDeals(deals: ConcertDeal[]): void {
  if (deals.length === 0) {
    console.log('No last minute concert deals found.');
    return;
  }
  
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`  LAST MINUTE CONCERT DEALS - ${deals.length} FOUND`);
  console.log('═══════════════════════════════════════════════════════════════\n');
  
  deals.forEach((deal, index) => {
    console.log(`${index + 1}. ${deal.title}`);
    console.log(`   Venue: ${deal.venue}`);
    console.log(`   Date: ${deal.date}${deal.time ? ' ' + deal.time : ''}`);
    console.log(`   Price: ${deal.price}`);
    console.log(`   URL: ${deal.url}`);
    console.log('');
  });
  
  console.log('═══════════════════════════════════════════════════════════════\n');
}

/**
 * Main function
 */
async function main(): Promise<void> {
  try {
    const deals = await fetchLastMinuteConcertDeals();
    displayDeals(deals);
  } catch (error) {
    console.error('Failed to fetch last minute concert deals');
    process.exit(1);
  }
}

// Run the script
main();
