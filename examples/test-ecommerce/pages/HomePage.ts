import { BasePage } from './BasePage.js';

export class HomePage extends BasePage {
    private searchInput = 'input[name="search"]';
    private searchButton = 'button:has-text("Search"), button.type-search';

    async navigate() {
        await super.navigate('https://ecommerce-playground.lambdatest.io/');
    }

    async searchFor(item: string) {
        await this.page.fill(this.searchInput, item);
        await this.page.click(this.searchButton);
        await this.page.waitForLoadState('load');
    }
}
