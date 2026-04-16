import { BasePage } from './BasePage.js';
import { expect } from '@playwright/test';

export class CheckoutPage extends BasePage {
    async verifyOnCheckoutPage() {
        await expect(this.page).toHaveURL(/.*checkout/);
        const heading = this.page.locator('h1:has-text("Checkout")');
        await expect(heading).toBeVisible();
    }
}
