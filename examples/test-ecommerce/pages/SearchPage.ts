import { BasePage } from './BasePage.js';

export class SearchPage extends BasePage {
    private productListing = '.product-layout, .product-thumb';

    async waitForResultsStable() {
        // High-Fidelity: Ensure the listing container is present and visible
        await this.page.waitForSelector(this.productListing, { state: 'visible', timeout: 10000 });
    }

    async selectProductByIndex(index: number = 0) {
        await this.waitForResultsStable();
        
        const products = this.page.locator(this.productListing);
        const targetProduct = products.nth(index);
        
        const nameLink = targetProduct.locator('h4 a, .caption a').first();
        const productName = await nameLink.innerText();
        
        // Ensure element is actually in viewport
        await nameLink.scrollIntoViewIfNeeded();
        await nameLink.click({ force: true });
        await this.page.waitForLoadState('load');
        
        return productName.trim();
    }
}
