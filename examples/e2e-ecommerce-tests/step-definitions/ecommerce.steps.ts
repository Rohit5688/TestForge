import { expect } from '@playwright/test';
import { Given, When, Then } from '../fixtures/fixtures.js';

Given('I am on the home page', async ({ homePage }) => {
  await homePage.goto();
});

When('I search for {string}', async ({ homePage }, productName: string) => {
  await homePage.searchForProduct(productName);
});

When('I select the product {string}', async ({ searchPage }, productName: string) => {
  await searchPage.selectProduct(productName);
});

When('I add the product to the cart', async ({ productPage }) => {
  await productPage.addToCart();
});

When('I proceed to checkout from the cart', async ({ cartPage }) => {
  await cartPage.proceedToCheckout();
});

When('I complete the guest checkout with details:', async ({ checkoutPage }, dataTable) => {
  const details = dataTable.hashes()[0];
  await checkoutPage.fillGuestDetails(details);
  await checkoutPage.confirmOrder();
});

Then('I should see the order confirmation', async ({ checkoutPage }) => {
  // Logic to verify order confirmation (e.g., success message or URL)
  await expect(checkoutPage.page).toHaveURL(/checkout\/success/);
});

// Dynamic Fallback Steps
When('the product is {string}', async ({ productPage }, status: string) => {
  if (status === 'Out of Stock') {
    const isOutOfStock = await productPage.isOutOfStock();
    expect(isOutOfStock).toBeTruthy();
  }
});

Then('I should go back and pick the next in-stock product', async ({ searchPage, productPage }) => {
  await productPage.page.goBack();
  await searchPage.selectFirstAvailableProduct();
});

Then('I should be able to add it to the cart', async ({ productPage }) => {
  await productPage.addToCart();
});

// Negative Checkout Steps
When('I attempt to continue without filling details', async ({ checkoutPage }) => {
  await checkoutPage.attemptCheckoutWithoutDetails();
});

Then('I should see validation errors for required fields', async ({ checkoutPage }) => {
  await checkoutPage.verifyValidationErrors();
});
