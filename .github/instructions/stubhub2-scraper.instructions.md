# StubHub2 Scraper Instructions

## Purpose
This scraper navigates to StubHub's explore page, selects Las Vegas as the location, and captures screenshots and videos of the results.

## Screenshot Requirements

**ALWAYS** include a screenshot in PR comments after making ANY changes to the stubhub2-scraper:

1. Run the scraper after making changes: `cd stubhub2-scraper && npm run dev`
2. Take the screenshot from `stubhub2-scraper/screenshots/` directory
3. Post the screenshot in your PR comment to show what the scraper captured
4. Verify that the screenshot shows:
   - Las Vegas events (not New York or other cities)
   - The location selector shows "Las Vegas" or "Las Vegas, NV"
   - Events are properly loaded and visible

## Expected Behavior

The scraper should:
1. Navigate to StubHub explore page
2. Close any modals/popups
3. Click on the location selector/dropdown
4. Enter "Las Vegas, Nevada" and select it
5. Wait for results to load
6. Capture a full-page screenshot showing Las Vegas events
7. Record video of the entire browsing session

## Location Verification

CRITICAL: Always verify the location is set to Las Vegas:
- The page should show "Las Vegas" or "Las Vegas, NV" in the location selector
- Events should be for Las Vegas venues (e.g., T-Mobile Arena, MGM Grand, Caesars Palace, The Sphere, etc.)
- If events show New York, San Francisco, or other cities, the location selection FAILED

## Implementation Notes

- Use Playwright with real Chromium browser
- Target URL parameters include Las Vegas coordinates (lat=MzYuMjQ3, lon=LTExNS4yMTg%3D)
- However, URL parameters alone may not work - must interact with UI to set location
- Screenshots saved to `screenshots/` directory
- Videos saved to `videos/` directory
- TypeScript with ES2022 target

## Testing

Before committing changes:
1. Run the scraper locally
2. Verify screenshot shows Las Vegas events
3. Check that location selector displays "Las Vegas"
4. Ensure video recording completes successfully
