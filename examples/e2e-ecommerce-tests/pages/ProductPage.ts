import 'dotenv/config';
import { Page, Locator } from '@playwright/test';
import { BasePage } from './BasePage';

export class ProductPage extends BasePage {
  readonly addToCartBtn: Locator;
  readonly stockStatusHeading: Locator;

  constructor(page: Page) {
    super(page);
    this.addToCartBtn = page.getByRole("button", { name: "Add to Cart" });
    this.stockStatusHeading = page.getByRole("heading").filter({ hasText: /in stock|out of stock/i });
  }

  async addToCart() {
    await this.click(this.addToCartBtn);
    await this.waitForStable();
  }

  async isOutOfStock(): Promise<boolean> {
    if (await this.stockStatusHeading.isVisible()) {
        const text = await this.stockStatusHeading.innerText();
        return text.toLowerCase().includes("out of stock");
    }
    return false;
  }
}
