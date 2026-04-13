import 'dotenv/config';
import { BasePage } from './BasePage.js';

export class EcommerceProductPage extends BasePage {
  get addToCartBtn() { return this.page.getByRole('button', { name: 'Add to Cart' }); }

  async addToCart() {
    await this.addToCartBtn.click();
    // Wait for the success notification
    await this.page.waitForSelector('.toast-body', { state: 'visible' }).catch(() => {});
  }

  async viewCart() {
    // Navigate directly to cart to bypass intermittent notification disappearance
    await this.page.goto('https://ecommerce-playground.lambdatest.io/index.php?route=checkout/cart');
    await this.page.waitForLoadState('networkidle');
  }
}
