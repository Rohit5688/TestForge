import { createBdd } from 'playwright-bdd';
import { test } from '../fixtures/index.js';

const { Given, When, Then } = createBdd(test);

let selectedProductName = '';

Given('I am on the eCommerce home page', async ({ homePage }) => {
    await homePage.navigate();
});

When('I search for {string}', async ({ homePage }, item: string) => {
    await homePage.searchFor(item);
});

When('I select the first available product from the search results', async ({ searchPage, page, productPage }) => {
    // High-Fidelity loop: mimicking a user who wants an in-stock item
    for (let i = 0; i < 3; i++) {
        selectedProductName = await searchPage.selectProductByIndex(i);
        
        // Diagnosis: check if in-stock
        if (await productPage.isInStock()) {
            return;
        }
        
        // Reaction: go back to search results and wait for stabilization
        await page.goBack();
        await searchPage.waitForResultsStable();
    }
    throw new Error('No in-stock items found in the typical user browse range (first 3 results).');
});

When('I add the product to the cart', async ({ productPage }) => {
    await productPage.addToCart();
});

When('I navigate to the shopping cart page', async ({ productPage }) => {
    await productPage.goToCart();
});

Then('the cart should contain the selected product', async ({ cartPage }) => {
    await cartPage.verifyProductInCart(selectedProductName);
});

When('I proceed to the checkout page', async ({ cartPage }) => {
    await cartPage.proceedToCheckout();
});

Then('I should be on the checkout page', async ({ checkoutPage }) => {
    await checkoutPage.verifyOnCheckoutPage();
});
