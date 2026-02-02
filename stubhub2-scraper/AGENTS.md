# Agent Context: StubHub2 Scraper

**For AI Agents and Future Maintainers**  
**Last Updated:** February 2, 2026

---

## Overview

This is a **Playwright-based web scraper** that automates ticket price collection from StubHub.com for Las Vegas events. It's designed to run both locally and in GitHub Actions CI.

### Purpose
- Navigate StubHub → Select Las Vegas location → Collect event listings
- For each event: Extract the 2 lowest ticket prices
- Filter and send results to Slack (configurable price range)
- Run daily via GitHub Actions scheduled workflow

### Key Challenge
**⚠️ StubHub actively prevents automation.** The site frequently changes its UI structure, CSS selectors, and employs bot detection. This scraper must be highly resilient and adaptive.

---

## Critical Context: Anti-Scraping Measures

### The Problem
StubHub does NOT want to be scraped. They:

1. **Change CSS selectors frequently** - Dynamic/hashed class names that break on each deploy
2. **Detect automation tools** - Default Playwright user agents trigger different HTML responses
3. **Use JavaScript-heavy UI** - Elements load asynchronously with unpredictable timing
4. **Vary by geolocation** - Different city names shown based on datacenter IP detection
5. **Employ hover-based interactions** - Some UI elements require hover before click to initialize

### Required Defense Strategy

**📖 ALWAYS read `LOCATION_SELECTOR_TECHNIQUES.md` before making changes to selectors!**

This file tracks:
- ✅ What techniques currently work (and WHY they work)
- ❌ What has failed in the past (and WHEN it stopped working)
- 🔄 Environmental differences (local vs CI)
- 🛠️ Debugging strategies when selectors break

### Core Principles for This Codebase

#### 1. **Multiple Fallback Selectors** (REQUIRED)
Never rely on a single selector. Always provide 10-16 fallback options:

```typescript
const locationSelectors = [
  // Most specific first
  '*:has(> div:has-text("Las Vegas")):has(> svg)',
  '*:has(> div:has-text("New York")):has(> svg)',
  'button:has(div:has-text("Las Vegas")):has(svg)',
  // ... 13 more fallbacks
];

// Try each until one works
for (const selector of locationSelectors) {
  if (await element.isVisible()) {
    // Found it!
  }
}
```

**Why:** When StubHub changes structure, some selectors break but others continue working.

#### 2. **Validation After Selection** (CRITICAL)
Never assume an action succeeded. Always verify:

```typescript
// After selecting Las Vegas location
const eventLinks = await page.collectEventLinks();
const nonLasVegasEvents = eventLinks.filter(event => 
  !event.url.includes('las-vegas')
);

if (nonLasVegasEvents.length > eventLinks.length * 0.5) {
  throw new Error('Location validation failed - wrong city selected');
}
```

**Why:** Bot detection may show different city than requested. Validate before processing 48 events.

#### 3. **Retry Mechanisms** (REQUIRED)
Timing issues are common in CI. Always retry critical actions:

```typescript
const maxRetries = 3;
for (let attempt = 1; attempt <= maxRetries; attempt++) {
  try {
    await selectLocation();
    locationSuccess = true;
    break;
  } catch (error) {
    if (attempt === maxRetries) throw error;
    console.log(`Retry ${attempt}/${maxRetries}...`);
    await page.waitForTimeout(3000);
  }
}
```

**Why:** GitHub Actions VMs are slower than local development. Race conditions happen.

#### 4. **Extensive Diagnostic Logging** (REQUIRED)
When selectors fail, we need to know WHY:

```typescript
// On failure, save:
await page.screenshot({ path: 'debug-fail.png', fullPage: true });
const html = await page.content();
fs.writeFileSync('debug-fail.html', html);
console.error('Failed on attempt X - see debug-fail.png and debug-fail.html');
```

**Why:** Can't debug CI failures without seeing what the bot saw. Screenshots and HTML are essential.

#### 5. **Environment-Aware Timeouts** (REQUIRED)
CI is 2-3x slower than local development:

```typescript
// ❌ WRONG - works locally, fails in CI
await page.waitForTimeout(1000);

// ✅ CORRECT - generous timeouts for CI
await page.waitForTimeout(5000);
await element.waitFor({ timeout: 10000, state: 'visible' });
```

**Why:** GitHub Actions uses shared VMs with variable performance.

---

## Technology Stack

