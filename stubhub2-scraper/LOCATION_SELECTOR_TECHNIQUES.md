# Location Selector Detection Techniques

## Purpose
StubHub actively changes their UI to prevent automation. This document tracks which techniques work and don't work for detecting and clicking the location selector dropdown.

**Last Updated:** February 2, 2026

---

## Working Techniques ✅

### 1. Hover-Then-Click Pattern (Working as of Jan 26, 2026)
```typescript
await elementToClick.hover({ timeout: 3000, force: true });
await page.waitForTimeout(500);
await elementToClick.click({ timeout: 5000, force: true });
```
**Why it works:** StubHub's location dropdown uses JavaScript event listeners that trigger on hover, not just click. The hover action initializes the dropdown UI before clicking.

**Reliability:** High - This mimics human behavior more closely.

**Caveats:** 
- Requires `force: true` to bypass visibility checks
- Static 500ms wait may need adjustment if site becomes slower
- Must be applied to the parent container, not the SVG icon

---

### 2. Multiple Selector Fallbacks (Working)
```typescript
const locationSelectors = [
  '*:has(> div:has-text("Las Vegas")):has(> svg)',
  '*:has(> div:has-text("New York")):has(> svg)',
  'button:has(div:has-text("Las Vegas")):has(svg)',
  // ... 16 total selectors
];
```
**Why it works:** StubHub uses dynamic CSS classes and may show different city names depending on user's geolocation. Multiple city names increase chances of finding a visible selector.

**Reliability:** Medium-High - Requires maintenance as site structure changes.

**Caveats:**
- Order matters - more specific selectors first
- CSS class names change frequently
- :has() combinator may not work in all browsers (but works in Chromium)

---

### 3. SVG Parent Navigation (Working)
```typescript
if (selector.includes('svg') && selector.endsWith('svg')) {
  elementToClick = candidate.locator('..');  // Click parent, not SVG
}
```
**Why it works:** SVG elements are not directly clickable in Playwright. Must click their parent container.

**Reliability:** High - This is a Playwright limitation, not a site change.

---

### 4. Type with Delay Instead of Fill (Recommended - from working scraper)
```typescript
await searchInput.type('Las Vegas', { delay: 100 });  // Instead of fill()
```
**Why it works:** Mimics human typing speed, triggers onChange events per character, harder to detect as bot.

**Reliability:** High - More natural interaction pattern.

---

### 5. Custom User Agent (Recommended - from working scraper)
```typescript
userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
```
**Why it works:** Default Playwright user agent contains "HeadlessChrome" which is detectable. Custom UA looks like real browser.

**Reliability:** High - Essential for avoiding bot detection.

---

### 6. Screenshots at Each Step (Recommended)
```typescript
await page.screenshot({ path: path.join(screenshotsDir, '01-main-page.png') });
```
**Why it works:** Debugging - allows visual inspection of what the bot sees.

**Reliability:** N/A - Diagnostic only.

---

## Failed Techniques ❌

### 1. Direct Click Without Hover (Failed as of Jan 2026)
```typescript
await locationButton.click();  // DOESN'T WORK
```
**Why it failed:** Dropdown doesn't open because JavaScript listeners expect hover first.

**When it stopped working:** January 2026

**Error:** "Location search input not visible, the dropdown might not have opened properly"

---

### 2. Static Selector with Generic Class Names (Failed)
```typescript
await page.locator('button[class*="location"]').click();  // DOESN'T WORK
```
**Why it failed:** StubHub uses dynamic/hashed CSS class names that change on each deploy.

**Alternative:** Use :has-text() or aria-label selectors instead.

---

### 3. Short Timeout After Click (Failed)
```typescript
await elementToClick.click();
await page.waitForTimeout(500);  // TOO SHORT
```
**Why it failed:** Dropdown rendering takes 1-3 seconds in CI environments (GitHub Actions).

**Fix:** Increase to 3000ms minimum in CI, or use dynamic waits.

---

### 4. URL Parameters for Location (Failed - user confirmed)
```typescript
await page.goto('https://www.stubhub.com/explore?location=las-vegas');
```
**Why it failed:** StubHub ignores URL parameters for location, always defaults to auto-detected geolocation.

**User Note:** "We have tried this and it doesn't seem to work."

---

### 5. waitUntil: 'networkidle' (Too Slow)
```typescript
await page.goto(url, { waitUntil: 'networkidle' });  // TOO SLOW
```
**Why it failed:** StubHub has continuous background requests, networkidle never triggers.

**Alternative:** Use 'domcontentloaded' with manual timeouts.

---

## Current Best Practice (Feb 2026)

