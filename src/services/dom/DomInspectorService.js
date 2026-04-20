import { chromium } from 'playwright';
export class DomInspectorService {
    async inspect(url, waitForSelector, storageState, includeIframes, loginMacro) {
        let browser = null;
        try {
            browser = await chromium.launch({ headless: true });
            const contextArgs = {};
            if (storageState) {
                contextArgs.storageState = storageState;
            }
            const context = await browser.newContext(contextArgs);
            const page = await context.newPage();
            // Dynamic Macro Login sequence
            if (loginMacro) {
                await page.goto(loginMacro.loginUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
                await page.fill(loginMacro.userSelector, loginMacro.usernameValue);
                await page.fill(loginMacro.passSelector, loginMacro.passwordValue);
                await page.click(loginMacro.submitSelector);
                // Wait for redirection/network to settle
                await page.waitForLoadState('networkidle').catch(() => { });
            }
            // Navigate to ultimate destination
            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
            // Basic wait to ensure dynamic JS components settle
            await page.waitForLoadState('networkidle').catch(() => { });
            if (waitForSelector) {
                await page.waitForSelector(waitForSelector, { timeout: 5000 }).catch(() => { });
            }
            // We extract the AOM (Accessibility Object Model) which strips layout noise
            // and only gives interactive/semantic nodes with their exact computed names and roles.
            const mainSnapshot = await (page.accessibility.snapshot());
            const result = { mainFrame: mainSnapshot };
            // Optional recursive pass for inner frames (like Stripe fields or generic embedded sites)
            if (includeIframes) {
                result.iframes = [];
                for (const frame of page.frames()) {
                    if (frame === page.mainFrame() || frame.isDetached())
                        continue;
                    try {
                        // Some specialized frames might not grant layout access based on origin, catch gracefully
                        const fSnap = await (frame.accessibility?.snapshot?.() || (page.accessibility.snapshot({ root: await frame.frameElement() })));
                        if (fSnap) {
                            result.iframes.push({ url: frame.url(), snapshot: fSnap });
                        }
                    }
                    catch (e) {
                        result.iframes.push({ url: frame.url(), snapshot: "Cross-origin or isolated frame restricted." });
                    }
                }
            }
            return JSON.stringify(result, null, 2);
        }
        catch (error) {
            return `[ERROR] Failed to inspect DOM at ${url}:\n${error.message}`;
        }
        finally {
            if (browser) {
                await browser.close().catch(() => { });
            }
        }
    }
}
//# sourceMappingURL=DomInspectorService.js.map