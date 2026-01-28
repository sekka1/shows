import { chromium, Browser, Page } from 'playwright';

const STUBHUB_URL = 'https://www.stubhub.com';

// Set to a number to limit events processed, or null to process all events
// const MAX_EVENTS_TO_PROCESS: number | null = null;
const MAX_EVENTS_TO_PROCESS: number | null = 3;

// Set to true to run browser in headless mode (no visible window), false to see the browser
const HEADLESS_MODE = true;

// Slack configuration
const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL || '';
const SLACK_CHANNEL = process.env.SLACK_CHANNEL || '';
const ENABLE_SLACK = !!SLACK_WEBHOOK_URL; // Enabled if webhook URL is provided


interface EventData {
  name: string;
  url: string;
  lowestPrices: number[];
}

/**
 * Posts event data to Slack channel
 */
async function postToSlack(events: EventData[]): Promise<void> {
  if (!ENABLE_SLACK || events.length === 0) {
    return;
  }

  try {
    const blocks: any[] = [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: '🎟️ Las Vegas Events - Today',
          emoji: true
        }
      },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `Updated: <!date^${Math.floor(Date.now() / 1000)}^{date_short_pretty} at {time}|${new Date().toLocaleString()}> | Total Events: ${events.length}`
          }
        ]
      }
    ];

    // Add each event
    for (const event of events) {
      const priceText = event.lowestPrices.length > 0
        ? event.lowestPrices.map(p => `$${p.toFixed(2)}`).join(', ')
        : 'No prices available';

      blocks.push(
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*<${event.url}|${event.name}>*\n💰 Lowest prices: *${priceText}*`
          }
        },
        { type: 'divider' }
      );
    }

    // Send to Slack
    const response = await fetch(SLACK_WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        channel: SLACK_CHANNEL,
        blocks
      })
    });

    if (response.ok) {
      console.log(`✓ Posted ${events.length} event(s) to Slack`);
    } else {
      console.error(`✗ Failed to post to Slack: ${response.status} ${response.statusText}`);
    }
  } catch (error) {
    console.error('Error posting to Slack:', error);
  }
}

async function main(): Promise<void> {
  let browser: Browser | null = null;

  try {
    console.log('Launching browser...');
    browser = await chromium.launch({ headless: HEADLESS_MODE });

    const context = await browser.newContext({
      viewport: { width: 1280, height: 720 }
    });

    const page: Page = await context.newPage();

    console.log(`Navigating to ${STUBHUB_URL}...`);
    await page.goto(STUBHUB_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });

    // Close any dismissible banners that might cover the UI
    const closeBanner = page.locator('button[aria-label*="close" i], button:has-text("×")').first();
    if (await closeBanner.count()) {
      await closeBanner.click({ timeout: 2000 }).catch(() => undefined);
      await page.waitForTimeout(500);
    }

    console.log('Waiting for the main Explore link...');
    const exploreLink = page.locator('a[href="/explore"]');
    await exploreLink.first().waitFor({ timeout: 15000 });
    await exploreLink.first().click();
    console.log('Clicked Explore');

    // Wait for the Explore page to load
    await page.waitForTimeout(3000);

    // Open location picker and choose Las Vegas
    console.log('Waiting for location selector...');

    // If the input is already visible, skip clicking a selector
    const locationInput = page.locator('input[placeholder*="search location" i], input[placeholder*="Search Location" i], input[type="search"]').first();
    const inputVisible = await locationInput.isVisible().catch(() => false);

    if (!inputVisible) {
      // Debug: log what's actually on the page
      const pageDebug = await page.evaluate(() => {
        const allButtons = Array.from(document.querySelectorAll('button'));
        const allDivButtons = Array.from(document.querySelectorAll('div[role="button"]'));
        const allElements = Array.from(document.querySelectorAll('*'));
        
        return {
          buttonCount: allButtons.length,
          visibleButtons: allButtons.filter(b => b.offsetParent !== null).slice(0, 10).map(b => b.textContent?.trim() || ''),
          divButtonCount: allDivButtons.length,
          visibleDivButtons: allDivButtons.filter(d => (d as HTMLElement).offsetParent !== null).slice(0, 10).map(d => d.textContent?.trim() || ''),
          elementsWithComma: allElements.filter(el => el.textContent?.includes(',') && el.textContent.length < 50).slice(0, 5).map(e => ({
            tag: e.tagName,
            text: e.textContent?.trim(),
            visible: (e as HTMLElement).offsetParent !== null
          }))
        };
      });
      console.log('Page debug info:', JSON.stringify(pageDebug, null, 2));

      const locationSelectors = [
        // Try to find the actual clickable container that has both text and svg
        '*:has(> div:has-text("Las Vegas")):has(> svg)',
        '*:has(> div:has-text("New York")):has(> svg)',
        '*:has(> div:has-text("Los Angeles")):has(> svg)',
        '*:has(> div:has-text("Chicago")):has(> svg)',
        // Try button/div with text and svg children
        'button:has(div:has-text("Las Vegas")):has(svg)',
        'button:has(div:has-text("New York")):has(svg)',
        'div:has(div:has-text("Las Vegas")):has(svg)',
        'div:has(div:has-text("New York")):has(svg)',
        // Broader searches
        '[role="button"]:has-text("Las Vegas")',
        'button:has-text("Las Vegas")',
        'button:has-text("New York")',
        // Fallback to SVG parent approach
        'div:has-text("Las Vegas") svg',
        'div:has-text("New York") svg',
        'button:has(svg):has-text(",")',
        'button[aria-label*="location" i]'
      ];

      let locationClicked = false;
      for (const selector of locationSelectors) {
        const candidate = page.locator(selector).first();
        if (await candidate.count()) {
          await candidate.waitFor({ timeout: 8000, state: 'visible' }).catch(() => undefined);
          if (await candidate.isVisible().catch(() => false)) {
            // Don't click SVG elements directly - always click their parent
            let elementToClick;
            if (selector.includes('svg') && selector.endsWith('svg')) {
              elementToClick = candidate.locator('..');
              console.log(`Found location element (SVG parent) via selector: ${selector}`);
            } else {
              elementToClick = candidate;
              console.log(`Found location element via selector: ${selector}`);
            }
            
            // Try hover first, then click
            await elementToClick.hover({ timeout: 3000, force: true }).catch(() => undefined);
            await page.waitForTimeout(500);
            await elementToClick.click({ timeout: 5000, force: true }).catch(() => undefined);
            console.log(`Hovered and clicked location button`);
            
            locationClicked = true;
            await page.waitForTimeout(3000); // Wait longer for dropdown
            break;
          }
        }
      }

      if (!locationClicked) {
        throw new Error('Could not find a visible location selector');
      }
    }

    // Debug: check what inputs are now visible after clicking
    const inputDebug = await page.evaluate(() => {
      const allInputs = Array.from(document.querySelectorAll('input'));
      return allInputs
        .filter(i => (i as HTMLElement).offsetParent !== null)
        .map(i => ({
          placeholder: i.getAttribute('placeholder'),
          type: i.type,
          value: i.value
        }));
    });
    console.log('Visible inputs after click:', JSON.stringify(inputDebug, null, 2));

    // Try more flexible input selector
    const searchLocationInput = page.locator('input[placeholder*="location" i], input[placeholder*="city" i], input[placeholder*="search" i]').first();
    const searchInputVisible = await searchLocationInput.isVisible().catch(() => false);
    
    if (!searchInputVisible) {
      console.log('Location search input not visible, the dropdown might not have opened properly');
      throw new Error('Location dropdown did not open after clicking');
    }

    await searchLocationInput.fill('Las Vegas');
    console.log('Typed Las Vegas');

    const lasVegasOption = page.locator('text=/^Las Vegas, NV, USA$/i').first();
    await lasVegasOption.waitFor({ timeout: 15000 });
    await lasVegasOption.click();
    console.log('Selected Las Vegas, NV, USA');

    // Wait for location change to take effect
    await page.waitForTimeout(3000);

    // Find and click the date dropdown ("All dates")
    console.log('Looking for date filter dropdown...');
    const dateDropdownSelectors = [
      'button:has-text("All dates")',
      '[role="button"]:has-text("All dates")',
      'div:has-text("All dates")',
      'button:has-text("Date")',
      '[aria-label*="date" i]',
    ];

    let dateDropdownClicked = false;
    for (const selector of dateDropdownSelectors) {
      const dropdown = page.locator(selector).first();
      if (await dropdown.count() > 0 && await dropdown.isVisible().catch(() => false)) {
        await dropdown.click({ timeout: 5000 }).catch(() => undefined);
        console.log(`Clicked date dropdown via selector: ${selector}`);
        dateDropdownClicked = true;
        await page.waitForTimeout(1000);
        break;
      }
    }

    if (!dateDropdownClicked) {
      console.log('Date dropdown not found, continuing without date filter');
    } else {
      // Select "Today" from the dropdown
      const todayOption = page.locator('text=/^Today$/i, button:has-text("Today"), [role="option"]:has-text("Today")').first();
      if (await todayOption.isVisible().catch(() => false)) {
        await todayOption.click();
        console.log('Selected "Today" from date filter');
        
        // Wait for the filtered events to load
        await page.waitForTimeout(4000);
      } else {
        console.log('"Today" option not found in dropdown');
      }
    }

    // Wait for events to load
    await page.waitForTimeout(2000);

    // Collect all event data
    const results: EventData[] = [];

    // Find all event links on the page
    console.log('Finding events on the page...');
    
    // Try multiple selectors to find event links
    const eventSelectors = [
      'a[href*="/event/"]',
      'a[href*="/performer/"]',
      'article a[href]',
      'div[class*="event" i] a[href]',
      'h3 a[href], h4 a[href]',
    ];

    let eventLinks: Array<{ name: string; url: string }> = [];
    
    for (const selector of eventSelectors) {
      const links = await page.evaluate((sel) => {
        const anchors = Array.from(document.querySelectorAll(sel));
        return anchors
          .filter(a => {
            const href = (a as HTMLAnchorElement).href;
            const text = a.textContent?.trim() || '';
            return href && text && text.length > 0 && text.length < 150;
          })
          .map(a => ({
            name: a.textContent?.trim() || '',
            url: (a as HTMLAnchorElement).href
          }));
      }, selector);
      
      if (links.length > 0) {
        // Deduplicate by URL
        const urlSet = new Set(eventLinks.map(e => e.url));
        const newLinks = links.filter(link => !urlSet.has(link.url));
        eventLinks.push(...newLinks);
        console.log(`Found ${links.length} event links with selector: ${selector}`);
      }
    }

    console.log(`Total unique events found: ${eventLinks.length}`);

    if (eventLinks.length === 0) {
      console.log('No events found on the page. Exiting.');
    } else {
      // Determine how many events to process
      const eventsToProcess = MAX_EVENTS_TO_PROCESS !== null 
        ? Math.min(MAX_EVENTS_TO_PROCESS, eventLinks.length) 
        : eventLinks.length;
      
      console.log(`Processing ${eventsToProcess} of ${eventLinks.length} events`);
      
      // Iterate through each event
      for (let i = 0; i < eventsToProcess; i++) {
        const event = eventLinks[i];
        console.log(`\n[${i + 1}/${eventLinks.length}] Processing: ${event.name}`);
        
        try {
          // Navigate to event page
          await page.goto(event.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
          await page.waitForTimeout(2000);

          // Check for ticket quantity prompt
          const ticketQuantityInput = page.locator('input[type="number"], input[placeholder*="ticket" i], input[placeholder*="quantity" i]').first();
          if (await ticketQuantityInput.isVisible().catch(() => false)) {
            await ticketQuantityInput.fill('2');
            console.log('  Entered quantity: 2');
            await page.waitForTimeout(1000);
            
            // Look for submit/continue button
            const submitBtn = page.locator('button:has-text("Continue"), button:has-text("Submit"), button[type="submit"]').first();
            if (await submitBtn.isVisible().catch(() => false)) {
              await submitBtn.click();
              await page.waitForTimeout(2000);
            }
          }

          // Wait for prices to load
          await page.waitForTimeout(3000);

          // Extract all price elements
          const prices = await page.evaluate(() => {
            const priceElements = Array.from(document.querySelectorAll('*'));
            const priceRegex = /\$\s*(\d+(?:,\d{3})*(?:\.\d{2})?)/g;
            const foundPrices: number[] = [];

            priceElements.forEach(el => {
              const text = el.textContent || '';
              const matches = text.matchAll(priceRegex);
              for (const match of matches) {
                const priceStr = match[1].replace(/,/g, '');
                const price = parseFloat(priceStr);
                if (!isNaN(price) && price > 0 && price < 10000) {
                  foundPrices.push(price);
                }
              }
            });

            // Sort and deduplicate
            const uniquePrices = Array.from(new Set(foundPrices)).sort((a, b) => a - b);
            return uniquePrices;
          });

          console.log(`  Found ${prices.length} unique prices`);
          
          // Get the two lowest prices
          const lowestPrices = prices.slice(0, 2);
          
          if (lowestPrices.length > 0) {
            console.log(`  Lowest prices: ${lowestPrices.map(p => `$${p.toFixed(2)}`).join(', ')}`);
          } else {
            console.log(`  No prices found for this event`);
          }

          results.push({
            name: event.name,
            url: event.url,
            lowestPrices
          });

          // Small delay to avoid rate limiting
          await page.waitForTimeout(1500);

        } catch (error) {
          console.error(`  Error processing event: ${error instanceof Error ? error.message : String(error)}`);
          // Add event with no prices on error
          results.push({
            name: event.name,
            url: event.url,
            lowestPrices: []
          });
        }
      }
    }

    // Print final results
    console.log('\n\n========== FINAL RESULTS ==========');
    console.log(JSON.stringify(results, null, 2));
    console.log('\n===================================\n');

    // Post to Slack
    await postToSlack(results);

    // Pause so you can see the browser state
    await page.waitForTimeout(10000);

    await context.close();
  } catch (error) {
    console.error('Error running script:', error);
    throw error;
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

main().catch(() => process.exit(1));
