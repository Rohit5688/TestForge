import { BasePage } from './BasePage.js';
import { expect } from '@playwright/test';

export class CartPage extends BasePage {
    private checkoutButton = 'a:has-text("Checkout")';

    async verifyProductInCart(name: string) {
        const item = this.page.locator(`table.table-bordered td.text-left:has-text("${name}")`).first();
        await expect(item).toBeVisible();
    }

    async proceedToCheckout() {
        const btn = this.page.locator(this.checkoutButton).first();
        await btn.click();
        await this.page.waitForLoadState('load');
    }
}
