import 'dotenv/config';
import { BasePage } from './BasePage.js';
import { expect } from '@playwright/test';

export class EcommerceCheckoutPage extends BasePage {
  async verifyOnCheckoutPage() {
    await expect(this.page).toHaveURL(/.*checkout\/checkout/);
  }
}
