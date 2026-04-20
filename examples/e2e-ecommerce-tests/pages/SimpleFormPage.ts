import { BasePage } from "./BasePage.js";

export class SimpleFormPage extends BasePage {
  private get inputField() { return this.page.locator('p:has-text("Enter Message") + input'); } // Valid standard CSS sibling matching
  private get showMessageBtn() { return this.page.locator('button', { hasText: 'Get Checked Value' }); }
  private get displayMessage() { return this.page.locator("#message"); }

  async navigate() {
    await this.goto(process.env.LAMBDATEST_URL + 'simple-form-demo');
    await this.waitForStable(this.showMessageBtn);
  }

  async enterMessage(message: string) {
    await this.fill(this.inputField, message);
  }

  async clickShowMessage() {
    await this.clickJS(this.showMessageBtn);
  }

  async verifyDisplayedMessage(expectedMessage: string) {
    await this.expectText(this.displayMessage, expectedMessage);
  }
}
