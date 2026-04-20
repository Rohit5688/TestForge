import 'dotenv/config';
import { BasePage } from './BasePage.js';

export class LoginPage extends BasePage {
  private get usernameInput() { return this.page.locator("[data-test='username']"); }
  private get passwordInput() { return this.page.locator("[data-test='password']"); }
  private get loginBtn() { return this.page.locator("[data-test='login-button']"); }

  async open() {
    await this.navigate(process.env.BASE_URL || 'https://www.saucedemo.com/');
  }

  async login(user: string, pass: string) {
    await this.fill(this.usernameInput, user);
    await this.fill(this.passwordInput, pass);
    await this.click(this.loginBtn);
    await this.waitForStable();
  }
}
