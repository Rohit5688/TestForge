import 'dotenv/config';
import { Page, Locator } from '@playwright/test';
import { BasePage } from './BasePage';

export class HomePage extends BasePage {
  readonly searchInput: Locator;
  readonly searchBtn: Locator;

  constructor(page: Page) {
    super(page);
    this.searchInput = page.getByPlaceholder("Search For Products");
    this.searchBtn = page.getByRole("button", { name: "Search" });
  }

  async navigateHome() {
    await this.navigate(process.env.BASE_URL || "https://ecommerce-playground.lambdatest.io/");
  }

  async searchProduct(term: string) {
    await this.fill(this.searchInput, term);
    await this.click(this.searchBtn);
    await this.waitForStable();
  }
}
