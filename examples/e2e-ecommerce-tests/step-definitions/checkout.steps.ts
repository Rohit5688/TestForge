import { createBdd } from 'playwright-bdd';
import { test } from '../test-setup/page-setup.js';
import { app } from '@pages';

const { Given, When, Then } = createBdd(test);

Given('I navigate to the LambdaTest home page', async ({}) => {
  await app.home.open();
});

When('I search for product {string}', async ({}, product: string) => {
  await app.home.search(product);
  await app.results.filterInStock();
  
  if (!(await app.results.hasResults())) {
    console.log(`[Flow] ${product} out of stock. Falling back to MacBook...`);
    await app.home.search('MacBook');
    await app.results.filterInStock();
  }
});

When('I filter the results by "In stock"', async ({}) => {
  await app.results.filterInStock();
});

Then('I should see some in-stock results', async ({}) => {
  await app.results.verifyResults();
});

When('I add the first available item to my cart', async ({}) => {
  await app.results.addFirstToCart();
});

When('I open the shopping cart', async ({}) => {
  await app.home.navigate('index.php?route=checkout/cart');
});

Then('I should see the item in the cart', async ({}) => {
  await app.cart.verifyLambdaTestCart();
});

When('I proceed to the final checkout', async ({}) => {
  await app.cart.goToLambdaTestCheckout();
});

Then('I should be on the checkout page', async ({}) => {
  await app.checkout.verifyLambdaTestCheckout();
});
