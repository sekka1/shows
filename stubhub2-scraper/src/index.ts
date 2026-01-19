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
    
    // Wait a bit more for content to render
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
    
    // Close the browser
    console.log('\nClosing browser...');
    await context.close();
    await browser.close();
    
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
