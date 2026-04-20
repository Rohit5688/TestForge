import { BasePage } from './BasePage.js';

export class ResultsPage extends BasePage {
  private get inStockCheckbox() { return this.page.getByRole('checkbox', { name: 'In stock', exact: true }).first(); }
  private get firstProductLink() { return this.page.getByRole('link').filter({ has: this.page.getByRole('heading') }); }
  private get firstAddToCartBtn() { return this.page.getByRole('button', { name: '' }); }

  async filterInStock() {
    await this.clickJS(this.inStockCheckbox);
    await this.waitForStable();
  }

  async hasResults(): Promise<boolean> {
    try {
      await this.firstProductLink.first().waitFor({ state: 'attached', timeout: 5000 });
      return true;
    } catch {
      return false;
    }
  }

  async verifyResults() {
    await this.expectVisible(this.firstProductLink.first());
  }

  async addFirstToCart() {
    await this.hover(this.firstProductLink.first());
    await this.click(this.firstAddToCartBtn.first());
    await this.waitForStable();
  }
}
