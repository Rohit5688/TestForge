import { BasePage } from './BasePage.js';

export class ProductDetailPage extends BasePage {
  private get addToCartBtn() { return this.page.locator("[data-test='add-to-cart']"); }
  private get backBtn() { return this.page.locator("[data-test='back-to-products']"); }
  private get nameHeader() { return this.page.locator("[data-test='inventory-item-name']"); }

  async isInStock(): Promise<boolean> {
    const name = await this.nameHeader.innerText();
    // Simulate Onesie being out of stock for the mission fallback
    return !name.includes("Onesie");
  }

  async addToCart() {
    await this.click(this.addToCartBtn);
  }

  async goBack() {
    await this.click(this.backBtn);
    await this.waitForStable();
  }
}