- **Runtime:** Node.js 20
- **Language:** TypeScript 5.3.3 (strict mode, ES2022 target)
- **Automation:** Playwright 1.57.0 (Chromium browser)
- **Environment:** 
  - Local: macOS, visible browser OR headless
  - CI: Ubuntu Linux, headless only, Xvfb virtual display
- **Scheduling:** GitHub Actions cron (daily at 1pm PST / 9pm UTC)
- **Notifications:** Slack webhooks (Block Kit formatted messages)

---

## File Structure

```
stubhub2-scraper/
├── src/
│   └── index.ts                 # Main scraper logic (~700 lines)
├── screenshots/                 # Auto-created, 8+ screenshots per run
├── videos/                      # Auto-created if ENABLE_VIDEO=true
├── package.json                 # Dependencies and npm scripts
├── tsconfig.json                # TypeScript config (ES2022, strict)
├── AGENTS.md                    # ← You are here
├── IMPROVEMENTS.md              # Changelog of all improvements (Feb 2, 2026)
├── LOCATION_SELECTOR_TECHNIQUES.md  # ⚠️ CRITICAL - Selector patterns that work/fail
└── README.md                    # User-facing documentation
```

---

## Configuration Constants (in src/index.ts)

```typescript
// Event Processing
const MAX_EVENTS_TO_PROCESS: number | null = null;  // null = process all

// Browser Behavior
const HEADLESS_MODE = true;                         // Hide browser window
const ENABLE_VIDEO = process.env.ENABLE_VIDEO || 'true';  // Record for CI debugging

// Slack Integration
const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL || '';
const SLACK_CHANNEL = process.env.SLACK_CHANNEL || '';

// Price Filtering (for Slack only - stdout shows all)
const PRICE_RANGE_LOW = 0;                          // Min price for Slack
const PRICE_RANGE_HIGH = 100;                       // Max price for Slack
```

---

## Execution Flow

### Step 1: Initialize Browser
```typescript
browser = await chromium.launch({ headless: HEADLESS_MODE });
context = await browser.newContext({
  userAgent: 'Mozilla/5.0 ...',  // CRITICAL - Avoid bot detection
  viewport: { width: 1280, height: 720 },
  recordVideo: { dir: 'videos/' }  // For CI debugging
});
```

### Step 2: Navigate to StubHub
```typescript
await page.goto('https://www.stubhub.com');
await page.screenshot({ path: '01-homepage.png' });  // Visual checkpoint
```

### Step 3: Click Explore Link
```typescript
await page.locator('a[href="/explore"]').click();
await page.waitForTimeout(5000);  // Generous wait for CI
```

### Step 4: Select Location (MOST FRAGILE)
**This is where failures happen most often!**

```typescript
// Try 16 different selectors with 3 retries
for (let attempt = 1; attempt <= 3; attempt++) {
  for (const selector of locationSelectors) {
    // Hover first (StubHub requires this!)
    await element.hover({ force: true });
    await page.waitForTimeout(500);
    await element.click({ force: true });
    
    // Type with human-like delay (NOT fill()!)
    await input.type('Las Vegas', { delay: 100 });
    
    // Validate after selection
    if (await input.isVisible()) {
      locationSuccess = true;
      break;
    }
  }
}
```

### Step 5: Optional Date Filter
```typescript
// Try to select "Today" but continue if not found
await page.locator('div:has-text("All dates")').click();
const todayOption = page.locator('text=/^Today$/i');
if (await todayOption.isVisible()) {
  await todayOption.click();
}
```

### Step 6: Collect Event Links
```typescript
const eventLinks = await page.evaluate(() => {
  return Array.from(document.querySelectorAll('a[href*="/event/"]'))
    .map(a => ({ name: a.textContent, url: a.href }));
});

// VALIDATE LOCATION
const nonLasVegasEvents = eventLinks.filter(/* check URL */);
if (nonLasVegasEvents.length > eventLinks.length * 0.5) {
  throw new Error('Wrong location detected!');
}
```

### Step 7: Process Each Event
```typescript
for (const event of eventLinks) {
  await page.goto(event.url);
  
  // Extract all prices from page
  const prices = await page.evaluate(() => {
    const matches = document.body.innerText.matchAll(/\$(\d+)/g);
    return Array.from(matches)
      .map(m => parseInt(m[1]))
      .filter(p => p > 0 && p < 10000)
      .sort((a, b) => a - b)
      .slice(0, 2);  // Two lowest
  });
  
  results.push({ name: event.name, url: event.url, lowestPrices: prices });
}
```

