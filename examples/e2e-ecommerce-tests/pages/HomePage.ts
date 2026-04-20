import { BasePage } from './BasePage.js';

export class HomePage extends BasePage {
  private get searchBox() { return this.page.getByRole('textbox', { name: 'Search For Products' }).first(); }
  private get searchBtn() { return this.page.getByRole('button', { name: 'Search' }).first(); }

  async open() {
    await this.navigate(process.env.LAMBDATEST_ECOM_URL || 'https://ecommerce-playground.lambdatest.io/');
  }

  async search(product: string) {
    await this.fill(this.searchBox, product);
    await this.click(this.searchBtn);
    await this.waitForStable();
  }
}
