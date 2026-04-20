import { BasePage } from './BasePage.js';

export class CartPage extends BasePage {
  // SauceDemo Locators
  private get sdCheckoutBtn() { return this.page.locator("[data-test='checkout']"); }
  private get sdItemName() { return this.page.locator("[data-test='inventory-item-name']"); }
  
  // LambdaTest Locators
  private get ltCheckoutBtn() { return this.page.getByRole('link', { name: 'Checkout' }); }

  // SauceDemo Methods
  async verifyProduct(name: string) {
    await this.expectText(this.sdItemName, name);
  }

  async checkout() {
    await this.click(this.sdCheckoutBtn);
    await this.waitForStable();
  }

  // LambdaTest Methods
  async verifyLambdaTestCart() {
    await this.expectVisible(this.ltCheckoutBtn);
  }

  async goToLambdaTestCheckout() {
    await this.click(this.ltCheckoutBtn);
    await this.waitForStable();
  }
}
