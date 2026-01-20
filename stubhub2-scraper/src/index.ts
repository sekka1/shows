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
    
    // Take screenshot
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const screenshotPath = path.join(screenshotsDir, `stubhub-explore-${timestamp}.png`);
    
    console.log('\nTaking screenshot...');
    await page.screenshot({ 
      path: screenshotPath,
      fullPage: true 
    });
    console.log(`  Screenshot saved: ${screenshotPath}`);
    
    // Check for events on the page
    const eventCount = await page.locator('[class*="EventCard"], [data-testid*="event"], a[href*="/event/"]').count();
    console.log(`\nEvents found on page: ${eventCount}`);
    
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