### Complete Location Selection Flow
```typescript
// 1. Wait for page to stabilize after clicking Explore
await page.waitForTimeout(5000);  // Increased from 3000

// 2. Try multiple selectors with hover pattern
const locationSelectors = [
  '*:has(> div:has-text("Las Vegas")):has(> svg)',
  // ... more fallbacks
];

for (const selector of locationSelectors) {
  const candidate = page.locator(selector).first();
  if (await candidate.count()) {
    await candidate.waitFor({ timeout: 10000, state: 'visible' });  // Increased timeout
    if (await candidate.isVisible()) {
      let elementToClick = selector.endsWith('svg') ? candidate.locator('..') : candidate;
      
      // 3. Hover, wait, click pattern
      await elementToClick.hover({ timeout: 3000, force: true });
      await page.waitForTimeout(500);
      await elementToClick.click({ timeout: 5000, force: true });
      
      locationClicked = true;
      await page.waitForTimeout(3000);
      break;
    }
  }
}

// 4. Verify dropdown opened by checking for input
const searchInput = page.locator('input[placeholder*="location" i]').first();
if (!await searchInput.isVisible()) {
  throw new Error('Location dropdown did not open');
}

// 5. Type with human-like delay
await searchInput.type('Las Vegas', { delay: 100 });

// 6. Select from dropdown
const lasVegasOption = page.locator('text=/^Las Vegas, NV, USA$/i').first();
await lasVegasOption.waitFor({ timeout: 15000 });
await lasVegasOption.click();

// 7. Validate location was actually set (check event URLs later)
```

---

## Environment Differences

### Local vs GitHub Actions CI

| Factor | Local (macOS) | CI (Ubuntu) | Impact |
|--------|--------------|-------------|---------|
| **Page Load Speed** | Fast | Slow (shared VM) | Need longer timeouts in CI |
| **Network** | Home IP | Datacenter IP | May trigger bot detection |
| **Display** | Real | Virtual (Xvfb) | Rendering timing differences |
| **User Agent** | Needed | CRITICAL | CI more likely to be detected |

**Recommendation:** Test with `HEADLESS_MODE=true` locally to simulate CI behavior.

---

## Debugging Commands

### When Location Selector Fails

1. **Capture page HTML:**
```typescript
const html = await page.content();
fs.writeFileSync('debug-location-fail.html', html);
```

2. **Log all buttons on page:**
```typescript
const buttons = await page.evaluate(() => {
  return Array.from(document.querySelectorAll('button'))
    .filter(b => b.offsetParent !== null)
    .map(b => ({ text: b.textContent, classes: b.className }));
});
console.log(JSON.stringify(buttons, null, 2));
```

3. **Check for location-related elements:**
```typescript
const locationElements = await page.evaluate(() => {
  return Array.from(document.querySelectorAll('*'))
    .filter(el => {
      const text = el.textContent || '';
      return text.includes('Las Vegas') || text.includes('location');
    })
    .map(el => ({
      tag: el.tagName,
      text: el.textContent?.substring(0, 50),
      visible: (el as HTMLElement).offsetParent !== null
    }));
});
```

4. **Take screenshot before each attempt:**
```typescript
await page.screenshot({ 
  path: `debug-before-location-${Date.now()}.png`,
  fullPage: true 
});
```

---

## Known Issues

### Issue #1: "Today" Date Filter Not Found (Jan 2026)
- **Status:** Non-blocking - script continues without date filter
- **Likely Cause:** StubHub changed date dropdown structure
- **Workaround:** Post-filter events by date after collection
- **Priority:** Low (date range filtering still works via event scraping)

### Issue #2: GitHub Actions IP Detection (Feb 2026)
- **Status:** Under investigation
- **Symptom:** Location selector not visible in CI, works locally
- **Likely Cause:** StubHub serves different HTML to datacenter IPs
- **Mitigation:** Custom user agent, increase timeouts, retry logic
- **Priority:** HIGH

### Issue #3: Quantity Prompt Inconsistent
- **Status:** Handled with try-catch
- **Symptom:** Sometimes appears, sometimes doesn't
- **Workaround:** Check for visibility before filling
- **Priority:** Low (already handled)

---

## Maintenance Checklist

When location selector breaks again:

- [ ] Check if selector structure changed (inspect live site)
- [ ] Update selector list with new patterns
- [ ] Verify hover-then-click still required
- [ ] Test with different geolocations/user agents
- [ ] Check if input placeholder text changed
- [ ] Verify dropdown option text format ("Las Vegas, NV, USA")
- [ ] Update timeouts if site became slower
- [ ] Add new working selectors to top of list
- [ ] Document what stopped working in this file
- [ ] Test in both local and CI environments
- [ ] Consider adding retry mechanism if not present

---

## Future Improvements

1. **Dynamic Timeout Calculation**
   - Measure actual page load times
   - Adjust waits based on environment (CI vs local)

2. **Geolocation Override**
   - Set browser geolocation to Las Vegas
   - May reduce selector variability

3. **Network Request Interception**
   - Intercept and log API calls
   - May reveal better automation approach

4. **Stealth Mode**
   - Use playwright-stealth plugin
   - Better bot detection evasion

5. **Fallback to API**
   - Research if StubHub has undocumented API
   - More reliable than UI automation

---

## Version History

- **Feb 2, 2026:** Initial documentation created
  - Documented hover-then-click pattern
  - Added environment differences
  - Listed 16 selector fallbacks
  - Added debugging commands
