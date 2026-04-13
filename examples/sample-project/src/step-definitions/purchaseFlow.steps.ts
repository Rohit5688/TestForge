import { createBdd } from 'playwright-bdd';
import { EcommerceHomePage } from '../pages/EcommerceHomePage.js';
import { EcommerceCategoryPage } from '../pages/EcommerceCategoryPage.js';
import { EcommerceProductPage } from '../pages/EcommerceProductPage.js';
import { EcommerceCartPage } from '../pages/EcommerceCartPage.js';
import { EcommerceCheckoutPage } from '../pages/EcommerceCheckoutPage.js';

const { Given, When, Then } = createBdd();

Given('I am on the LambdaTest eCommerce home page', async ({ page }) => {
  const homePage = new EcommerceHomePage(page);
  await homePage.navigate();
});

When('I search for product {string}', async ({ page }, searchText) => {
  const homePage = new EcommerceHomePage(page);
  await homePage.searchFor(searchText);
});

When('I select the {string} product from the search results', async ({ page }, productName) => {
  const categoryPage = new EcommerceCategoryPage(page);
  await categoryPage.selectProduct(productName);
});

When('I add the product to the cart', async ({ page }) => {
  const productPage = new EcommerceProductPage(page);
  await productPage.addToCart();
});

When('I view the shopping cart', async ({ page }) => {
  const productPage = new EcommerceProductPage(page);
  await productPage.viewCart();
});

Then('I should be able to proceed to the checkout page', async ({ page }) => {
  const cartPage = new EcommerceCartPage(page);
  await cartPage.proceedToCheckout();
  const checkoutPage = new EcommerceCheckoutPage(page);
  await checkoutPage.verifyOnCheckoutPage();
});
