import 'dotenv/config';
import { BasePage } from './BasePage.js';

export class EcommerceCategoryPage extends BasePage {
  async selectProduct(name: string) {
    await this.page.getByRole('link', { name: name }).first().click();
    await this.page.waitForLoadState('networkidle');
  }
}
