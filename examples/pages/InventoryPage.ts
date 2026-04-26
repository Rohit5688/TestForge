import 'dotenv/config';
import { expect } from '@playwright/test';
import { BasePage } from './BasePage.js';
import { getLocator, getLocatorByRole } from 'vasu-playwright-utils';

export class InventoryPage extends BasePage {
  get inventoryList() { return getLocator('.inventory_list'); }
  get cartIcon() { return getLocator('.shopping_cart_link'); }
  get addToCartBtn() { return getLocatorByRole('button', { name: 'Add to cart' }).first(); }

  async verifyLoaded() {
    await expect(this.inventoryList).toBeVisible();
  }

  async addItemToCart() {
    await this.click(this.addToCartBtn);
    await this.waitForStable();
  }

  async gotoCart() {
    await this.click(this.cartIcon);
    await this.waitForStable();
  }

}