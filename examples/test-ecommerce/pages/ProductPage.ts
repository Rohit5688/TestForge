import { BasePage } from './BasePage.js';

export class ProductPage extends BasePage {
    private availabilityLabel = '.list-unstyled:has-text("Availability")';
    private addToCartButton = '#button-cart, button:has-text("Add to Cart"), button:has-text("ADD TO CART")';
    private cartIconHeader = 'div#entry_217825 button, .cart-icon';

    async isInStock() {
        const availability = this.page.locator(this.availabilityLabel).first();
        // Synchronization: Wait for text to appear
        await availability.waitFor({ state: 'visible', timeout: 5000 });

        const text = await availability.innerText();
        return !text.toLowerCase().includes('out of stock');
    }

    async addToCart() {
        const btn = this.page.locator(this.addToCartButton).first();
        await btn.scrollIntoViewIfNeeded();
        await btn.click({ force: true });
        // Wait for success message/notification or cart count update
        await this.page.waitForSelector('.alert-success, .toast', { state: 'visible', timeout: 5000 }).catch(() => {});
    }

    async goToCart() {
        const cartIcon = this.page.locator(this.cartIconHeader).first();
        await cartIcon.click();
        // Handle side-cart or direct navigation
        const viewCartBtn = this.page.locator('a:has-text("View Cart")').first();
        if (await viewCartBtn.isVisible()) {
            await viewCartBtn.click();
        }
        await this.page.waitForLoadState('load');
    }
}
