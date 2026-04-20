import { BasePage } from './BasePage.js';

export class CheckoutPage extends BasePage {
  // SauceDemo Locators
  private get fName() { return this.page.locator("[data-test='firstName']"); }
  private get lName() { return this.page.locator("[data-test='lastName']"); }
  private get zip() { return this.page.locator("[data-test='postalCode']"); }
  private get continueBtn() { return this.page.locator("[data-test='continue']"); }
  private get finishBtn() { return this.page.locator("[data-test='finish']"); }
  private get successMsg() { return this.page.locator("[data-test='complete-header']"); }
  private get errorMsg() { return this.page.locator("[data-test='error']"); }

  // LambdaTest Locators
  private get ltCheckoutHeader() { return this.page.getByRole('heading', { name: 'Checkout' }); }

  // SauceDemo Methods
  async fillInfo(first: string, last: string, code: string) {
    await this.fill(this.fName, first);
    await this.fill(this.lName, last);
    await this.fill(this.zip, code);
  }

  async continue() {
    await this.click(this.continueBtn);
    await this.waitForStable();
  }

  async finish() {
    await this.click(this.finishBtn);
    await this.waitForStable();
  }

  async verifySuccess() {
    await this.expectVisible(this.successMsg);
  }

  async verifyError(msg: string) {
    await this.expectText(this.errorMsg, msg);
  }

  // LambdaTest Methods
  async verifyLambdaTestCheckout() {
    await this.expectVisible(this.ltCheckoutHeader);
  }
}