### Step 8: Filter and Send to Slack
```typescript
const filtered = results.filter(event => {
  const price = event.lowestPrices[0];
  return price >= PRICE_RANGE_LOW && price <= PRICE_RANGE_HIGH;
});

await postToSlack(filtered);  // Batched for 4000 char limit
```

---

## Common Failure Modes

### 1. "Could not find a visible location selector"
**Symptom:** Fails in CI, works locally  
**Cause:** StubHub serves different HTML to datacenter IPs (bot detection)  
**Fix:** 
- Check if user agent is set correctly
- Increase timeouts (5s → 8s)
- Add more city name fallbacks (SF, Chicago, Boston)
- Verify screenshots show correct page

### 2. "Location validation failed - not showing Las Vegas events"
**Symptom:** Events collected but wrong city  
**Cause:** Location selector clicked but wrong option selected  
**Fix:**
- Check if "Las Vegas, NV, USA" text changed to "Las Vegas, Nevada"
- Verify dropdown opened (screenshot before selection)
- Add more specific regex for option matching

### 3. "Today option not found in dropdown"
**Symptom:** Date filter doesn't work  
**Cause:** StubHub changed date dropdown structure  
**Fix:** Non-blocking issue, script continues. Can post-filter events by date.

### 4. No prices found for events
**Symptom:** `lowestPrices: []` for many events  
**Cause:** Price element selectors changed  
**Fix:**
- Check screenshots of event detail pages
- Update price regex pattern
- Look for new price element structure in HTML dumps

---

## When Making Changes

### Before Modifying Selectors

1. **Read `LOCATION_SELECTOR_TECHNIQUES.md`** - Check what's known to work/fail
2. **Test locally in headless mode** - Matches CI environment
3. **Add, don't replace** - Keep old selectors as fallbacks
4. **Document changes** - Update techniques file with findings

### After Making Changes

1. **Test locally:** `npm run dev` (with HEADLESS_MODE=true)
2. **Check screenshots:** Verify each step completed correctly
3. **Verify videos:** Watch what the bot actually sees
4. **Commit with context:** Explain WHAT changed and WHY
5. **Update techniques doc:** Add new working patterns or failed attempts
6. **Test in CI:** Trigger manual workflow run before relying on schedule

### Adding New Fallback Selectors

```typescript
// ✅ GOOD - Add to existing array
const locationSelectors = [
  // NEW PATTERN (add date discovered)
  'button[data-location-picker="true"]',  // Added Feb 2, 2026
  
  // EXISTING PATTERNS (keep for backwards compatibility)
  '*:has(> div:has-text("Las Vegas")):has(> svg)',
  // ... rest of fallbacks
];
```

### Debugging CI Failures

1. **Check GitHub Actions artifacts:**
   - Download `browser-videos/` - Watch what happened
   - Download `screenshots/` - See each step visually
   - Download `debug-html/` - Inspect page structure (only on failure)

2. **Compare HTML structure:**
   - Open `debug-location-fail-attempt1.html` locally
   - Search for "Las Vegas" or "location" to find new selectors
   - Update selector list with new patterns

3. **Check logs for timing:**
   - Look for "Retry X/3" messages
   - If all 3 attempts failed instantly → selector is wrong
   - If attempts timeout → increase wait times

---

## Bot Detection Evasion Techniques

### Currently Implemented ✅

1. **Custom User Agent** - Hides "HeadlessChrome" signature
   ```typescript
   userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) ...'
   ```

2. **Human-Like Typing** - 100ms delay between keystrokes
   ```typescript
   await input.type('Las Vegas', { delay: 100 });  // Not fill()!
   ```

3. **Hover Before Click** - Mimics mouse movement
   ```typescript
   await element.hover();
   await page.waitForTimeout(500);
   await element.click();
   ```

4. **Variable Waits** - Not perfectly timed like bots
   ```typescript
   await page.waitForTimeout(2000 + Math.random() * 1000);  // 2-3s
   ```

### Future Enhancements (if detection increases)

1. **Geolocation Override** - Set browser location to Las Vegas
2. **Stealth Plugin** - Use playwright-extra with stealth mode
3. **Request Interception** - Block tracking scripts
4. **Cookies/Local Storage** - Simulate returning user
5. **Mouse Movements** - Random cursor path to elements

---

## Environment Variables

### Required in GitHub Actions

```yaml
SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK_URL }}
SLACK_CHANNEL: ${{ secrets.SLACK_CHANNEL }}
```

### Optional

