import 'dotenv/config';
import { expect } from '@playwright/test';
import { BasePage } from './BasePage.js';
import { getLocatorByPlaceholder, getLocator } from 'vasu-playwright-utils';

export class LoginPage extends BasePage {
  get usernameInput() { return getLocatorByPlaceholder('Username'); }
  get passwordInput() { return getLocatorByPlaceholder('Password'); }
  get loginBtn() { return getLocator('[data-test="login-button"]'); }
  get errorMessage() { return getLocator('[data-test="error"]'); }

  async open() {
    await this.goto('/');
    await this.waitForStable();
  }

  async login(username: string, password: string) {
    await this.fill(this.usernameInput, username);
    await this.fill(this.passwordInput, password);
    await this.click(this.loginBtn);
    await this.waitForStable();
  }

  async verifyErrorVisible() {
    await expect(this.errorMessage).toBeVisible();
  }

}