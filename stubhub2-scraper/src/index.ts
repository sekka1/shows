import { chromium, Browser, Page } from 'playwright';

const STUBHUB_URL = 'https://www.stubhub.com';

async function main(): Promise<void> {
  let browser: Browser | null = null;

  try {
    console.log('Launching browser...');
    browser = await chromium.launch({ headless: false });

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

    // Pause briefly so you can see the result
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