```bash
ENABLE_VIDEO=true           # Record browser sessions (default: true)
DEBUG=true                  # Extra verbose logging
```

---

## Performance Metrics

| Metric | Target | Current | Notes |
|--------|--------|---------|-------|
| Total Runtime | < 120s | ~80s | For 48 events |
| Location Selection | < 15s | ~8s | Most critical step |
| Event Processing | < 90s | ~65s | Parallel would help |
| Screenshot Overhead | < 5s | ~3s | 8 screenshots @ ~300ms each |
| Video Overhead | < 10s | ~5s | Encoding at end |
| Success Rate (CI) | > 90% | ? | Monitor after improvements |

---

## Known Limitations

1. **Date Filter Unreliable** - "Today" option often not found, continues anyway
2. **No Parallel Processing** - Events scraped sequentially (could be 5x faster)
3. **Hard-Coded to Las Vegas** - Would need refactor for other cities
4. **No Rate Limiting** - StubHub may temporarily block if too many requests
5. **CSS Selector Brittleness** - Requires frequent maintenance as site changes

---

## Maintenance Checklist

### Weekly
- [ ] Check GitHub Actions success rate
- [ ] Review any new error patterns in logs
- [ ] Update `LOCATION_SELECTOR_TECHNIQUES.md` if selectors changed

### Monthly
- [ ] Test locally with latest Playwright version
- [ ] Review Slack notifications for data quality
- [ ] Update user agent string to latest Chrome version
- [ ] Archive old screenshots/videos (keep last 30 days)

### When Failures Start Occurring
- [ ] Download CI artifacts (videos, screenshots, HTML)
- [ ] Identify which step is failing
- [ ] Inspect HTML for selector changes
- [ ] Add new fallback selectors
- [ ] Test locally in headless mode
- [ ] Document findings in techniques file
- [ ] Deploy and monitor

---

## Testing Strategy

### Local Testing
```bash
# Headless mode (simulates CI)
npm run dev

# Check screenshots created
ls -la screenshots/

# Check videos created (if enabled)
ls -la videos/

# Verify events collected
grep "Total unique events found" # Should be 40-60
```

### CI Testing
```bash
# Manual trigger (before relying on schedule)
gh workflow run stubhub2-scraper.yml

# Check run results
gh run list --workflow=stubhub2-scraper.yml

# Download artifacts for debugging
gh run download <run-id>
```

---

## Related Documentation

- **`LOCATION_SELECTOR_TECHNIQUES.md`** - ⚠️ CRITICAL - Read this before touching selectors!
- **`IMPROVEMENTS.md`** - Full changelog of Feb 2, 2026 reliability improvements
- **`README.md`** - User-facing setup and usage instructions
- **`.github/workflows/stubhub2-scraper.yml`** - CI/CD configuration

---

## Key Takeaways for Agents

### DO ✅
- Always maintain multiple fallback selectors (10+ options)
- Validate after each critical action (location, events)
- Add retry mechanisms for timing-sensitive operations
- Save screenshots and HTML on failures
- Use generous timeouts for CI (5-10 seconds)
- Type with delays, not instant fill()
- Document what works and what fails
- Test in headless mode locally before CI

### DON'T ❌
- Rely on single CSS selectors (they WILL break)
- Assume actions succeeded without validation
- Use `waitUntil: 'networkidle'` (never triggers)
- Use default Playwright user agent (detected as bot)
- Remove old selectors (keep as fallbacks)
- Use short timeouts < 3 seconds
- Skip documentation when fixing selectors
- Deploy without testing locally first

---

## Emergency Rollback

If new changes break everything:

```bash
# Revert last commit
git revert HEAD
git push

# Or revert to specific working commit
git revert <commit-sha>
git push

# Disable scheduled runs temporarily
# Edit .github/workflows/stubhub2-scraper.yml:
# Comment out the `schedule:` section
```

---

## Contact / Escalation

If the scraper is completely broken:

1. Check `LOCATION_SELECTOR_TECHNIQUES.md` for recent updates
2. Review GitHub Issues for this repo
3. Download latest CI artifacts to diagnose
4. Compare HTML structure between working and broken runs
5. Consider temporary fix: Disable GitHub Actions until resolved

---

**Remember:** This scraper is fighting an uphill battle against StubHub's anti-bot measures. Resilience and adaptability are more important than elegance. When in doubt, add more fallbacks and more validation.

**Last Major Update:** February 2, 2026 - Added retry logic, location validation, increased timeouts, custom UA, video recording, comprehensive diagnostics.
