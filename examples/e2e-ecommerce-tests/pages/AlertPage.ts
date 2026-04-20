import { BasePage } from "./BasePage.js";

export class AlertPage extends BasePage {
  private get jsAlertBtn() { return this.page.locator('p', { hasText: "JavaScript Alerts" }).locator('button'); }
  private get confirmBoxBtn() { return this.page.locator('p', { hasText: "Confirm box:" }).locator('button'); }
  private get promptBoxBtn() { return this.page.locator('p', { hasText: "Prompt box:" }).locator('button'); }
  private get confirmResult() { return this.page.locator('p:has-text("Confirm box:") + p'); }
  private get promptResult() { return this.page.locator('p:has-text("Prompt box:") + p'); }

  async navigate() {
    await this.goto(process.env.LAMBDATEST_URL + 'javascript-alert-box-demo');
    await this.waitForStable();
  }

  async triggerJSAlert() {
    return await this.handleAlert(this.jsAlertBtn, true);
  }

  async triggerConfirmBox(accept: boolean) {
    return await this.handleAlert(this.confirmBoxBtn, accept);
  }

  async triggerPromptBox(text: string) {
    return await this.handleAlert(this.promptBoxBtn, true, text);
  }

  async verifyConfirmResult(expectedText: string) {
    await this.expectText(this.confirmResult, expectedText);
  }

  async verifyPromptResult(expectedText: string) {
    await this.expectText(this.promptResult, expectedText);
  }
}
