import 'dotenv/config';
import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from './BasePage';

export class CheckoutPage extends BasePage {
  readonly guestCheckoutRadio: Locator;
  readonly continueBtn: Locator;
  readonly firstNameInput: Locator;
  readonly lastNameInput: Locator;
  readonly emailInput: Locator;
  readonly telephoneInput: Locator;
  readonly address1Input: Locator;
  readonly cityInput: Locator;
  readonly postcodeInput: Locator;
  readonly countrySelect: Locator;
  readonly zoneSelect: Locator;
  readonly agreeLabel: Locator;
  readonly confirmBtn: Locator;

  constructor(page: Page) {
    super(page);
    this.guestCheckoutRadio = page.getByLabel("Guest Checkout");
    this.continueBtn = page.getByRole("button", { name: "Continue" });
    this.firstNameInput = page.getByLabel("First Name");
    this.lastNameInput = page.getByLabel("Last Name");
    this.emailInput = page.getByLabel("E-Mail");
    this.telephoneInput = page.getByLabel("Telephone");
    this.address1Input = page.getByLabel("Address 1");
    this.cityInput = page.getByLabel("City");
    this.postcodeInput = page.getByLabel("Post Code");
    this.countrySelect = page.getByLabel("Country");
    this.zoneSelect = page.getByLabel("Region / State");
    this.agreeLabel = page.getByText("I have read and agree to the Terms & Conditions");
    this.confirmBtn = page.getByRole("button", { name: "Confirm Order" });
  }

  async selectGuestCheckout() {
    await this.guestCheckoutRadio.check();
    await this.click(this.continueBtn);
  }

  async fillPersonalDetails(details: any) {
    await this.fill(this.firstNameInput, details.firstName);
    await this.fill(this.lastNameInput, details.lastName);
    await this.fill(this.emailInput, details.email);
    await this.fill(this.telephoneInput, details.telephone);
    await this.click(this.continueBtn);
  }

  async fillAddress(address: any) {
    await this.fill(this.address1Input, address.address1);
    await this.fill(this.cityInput, address.city);
    await this.fill(this.postcodeInput, address.postcode);
    await this.selectOption(this.countrySelect, address.country);
    await this.selectOption(this.zoneSelect, address.zone);
    await this.click(this.continueBtn);
  }

  async completeShippingAndPayment() {
    await this.click(this.continueBtn);
    await this.page.getByLabel("I have read and agree to the Terms & Conditions").check();
    await this.click(this.continueBtn);
  }

  async confirmOrder() {
    await this.click(this.confirmBtn);
    await this.waitForStable();
  }

  async verifyConfirmation() {
      await expect(this.page.getByRole("heading", { name: "Your order has been placed!" })).toBeVisible();
  }

  async verifyValidationErrors() {
      await expect(this.page.getByText(/must be|required|warning/i).first()).toBeVisible();
  }
}
