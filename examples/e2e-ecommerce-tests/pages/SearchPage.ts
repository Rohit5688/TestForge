import 'dotenv/config';
import { Page, Locator } from '@playwright/test';
import { BasePage } from './BasePage';

export class SearchPage extends BasePage {
  readonly productItems: Locator;

  constructor(page: Page) {
    super(page);
    this.productItems = page.locator('div').filter({ has: page.getByRole("button", { name: "" }) });
  }

  async selectProduct(name: string) {
    const productLink = this.page.getByRole("link", { name, exact: true }).first();
    await this.click(productLink);
    await this.waitForStable();
  }

  async isProductInStock(name: string): Promise<boolean> {
    const product = this.productItems.filter({ has: this.page.getByRole("link", { name, exact: true }) });
    const outOfStockMarker = product.getByText("Out of Stock");
    return !(await outOfStockMarker.isVisible());
  }

  async selectNextAvailableProduct() {
      const count = await this.productItems.count();
      for (let i = 0; i < count; i++) {
          const item = this.productItems.nth(i);
          const outOfStockMarker = item.getByText("Out of Stock");
          if (!(await outOfStockMarker.isVisible())) {
              await this.click(item.getByRole("link").first());
              await this.waitForStable();
              return;
          }
      }
      throw new Error("No available in-stock products found.");
  }
}
