import { createBdd } from 'playwright-bdd';
import { test } from '../test-setup/page-setup.js';
import { LoginPage } from '../pages/LoginPage.js';
import { InventoryPage } from '../pages/InventoryPage.js';
import { CartPage } from '../pages/CartPage.js';
import { setPage } from 'vasu-playwright-utils/page-utils';

const { Given, When, Then } = createBdd(test);

const loginPage = new LoginPage();
const inventoryPage = new InventoryPage();
const cartPage = new CartPage();

Given("I am on the SauceDemo login page", async ({ page }) => {
  setPage(page);
  await loginPage.open();
});

When("I log in as a standard user", async ({ }) => {
  await loginPage.login('standard_user', 'secret_sauce');
});

When("I login with username {string} and password {string}", async ({ }, username: string, password: string) => {
  await loginPage.login(username, password);
});

Then("I should see the inventory page", async ({ }) => {
  await inventoryPage.verifyLoaded();
});

Then("I should see a login error message", async ({ }) => {
  await loginPage.verifyErrorVisible();
});

When("I add {string} to the cart", async ({ }, productName: string) => {
  await inventoryPage.addItemToCart();
});

When("I open the shopping cart", async ({ }) => {
  await inventoryPage.gotoCart();
});

Then("I should see the product {string} in the cart", async ({ }, productName: string) => {
  await cartPage.verifyProduct(productName);
});

When("I proceed to checkout", async ({ }) => {
  await cartPage.checkout();
});

Then("I should be on the checkout page", async ({ }) => {
  await cartPage.verifyOnCheckoutPage();
});
