import { chromium, Browser, Page } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * StubHub2 Scraper
 * 
 * Opens a StubHub page with specific location and date parameters,
 * takes a screenshot and records a video of the browsing session.
 */

// Target URL with location (Las Vegas) and date parameters
const STUBHUB_URL = 'https://www.stubhub.com/explore?lat=MzYuMjQ3&lon=LTExNS4yMTg%3D&from=1768809600000&to=1768895999999';

// Enable video recording (can be disabled via environment variable)
const ENABLE_VIDEO = process.env.ENABLE_VIDEO !== 'false';

// Price extraction constants
const MIN_TICKET_PRICE = 10;
const MAX_TICKET_PRICE = 100000;
const EXACT_PRICE_TEXT_LIMIT = 20;
const FALLBACK_PRICE_TEXT_LIMIT = 50;
const MAX_PARENT_SEARCH_DEPTH = 5;
const MIN_PRICES_THRESHOLD = 2;

/**
 * Main scraper function
 */
async function runScraper(): Promise<void> {
  let browser: Browser | null = null;
  
  try {
    console.log('Starting StubHub2 scraper...');
    console.log(`Target URL: ${STUBHUB_URL}`);
    console.log(`Video recording: ${ENABLE_VIDEO ? 'enabled' : 'disabled'}\n`);
    
    // Create directories for screenshots and videos
    const screenshotsDir = path.join(process.cwd(), 'screenshots');
    const videosDir = path.join(process.cwd(), 'videos');
    
    try {
      if (!fs.existsSync(screenshotsDir)) {
        fs.mkdirSync(screenshotsDir, { recursive: true });
        console.log('Created screenshots directory');
      }
      if (ENABLE_VIDEO && !fs.existsSync(videosDir)) {
        fs.mkdirSync(videosDir, { recursive: true });
        console.log('Created videos directory');
      }
    } catch (error) {
      console.warn('Could not create output directories:', error);
    }
    
    // Launch browser
    console.log('\nLaunching browser...');
    browser = await chromium.launch({
      headless: true
    });
    
    // Create browser context with video recording enabled
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      viewport: { width: 1280, height: 720 },
      recordVideo: ENABLE_VIDEO ? {
        dir: videosDir,
        size: { width: 1280, height: 720 }
      } : undefined
    });
    
    const page = await context.newPage();
    
    // Navigate to the StubHub URL
    console.log('Navigating to StubHub...');
    await page.goto(STUBHUB_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    
    // Wait for page to load
    console.log('Waiting for page to load...');
    await page.waitForTimeout(5000);
    
    // Get page information
    const pageTitle = await page.title();
    const pageUrl = page.url();
    
    console.log(`\nPage loaded successfully:`);
    console.log(`  Title: ${pageTitle}`);
    console.log(`  URL: ${pageUrl}`);
    
    // Try to close any modals/popups
    console.log('\nClosing any modals/popups...');
    try {
      const closeButton = page.locator('button[aria-label*="close" i], button:has-text("×")').first();
      if (await closeButton.count() > 0) {
        await closeButton.click({ timeout: 2000 });
        await page.waitForTimeout(1000);
        console.log('  Closed modal/popup');
      }
    } catch (e) {
      // No modal to close
    }
    
    // Wait for content to render and location button to appear
    console.log('\nWaiting for page elements to load...');
    await page.waitForTimeout(5000); // Wait longer for the page to fully load
    
    // Change location to Las Vegas
    console.log('\nChanging location to Las Vegas...');
    try {
      // Find elements with "New York" - specifically looking for the location selector
      const locationElementInfo = await page.evaluate(() => {
        const allElements = Array.from(document.querySelectorAll('*'));
        const elementsWithNewYork = allElements
          .filter(el => {
            const text = el.textContent?.trim() || '';
            // Look for elements with JUST "New York" or very short text containing it
            return text.includes('New York') && text.length < 50;
          })
          .map(el => ({
            tag: el.tagName,
            text: el.textContent?.trim() || '',
            clickable: el.tagName === 'BUTTON' || el.tagName === 'A' || (el as any).onclick !== null || el.getAttribute('role') === 'button'
          }))
          .slice(0, 10);
        
        return elementsWithNewYork;
      });
      
      console.log(`  Found ${locationElementInfo.length} elements with "New York" (short text):`);
      locationElementInfo.forEach((el, idx) => {
        console.log(`    [${idx}] <${el.tag}> "${el.text}" clickable=${el.clickable}`);
      });
      
      // Click the New York location selector - look for shortest text match
      const clicked = await page.evaluate(() => {
        const allElements = Array.from(document.querySelectorAll('*'));
        const newYorkElements = allElements
          .filter(el => {
            const text = el.textContent?.trim() || '';
            return text.includes('New York') && text.length < 50;
          })
          .sort((a, b) => (a.textContent?.trim().length || 999) - (b.textContent?.trim().length || 999));
        
        // Try clicking from shortest to longest text
        for (const el of newYorkElements) {
          if (el.tagName === 'BUTTON' || el.getAttribute('role') === 'button' || el.tagName === 'A') {
            (el as HTMLElement).click();
            return { success: true, tag: el.tagName, text: el.textContent?.trim() || '' };
          }
        }
        
        // If no button found, try clicking any div
        for (const el of newYorkElements) {
          if (el.tagName === 'DIV' || el.tagName === 'SPAN') {
            (el as HTMLElement).click();
            return { success: true, tag: el.tagName, text: el.textContent?.trim() || '' };
          }
        }
        
        return { success: false, tag: '', text: '' };
      });
      
      if (clicked.success) {
        console.log(`  ✓ Clicked <${clicked.tag}> with text "${clicked.text}"`);
        await page.waitForTimeout(3000); // Wait longer for dropdown to appear
        
        // Close any modal that might have appeared (NOT the location dropdown)
        const modalClosed = await page.evaluate(() => {
          const closeButtons = Array.from(document.querySelectorAll('button'));
          const closeBtn = closeButtons.find(btn => 
            btn.getAttribute('aria-label')?.toLowerCase().includes('close') ||
            btn.textContent === '×'
          );
          if (closeBtn) {
            // Check if this is a modal, not the location dropdown
            const parentText = closeBtn.parentElement?.textContent || '';
            if (!parentText.includes('Search location') && !parentText.includes('Las Vegas')) {
              (closeBtn as HTMLElement).click();
              return true;
            }
          }
          return false;
        });
        
        if (modalClosed) {
          console.log('  ✓ Closed interfering modal');
          await page.waitForTimeout(1000);
          
          // Click New York button again to open location dropdown
          await page.evaluate(() => {
            const allElements = Array.from(document.querySelectorAll('*'));
            const newYorkElements = allElements
              .filter(el => {
                const text = el.textContent?.trim() || '';
                return text.includes('New York') && text.length < 50;
              })
              .sort((a, b) => (a.textContent?.trim().length || 999) - (b.textContent?.trim().length || 999));
            
            for (const el of newYorkElements) {
              if (el.tagName === 'BUTTON' || el.getAttribute('role') === 'button') {
                (el as HTMLElement).click();
                break;
              }
            }
          });
          console.log('  ✓ Clicked New York button again');
          await page.waitForTimeout(3000);
        }
        
        // Now find the location input that should have appeared in the dropdown
        const inputFilled = await page.evaluate(() => {
          const inputs = Array.from(document.querySelectorAll('input'));
          
          // Find a visible input - should be the location search in the dropdown
          const locationInput = inputs.find(input => {
            const placeholder = input.getAttribute('placeholder') || '';
            const isVisible = input.offsetParent !== null;
            return isVisible && (
              placeholder.toLowerCase().includes('search') ||
              placeholder.toLowerCase().includes('location') ||
              placeholder.toLowerCase().includes('city')
            );
          });
          
          if (locationInput) {
            locationInput.focus();
            locationInput.value = 'Las Vegas Nevada';
            locationInput.dispatchEvent(new Event('input', { bubbles: true }));
            locationInput.dispatchEvent(new Event('change', { bubbles: true }));
            return { success: true, placeholder: locationInput.getAttribute('placeholder') || '' };
          }
          
          // If no placeholder match, try any visible text input
          const anyVisibleInput = inputs.find(input => 
            input.offsetParent !== null && (input.type === 'text' || input.type === 'search')
          );
          
          if (anyVisibleInput) {
            anyVisibleInput.focus();
            anyVisibleInput.value = 'Las Vegas Nevada';
            anyVisibleInput.dispatchEvent(new Event('input', { bubbles: true }));
            anyVisibleInput.dispatchEvent(new Event('change', { bubbles: true }));
            return { success: true, placeholder: anyVisibleInput.getAttribute('placeholder') || 'no placeholder' };
          }
          
          return { success: false, placeholder: '' };
        });
        
        if (inputFilled.success) {
          console.log(`  ✓ Typed "Las Vegas Nevada" into input (placeholder: "${inputFilled.placeholder}")`);
          await page.waitForTimeout(2000);
          
          // Press Enter to submit
          await page.keyboard.press('Enter');
          console.log('  ✓ Pressed Enter');
          await page.waitForTimeout(6000); // Wait for page to reload with Las Vegas events
          
          // Verify location changed
          const heading = await page.locator('h1, h2').first().textContent().catch(() => 'N/A');
          console.log(`  Final heading: ${heading}`);
          
          if (heading && heading.includes('Las Vegas')) {
            console.log('  ✓✓✓ Successfully changed to Las Vegas!');
          } else if (heading === 'N/A') {
            console.log('  ⚠ Could not read heading (page may still be loading)');
          } else {
            console.log('  ⚠ Location may not have changed (still showing: ' + heading + ')');
          }
        } else {
          console.log('  ✗ Location input not found after clicking New York');
          
          // Debug: show what inputs are visible
          const visibleInputs = await page.evaluate(() => {
            const inputs = Array.from(document.querySelectorAll('input'));
            return inputs
              .filter(i => i.offsetParent !== null)
              .map(i => ({
                type: i.type,
                placeholder: i.getAttribute('placeholder') || '',
                value: i.value
              }));
          });
          console.log(`  Visible inputs: ${JSON.stringify(visibleInputs)}`);
        }
      } else {
        console.log('  ✗ Could not find clickable New York element');
      }
      
    } catch (error) {
      console.warn('  Error:', error);
    }
    
    // Wait for final state
    await page.waitForTimeout(3000);
    
    // Take screenshot of main page with Las Vegas events
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const mainScreenshotPath = path.join(screenshotsDir, `01-main-page-${timestamp}.png`);
    
    console.log('\nTaking screenshot of main page...');
    await page.screenshot({ 
      path: mainScreenshotPath,
      fullPage: true 
    });
    console.log(`  Main page screenshot saved: ${mainScreenshotPath}`);
    
    // Find all event links on the page
    console.log('\nFinding event links...');
    const eventLinks = await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll('a[href*="/event/"]'));
      const uniqueUrls = new Set<string>();
      
      links.forEach(link => {
        const href = (link as HTMLAnchorElement).href;
        // Only include event detail pages, not tickets or other pages
        if (href && href.includes('/event/') && !href.includes('/tickets/')) {
          uniqueUrls.add(href);
        }
      });
      
      return Array.from(uniqueUrls);
    });
    
    console.log(`  Found ${eventLinks.length} unique event links`);
    
    // Click on first event and get ticket prices
    if (eventLinks.length > 0) {
      const firstEventUrl = eventLinks[0];
      console.log(`\nNavigating to first event to get ticket prices: ${firstEventUrl}`);
      
      try {
        // Navigate to the event page
        await page.goto(firstEventUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForTimeout(3000);
        
        // Close any popups/modals that might appear
        try {
          const closeButton = page.locator('button[aria-label*="close" i], button:has-text("×")').first();
          if (await closeButton.count() > 0 && await closeButton.isVisible({ timeout: 1000 })) {
            await closeButton.click({ timeout: 2000 });
            await page.waitForTimeout(1000);
          }
        } catch (e) {
          // No modal to close
        }
        
        // Get event title
        const eventTitle = await page.evaluate(() => {
          const h1 = document.querySelector('h1');
          if (h1 && h1.textContent) {
            return h1.textContent.trim();
          }
          return 'Unknown Event';
        });
        console.log(`  Event: ${eventTitle}`);
        
        // Set number of tickets to 2
        console.log('\nSetting number of tickets to 2...');
        const ticketSetResult = await page.evaluate(() => {
          // Look for quantity selector - could be a dropdown, buttons, or input
          // Try to find elements with "2" or quantity-related attributes
          
          // Try dropdown approach
          const selects = Array.from(document.querySelectorAll('select'));
          for (const select of selects) {
            // Check if this is a quantity selector
            const label = select.getAttribute('aria-label')?.toLowerCase() || '';
            const id = select.id?.toLowerCase() || '';
            const name = select.name?.toLowerCase() || '';
            
            if (label.includes('quantity') || label.includes('ticket') || 
                id.includes('quantity') || id.includes('ticket') ||
                name.includes('quantity') || name.includes('ticket')) {
              // Try to set value to 2
              const option2 = Array.from(select.options).find(opt => opt.value === '2' || opt.text === '2');
              if (option2) {
                select.value = option2.value;
                select.dispatchEvent(new Event('change', { bubbles: true }));
                return { success: true, method: 'dropdown', element: select.tagName };
              }
            }
          }
          
          // Try button approach - look for "+", "2", or increment buttons
          const buttons = Array.from(document.querySelectorAll('button'));
          
          // First, look for a button with "2" on it
          const button2 = buttons.find(btn => btn.textContent?.trim() === '2');
          if (button2) {
            (button2 as HTMLElement).click();
            return { success: true, method: 'button-2', element: button2.tagName };
          }
          
          // Look for increment buttons and click to get to 2
          const incrementBtn = buttons.find(btn => {
            const text = btn.textContent?.trim() || '';
            const ariaLabel = btn.getAttribute('aria-label')?.toLowerCase() || '';
            return text === '+' || text === '▲' || ariaLabel.includes('increase') || ariaLabel.includes('increment');
          });
          
          if (incrementBtn) {
            // Click increment button once (assuming default is 1)
            (incrementBtn as HTMLElement).click();
            return { success: true, method: 'increment-button', element: incrementBtn.tagName };
          }
          
          // Try input approach
          const inputs = Array.from(document.querySelectorAll('input[type="number"], input[type="text"]'));
          for (const input of inputs) {
            const label = (input as HTMLInputElement).getAttribute('aria-label')?.toLowerCase() || '';
            const id = (input as HTMLInputElement).id?.toLowerCase() || '';
            const name = (input as HTMLInputElement).name?.toLowerCase() || '';
            
            if (label.includes('quantity') || label.includes('ticket') || 
                id.includes('quantity') || id.includes('ticket') ||
                name.includes('quantity') || name.includes('ticket')) {
              (input as HTMLInputElement).value = '2';
              input.dispatchEvent(new Event('input', { bubbles: true }));
              input.dispatchEvent(new Event('change', { bubbles: true }));
              return { success: true, method: 'input', element: input.tagName };
            }
          }
          
          return { success: false, method: 'none', element: 'none' };
        });
        
        if (ticketSetResult.success) {
          console.log(`  ✓ Set quantity to 2 using ${ticketSetResult.method}`);
          await page.waitForTimeout(2000); // Wait for modal to update
          
          // Click the Continue button
          console.log('\nClicking Continue button...');
          const continueClicked = await page.evaluate(() => {
            const buttons = Array.from(document.querySelectorAll('button'));
            const continueBtn = buttons.find(btn => {
              const text = btn.textContent?.trim().toLowerCase() || '';
              return text === 'continue' || text.includes('continue');
            });
            
            if (continueBtn) {
              (continueBtn as HTMLElement).click();
              return { success: true };
            }
            return { success: false };
          });
          
          if (continueClicked.success) {
            console.log('  ✓ Clicked Continue button');
            await page.waitForTimeout(5000); // Wait for ticket listings to load
          } else {
            console.log('  ⚠ Continue button not found, tickets may already be showing');
            await page.waitForTimeout(3000);
          }
        } else {
          console.log('  ⚠ Could not find quantity selector, page may auto-show tickets');
          await page.waitForTimeout(3000);
        }
        
        // Extract ticket prices from the listings
        console.log('\nExtracting ticket prices...');
        
        // First, let's debug what we see on the page
        const pageDebugInfo = await page.evaluate(() => {
          // Look for the listings container on the right side
          const listingsTexts: string[] = [];
          
          // Try to find elements that might contain the ticket listings
          const listingsContainer = document.querySelector('[class*="listings"]') ||
                                   document.querySelector('[class*="Listings"]') ||
                                   document.querySelector('[data-testid*="listings"]');
          
          if (listingsContainer) {
            listingsTexts.push('Found listings container: ' + listingsContainer.className);
          } else {
            listingsTexts.push('No listings container found');
          }
          
          // Check if there's a scrollable area we need to interact with
          const scrollableElements = Array.from(document.querySelectorAll('*')).filter(el => {
            const style = window.getComputedStyle(el);
            return style.overflow === 'auto' || style.overflow === 'scroll' || 
                   style.overflowY === 'auto' || style.overflowY === 'scroll';
          });
          
          listingsTexts.push(`Found ${scrollableElements.length} scrollable elements`);
          
          return listingsTexts;
        });
        
        console.log('  Page debug info:', pageDebugInfo);
        
        // Scroll down in case ticket listings are below the fold
        await page.evaluate(() => {
          window.scrollTo(0, document.body.scrollHeight / 2);
        });
        await page.waitForTimeout(2000);
        
        // Also try scrolling within any scrollable containers (like the listings panel)
        await page.evaluate(() => {
          const scrollableElements = Array.from(document.querySelectorAll('*')).filter(el => {
            const style = window.getComputedStyle(el);
            return (style.overflow === 'auto' || style.overflow === 'scroll' || 
                   style.overflowY === 'auto' || style.overflowY === 'scroll') &&
                   el.scrollHeight > el.clientHeight;
          });
          
          // Scroll each scrollable element to make sure all content is rendered
          scrollableElements.forEach(el => {
            el.scrollTop = 0; // Scroll to top first
          });
        });
        await page.waitForTimeout(1000);
        
        const ticketPrices = await page.evaluate(() => {
          const MIN_TICKET_PRICE = 10;
          const MAX_TICKET_PRICE = 100000;
          const EXACT_PRICE_TEXT_LIMIT = 20;
          const FALLBACK_PRICE_TEXT_LIMIT = 50;
          const MAX_PARENT_SEARCH_DEPTH = 5;
          const MIN_PRICES_THRESHOLD = 2;
          
          const prices: string[] = [];
          const priceDetailsMap = new Map<string, {price: string, section?: string, row?: string}>();
          
          // Search for all text nodes and elements on the page
          const allElements = Array.from(document.querySelectorAll('*'));
          
          allElements.forEach(el => {
            const text = el.textContent?.trim() || '';
            
            // Look for prices in the format $XXX or $X,XXX
            // Only match elements with short text (likely price displays, not paragraphs)
            if (text.length < EXACT_PRICE_TEXT_LIMIT && text.match(/^\$[\d,]+(?:\.\d{2})?$/)) {
              const price = text;
              const numericValue = parseFloat(price.replace(/[$,]/g, ''));
              
              // Filter out unrealistic ticket prices (too low or too high)
              if (numericValue >= MIN_TICKET_PRICE && numericValue <= MAX_TICKET_PRICE) {
                // Check element bounds (even if not fully visible, as long as it's rendered)
                const rect = el.getBoundingClientRect();
                const computedStyle = window.getComputedStyle(el);
                const isRendered = computedStyle.display !== 'none' && 
                                  computedStyle.visibility !== 'hidden' &&
                                  (rect.width > 0 || rect.height > 0); // Relaxed visibility check
                
                if (isRendered && !prices.includes(price)) {
                  prices.push(price);
                  
                  // Try to find section/row info nearby
                  let parent = el.parentElement;
                  let sectionInfo = '';
                  let rowInfo = '';
                  
                  // Look up the DOM tree for section/row information
                  for (let i = 0; i < MAX_PARENT_SEARCH_DEPTH && parent; i++) {
                    const parentText = parent.textContent || '';
                    const sectionMatch = parentText.match(/(?:Section|Sec)\s*(\d+|[A-Z]+\d*)/i);
                    const rowMatch = parentText.match(/(?:Row|R)\s*(\d+|[A-Z]+\d*)/i);
                    
                    if (sectionMatch && !sectionInfo) sectionInfo = sectionMatch[1];
                    if (rowMatch && !rowInfo) rowInfo = rowMatch[1];
                    
                    parent = parent.parentElement;
                  }
                  
                  priceDetailsMap.set(price, {
                    price,
                    section: sectionInfo || undefined,
                    row: rowInfo || undefined
                  });
                }
              }
            }
          });
          
          // If we didn't find many prices with exact format, also try finding elements with price-like content
          if (prices.length < MIN_PRICES_THRESHOLD) {
            allElements.forEach(el => {
              const text = el.textContent?.trim() || '';
              
              // Match price patterns anywhere in short text
              if (text.length < FALLBACK_PRICE_TEXT_LIMIT) {
                const priceMatch = text.match(/\$[\d,]+(?:\.\d{2})?/);
                if (priceMatch) {
                  const price = priceMatch[0];
                  const numericValue = parseFloat(price.replace(/[$,]/g, ''));
                  
                  if (numericValue >= MIN_TICKET_PRICE && numericValue <= MAX_TICKET_PRICE && !prices.includes(price)) {
                    const rect = el.getBoundingClientRect();
                    const computedStyle = window.getComputedStyle(el);
                    const isRendered = computedStyle.display !== 'none' && 
                                      computedStyle.visibility !== 'hidden';
                    
                    if (isRendered) {
                      prices.push(price);
                      priceDetailsMap.set(price, { price });
                    }
                  }
                }
              }
            });
          }
          
          // Sort by price
          prices.sort((a, b) => {
            const aVal = parseFloat(a.replace(/[$,]/g, ''));
            const bVal = parseFloat(b.replace(/[$,]/g, ''));
            return aVal - bVal;
          });
          
          // Build details array from map
          const priceDetails = prices.map(price => priceDetailsMap.get(price)!);
          
          // Return both prices and details
          return { prices, details: priceDetails };
        });
        
        console.log(`\n✓ Found ${ticketPrices.prices.length} ticket prices:`);
        if (ticketPrices.prices.length > 0) {
          console.log('\n========== TICKET PRICES ==========');
          ticketPrices.prices.forEach((price, index) => {
            const detail = ticketPrices.details.find(d => d.price === price);
            let priceInfo = `${index + 1}. ${price}`;
            if (detail?.section) priceInfo += ` - Section ${detail.section}`;
            if (detail?.row) priceInfo += ` Row ${detail.row}`;
            console.log(priceInfo);
          });
          console.log('===================================\n');
        } else {
          console.log('  No ticket prices found. The page structure may have changed.');
        }
        
        // Take screenshot showing the ticket prices
        const ticketScreenshotPath = path.join(screenshotsDir, `02-ticket-prices-${timestamp}.png`);
        await page.screenshot({ 
          path: ticketScreenshotPath,
          fullPage: true 
        });
        console.log(`  Screenshot with ticket prices saved: ${ticketScreenshotPath}`);
        
      } catch (error) {
        console.error('  Error getting ticket prices:', error);
      }
    } else {
      console.log('  No event links found');
    }
    
    // Return to main page for final state
    console.log('\nReturning to main page...');
    await page.goto(STUBHUB_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(2000);
    
    // Wait a bit more for video recording
    if (ENABLE_VIDEO) {
      console.log('\nWaiting for video recording to complete...');
      await page.waitForTimeout(2000);
    }
    
    // Close the browser context
    console.log('\nClosing browser...');
    await context.close();
    
    // Wait for video file to be saved
    if (ENABLE_VIDEO) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // List video files
      const videoFiles = fs.readdirSync(videosDir);
      if (videoFiles.length > 0) {
        console.log(`\nVideo recordings saved:`);
        videoFiles.forEach(file => {
          console.log(`  ${path.join(videosDir, file)}`);
        });
      }
    }
    
    console.log('\n✓ Scraper completed successfully!');
    
  } catch (error) {
    console.error('\n✗ Error running scraper:');
    console.error(error);
    throw error;
  } finally {
    // Close browser in finally block to ensure cleanup even on errors
    if (browser) {
      await browser.close();
    }
  }
}

// Run the scraper
runScraper()
  .then(() => {
    console.log('\nDone.');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\nFailed to run scraper:', error);
    process.exit(1);
  });
