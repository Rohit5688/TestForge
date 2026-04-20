import { createBdd } from 'playwright-bdd';
import { test } from '../test-setup/page-setup.js';
import { app } from '@pages';

const { Given, When, Then } = createBdd(test);

// Background
Given('I am on the LambdaTest Playground', async ({}) => {
  // Base URL is handled in navigation steps
});

// Simple Form Demo Steps
When('I navigate to the {string} page', async ({}, pageName: string) => {
  if (pageName === 'Simple Form Demo') {
    await app.simpleForm.navigate();
  } else if (pageName === 'Javascript Alert Box Demo') {
    await app.alert.navigate();
  }
});

When('I enter the message {string}', async ({}, message: string) => {
  await app.simpleForm.enterMessage(message);
});

When('I click the show message button', async ({}) => {
  await app.simpleForm.clickShowMessage();
});

Then('I should see {string} displayed in the message section', async ({}, expectedMessageString: string) => {
  await app.simpleForm.verifyDisplayedMessage(expectedMessageString);
});

// Alert Demo Steps
When('I click the JS Alert button', async ({}) => {
  await app.alert.triggerJSAlert();
});

When('I click the Confirm Box button and {string} it', async ({}, action: string) => {
  await app.alert.triggerConfirmBox(action === 'accept');
});

Then('I should see {string} in the confirm result', async ({}, expectedText: string) => {
  await app.alert.verifyConfirmResult(expectedText);
});

When('I click the Prompt Box button and enter {string}', async ({}, text: string) => {
  await app.alert.triggerPromptBox(text);
});

Then('I should see {string} in the prompt result', async ({}, expectedText: string) => {
  await app.alert.verifyPromptResult(expectedText);
});
