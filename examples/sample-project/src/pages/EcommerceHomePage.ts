import 'dotenv/config';
import { BasePage } from './BasePage.js';

export class EcommerceHomePage extends BasePage {
  get shopByCategory() { return this.page.getByRole('button', { name: 'Shop by Category' }); }
  
  async navigate() {
    await this.page.goto(process.env.BASE_URL || 'https://ecommerce-playground.lambdatest.io/');
    await this.waitForStable();
  }

  async searchFor(text: string) {
    await this.page.locator('input[name="search"]').first().fill(text);
    await this.page.locator('button.type-text').click(); // The SEARCH button
    await this.page.waitForLoadState('networkidle');
  }
}
