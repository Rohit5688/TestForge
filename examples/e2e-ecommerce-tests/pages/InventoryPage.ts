import { BasePage } from './BasePage.js';

export class InventoryPage extends BasePage {
  private get cartIcon() { return this.page.locator("[data-test='shopping-cart-link']"); }

  async selectProduct(name: string) {
    const link = this.page.locator("[data-test='inventory-item-name']").filter({ hasText: name });
    await this.click(link);
    await this.waitForStable();
  }

  async gotoCart() {
    await this.click(this.cartIcon);
    await this.waitForStable();
  }
}
