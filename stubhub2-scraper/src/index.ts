import { chromium, Browser, Page } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';

const STUBHUB_URL = 'https://www.stubhub.com';

// Set to a number to limit events processed, or null to process all events
const MAX_EVENTS_TO_PROCESS: number | null = null;
// const MAX_EVENTS_TO_PROCESS: number | null = 3;

// Set to true to run browser in headless mode (no visible window), false to see the browser
const HEADLESS_MODE = true;

// Enable video recording of browser sessions (useful for debugging CI failures)
const ENABLE_VIDEO = process.env.ENABLE_VIDEO || 'true';

// Slack configuration
const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL || '';
const SLACK_CHANNEL = process.env.SLACK_CHANNEL || '';
const ENABLE_SLACK = !!SLACK_WEBHOOK_URL; // Enabled if webhook URL is provided

// Price range filter for Slack notifications (stdout will show all events)
const PRICE_RANGE_LOW = 0;     // Minimum price to send to Slack
const PRICE_RANGE_HIGH = 100; // Maximum price to send to Slack


interface EventData {
  name: string;
  url: string;
  lowestPrices: number[];
}

/**
 * Posts event data to Slack channel
 * Splits into multiple messages if needed to stay under 4000 character limit
 * Only sends events within the configured price range
 */
async function postToSlack(events: EventData[]): Promise<void> {
  if (!ENABLE_SLACK || events.length === 0) {
    return;
  }

  try {
    // Filter events by price range
    const eventsInPriceRange = events.filter(event => {
      if (!event.lowestPrices || event.lowestPrices.length === 0) return false;
      const lowestPrice = event.lowestPrices[0];
      return lowestPrice >= PRICE_RANGE_LOW && lowestPrice <= PRICE_RANGE_HIGH;
    });

    if (eventsInPriceRange.length === 0) {
      console.log(`ℹ No events within price range $${PRICE_RANGE_LOW}-$${PRICE_RANGE_HIGH} to send to Slack`);
      return;
    }

    console.log(`Sending ${eventsInPriceRange.length} of ${events.length} events to Slack (price range: $${PRICE_RANGE_LOW}-$${PRICE_RANGE_HIGH})`);

    // Create batches of events that fit within Slack's character limit
    const batches: EventData[][] = [];
    let currentBatch: EventData[] = [];
    let currentSize = 0;

    const headerSize = JSON.stringify({
      type: 'header',
      text: { type: 'plain_text', text: '🎟️ Las Vegas Events - Today', emoji: true }
    }).length;

    const contextSize = JSON.stringify({
      type: 'context',
      elements: [{
        type: 'mrkdwn',
        text: `Updated: <!date^${Math.floor(Date.now() / 1000)}^{date_short_pretty} at {time}|${new Date().toLocaleString()}> | Total Events: ${eventsInPriceRange.length}`
      }]
    }).length;

    const baseSize = headerSize + contextSize + 100; // Add buffer for JSON structure

    for (const event of eventsInPriceRange) {
      const priceText = event.lowestPrices.length > 0
        ? event.lowestPrices.map(p => `$${p.toFixed(2)}`).join(', ')
        : 'No prices available';

      const eventBlockSize = JSON.stringify({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*<${event.url}|${event.name}>*\n💰 Lowest prices: *${priceText}*`
        }
      }).length + JSON.stringify({ type: 'divider' }).length;

      // If adding this event would exceed limit, start a new batch
      if (currentSize + eventBlockSize + baseSize > 3900 && currentBatch.length > 0) {
        batches.push([...currentBatch]);
        currentBatch = [];
        currentSize = 0;
      }

      currentBatch.push(event);
      currentSize += eventBlockSize;
    }

    // Add the last batch if it has events
    if (currentBatch.length > 0) {
      batches.push(currentBatch);
    }

    // Send each batch
    let totalSent = 0;
    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      const batchNumber = batches.length > 1 ? ` (${i + 1}/${batches.length})` : '';

      const blocks: any[] = [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: `🎟️ Las Vegas Events - Today${batchNumber}`,
            emoji: true
          }
        },
        {
          type: 'context',
          elements: [
            {
              type: 'mrkdwn',
              text: `Updated: <!date^${Math.floor(Date.now() / 1000)}^{date_short_pretty} at {time}|${new Date().toLocaleString()}> | Showing ${batch.length} of ${eventsInPriceRange.length} events`
            }
          ]
        }
      ];

      // Add events in this batch
      for (const event of batch) {
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
        totalSent += batch.length;
        console.log(`✓ Posted batch ${i + 1}/${batches.length}: ${batch.length} event(s) to Slack`);
      } else {
        console.error(`✗ Failed to post batch ${i + 1} to Slack: ${response.status} ${response.statusText}`);
      }

      // Add a small delay between batches to avoid rate limiting
      if (i < batches.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    console.log(`✓ Total posted: ${totalSent}/${events.length} event(s) in ${batches.length} message(s)`);
  } catch (error) {
    console.error('Error posting to Slack:', error);
  }
}

async function main(): Promise<void> {
  let browser: Browser | null = null;

  try {
    // Create screenshots directory for debugging
    const screenshotsDir = path.join(process.cwd(), 'screenshots');
    try {
      if (!fs.existsSync(screenshotsDir)) {
        fs.mkdirSync(screenshotsDir, { recursive: true });
        console.log('Created screenshots directory for debugging\n');
      }
    } catch (error) {
      console.warn('Could not create screenshots directory:', error);
    }

    console.log('Launching browser...');
    browser = await chromium.launch({ headless: HEADLESS_MODE });

    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      viewport: { width: 1280, height: 720 },
      recordVideo: ENABLE_VIDEO === 'true' ? {
        dir: 'videos/',
        size: { width: 1280, height: 720 }
      } : undefined
    });

    const page: Page = await context.newPage();

    console.log(`Step 1: Navigating to ${STUBHUB_URL}...`);
    await page.goto(STUBHUB_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: path.join(screenshotsDir, '01-homepage.png') });
    console.log(`Current URL: ${page.url()}`);
    console.log(`Page title: ${await page.title()}\n`);

    // Close any dismissible banners that might cover the UI
    const closeBanner = page.locator('button[aria-label*="close" i], button:has-text("×")').first();
    if (await closeBanner.count()) {
      await closeBanner.click({ timeout: 2000 }).catch(() => undefined);
      await page.waitForTimeout(500);
    }

    console.log('Step 2: Clicking Explore link...');
    const exploreLink = page.locator('a[href="/explore"]');
    await exploreLink.first().waitFor({ timeout: 15000 });
    await exploreLink.first().click();
    console.log('Clicked Explore');

    // Wait for the Explore page to load (increased from 3000 to 5000 for CI stability)
    await page.waitForTimeout(5000);
    await page.screenshot({ path: path.join(screenshotsDir, '02-explore-page.png') });
    console.log(`Current URL: ${page.url()}\n`);

    // Open location picker and choose Las Vegas
    console.log('Step 3: Opening location selector...');

    // Retry mechanism for location selection (helps with timing issues in CI)
    let locationSelectionSuccess = false;
    const maxRetries = 3;
    
    for (let attempt = 1; attempt <= maxRetries && !locationSelectionSuccess; attempt++) {
      if (attempt > 1) {
        console.log(`\nRetrying location selection (attempt ${attempt}/${maxRetries})...`);
        await page.waitForTimeout(3000);
      }

      try {
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
              await candidate.waitFor({ timeout: 10000, state: 'visible' }).catch(() => undefined);
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
            // Save diagnostic information before throwing error
            await page.screenshot({ path: path.join(screenshotsDir, `03-location-selector-fail-attempt${attempt}.png`), fullPage: true });
            const html = await page.content();
            const debugHtmlPath = path.join(process.cwd(), `debug-location-fail-attempt${attempt}.html`);
            fs.writeFileSync(debugHtmlPath, html);
            console.error(`\n❌ Location selector not found on attempt ${attempt}`);
            console.error(`Screenshot saved to: 03-location-selector-fail-attempt${attempt}.png`);
            console.error(`HTML saved to: ${debugHtmlPath}\n`);
            
            if (attempt === maxRetries) {
              throw new Error(`Could not find a visible location selector after ${maxRetries} attempts. See screenshots and HTML dumps for details.`);
            }
            continue; // Try next attempt
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
          await page.screenshot({ path: path.join(screenshotsDir, `03-no-location-input-attempt${attempt}.png`) });
          console.log('Location search input not visible, the dropdown might not have opened properly');
          if (attempt === maxRetries) {
            throw new Error('Location dropdown did not open after clicking');
          }
          continue;
        }

        // Type with delay to mimic human behavior (more bot-detection resistant)
        await searchLocationInput.type('Las Vegas', { delay: 100 });
        await page.waitForTimeout(2000);
        await page.screenshot({ path: path.join(screenshotsDir, '03-location-typed.png') });
        console.log('Typed "Las Vegas" with human-like delay');

        const lasVegasOption = page.locator('text=/^Las Vegas, NV, USA$/i').first();
        await lasVegasOption.waitFor({ timeout: 15000 });
        await lasVegasOption.click();
        await page.waitForTimeout(2000);
        await page.screenshot({ path: path.join(screenshotsDir, '04-location-selected.png') });
        console.log('Selected Las Vegas, NV, USA');
        console.log(`Current URL: ${page.url()}\n`);

        // Wait for location change to take effect
        await page.waitForTimeout(3000);
        
        locationSelectionSuccess = true;
        
      } catch (error) {
        if (attempt === maxRetries) {
          throw error;
        }
        console.error(`Location selection failed on attempt ${attempt}:`, error instanceof Error ? error.message : String(error));
      }
    }

    // Find and click the date dropdown ("All dates")
    console.log('Step 4: Opening date filter dropdown...');
    await page.screenshot({ path: path.join(screenshotsDir, '05-before-date-filter.png') });
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
        await page.screenshot({ path: path.join(screenshotsDir, '06-date-selected.png') });
      } else {
        console.log('"Today" option not found in dropdown');
      }
    }

    // Wait for events to load
    await page.waitForTimeout(2000);

    // Collect all event data
    const results: EventData[] = [];

    // Find all event links on the page
    console.log('\nStep 5: Collecting event links...');
    await page.screenshot({ path: path.join(screenshotsDir, '07-events-page.png') });
    
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

    // Validate that we're actually getting Las Vegas events
    if (eventLinks.length > 0) {
      console.log('\nValidating event locations...');
      const nonLasVegasEvents = eventLinks.filter(event => {
        const urlLower = event.url.toLowerCase();
        const hasLasVegas = urlLower.includes('las-vegas') || urlLower.includes('lasvegas');
        const hasOtherCity = [
          'san-francisco', 'sanfrancisco', 'new-york', 'newyork',
          'los-angeles', 'losangeles', 'chicago', 'boston',
          'seattle', 'miami', 'denver', 'phoenix'
        ].some(city => urlLower.includes(city));
        return !hasLasVegas || hasOtherCity;
      });

      if (nonLasVegasEvents.length > eventLinks.length * 0.5) {
        console.error('\n❌ ERROR: Majority of events are NOT in Las Vegas!');
        console.error('Location selection may have failed. StubHub is showing wrong location.');
        console.error(`Non-Las Vegas events: ${nonLasVegasEvents.length} of ${eventLinks.length}`);
        console.error('\nSample non-Las Vegas events:');
        nonLasVegasEvents.slice(0, 3).forEach((event, idx) => {
          console.error(`  ${idx + 1}. ${event.name}`);
          console.error(`     URL: ${event.url}`);
        });
        await page.screenshot({ path: path.join(screenshotsDir, '08-wrong-location-detected.png'), fullPage: true });
        throw new Error('Location validation failed - not showing Las Vegas events');
      } else if (nonLasVegasEvents.length > 0) {
        console.log(`⚠ Warning: Found ${nonLasVegasEvents.length} potential non-Las Vegas events (acceptable if < 50%)`);
      } else {
        console.log('✓ Location validation passed - all events appear to be in Las Vegas\n');
      }
    }

    if (eventLinks.length === 0) {
      console.log('No events found on the page. Exiting.');
    } else {
      // Determine how many events to process
      const eventsToProcess = MAX_EVENTS_TO_PROCESS !== null 
        ? Math.min(MAX_EVENTS_TO_PROCESS, eventLinks.length) 
        : eventLinks.length;
      
      console.log(`\nStep 6: Processing ${eventsToProcess} of ${eventLinks.length} events for prices...\n`);
      
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

    // Take final screenshot
    await page.screenshot({ path: path.join(screenshotsDir, '99-final-state.png') });
    console.log('\n✓ Screenshots saved to ./screenshots/');
    
    // Save video if enabled
    if (ENABLE_VIDEO === 'true') {
      console.log('✓ Videos will be saved to ./videos/ after browser closes');
    }

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
