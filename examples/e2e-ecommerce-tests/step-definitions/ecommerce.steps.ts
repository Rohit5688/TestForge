import { createBdd } from 'playwright-bdd';
import { test } from '../test-setup/page-setup.js';
import { app } from '@pages';

const { Given, When, Then } = createBdd(test);

let isAvailable = true;

Given('I am on the SauceDemo login page', async ({}) => {
  await app.login.open();
});

Given('I log in as a standard user', async ({}) => {
  await app.login.login(process.env.STANDARD_USER || 'standard_user', process.env.STANDARD_PASSWORD || 'secret_sauce');
});

When('I select the product {string}', async ({}, name: string) => {
  await app.inventory.selectProduct(name);
});

When('I verify it is in stock and add it to the cart', async ({}) => {
  if (await app.pdp.isInStock()) {
    await app.pdp.addToCart();
  }
});

When('I go to the shopping cart', async ({}) => {
  await app.inventory.gotoCart();
});

Then('I should see the product {string} in the cart', async ({}, name: string) => {
  await app.cart.verifyProduct(name);
});

When('I proceed to checkout', async ({}) => {
  await app.cart.checkout();
});

When('I fill checkout information with {string}, {string}, {string}', async ({}, f: string, l: string, z: string) => {
  await app.checkout.fillInfo(f, l, z);
  await app.checkout.continue();
});

When('I finish the checkout', async ({}) => {
  await app.checkout.finish();
});

Then('I should see a success message', async ({}) => {
  await app.checkout.verifySuccess();
});

When('I check the product availability', async ({}) => {
  isAvailable = await app.pdp.isInStock();
});

When('I fallback to the second product {string} if unavailable', async ({}, alt: string) => {
  if (!isAvailable) {
    await app.pdp.goBack();
    await app.inventory.selectProduct(alt);
    await app.pdp.addToCart();
  } else {
    await app.pdp.addToCart();
  }
});

When('I fill checkout information and finish successfully', async ({}) => {
  await app.cart.checkout();
  await app.checkout.fillInfo('Rohit', 'Kumar', '12345');
  await app.checkout.continue();
  await app.checkout.finish();
  await app.checkout.verifySuccess();
});

When('I add it to the cart and go to checkout', async ({}) => {
  await app.pdp.addToCart();
  await app.inventory.gotoCart();
  await app.cart.checkout();
});

When('I leave First Name empty and click continue', async ({}) => {
  await app.checkout.fillInfo('', 'Kumar', '12345');
  await app.checkout.continue();
});

Then('I should see a validation error {string}', async ({}, msg: string) => {
  await app.checkout.verifyError(msg);
});
