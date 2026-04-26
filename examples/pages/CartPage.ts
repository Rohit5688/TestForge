import 'dotenv/config';
import { expect } from '@playwright/test';
import { BasePage } from './BasePage.js';
import { getLocatorByRole, getLocatorByText } from 'vasu-playwright-utils';

export class CartPage extends BasePage {
  get checkoutBtn() { return getLocatorByRole('button', { name: 'Checkout' }); }
  get checkoutHeader() { return getLocatorByText('Checkout: Your Information'); }

  async verifyProduct(productName: string) {
    await expect(getLocatorByText(productName)).toBeVisible();
  }

  async checkout() {
    await this.click(this.checkoutBtn);
    await this.waitForStable();
  }

  async verifyOnCheckoutPage() {
    await expect(this.checkoutHeader).toBeVisible();
  }

}