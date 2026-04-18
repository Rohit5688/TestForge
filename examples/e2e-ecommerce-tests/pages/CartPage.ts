import 'dotenv/config';
import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from './BasePage';

export class CartPage extends BasePage {
  readonly checkoutBtn: Locator;

  constructor(page: Page) {
    super(page);
    this.checkoutBtn = page.getByRole("link", { name: "Checkout" });
  }

  async proceedToCheckout() {
    await this.click(this.checkoutBtn);
    await this.waitForStable();
  }
}
