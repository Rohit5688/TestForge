import 'dotenv/config';
import { BasePage } from './BasePage.js';

export class EcommerceCartPage extends BasePage {
  async proceedToCheckout() {
    await this.page.getByRole('link', { name: 'Checkout', exact: true }).first().click();
    await this.page.waitForLoadState('networkidle');
  }
}
