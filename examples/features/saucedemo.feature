Feature: SauceDemo Smoke Tests

  Background:
    Given I am on the SauceDemo login page

  @smoke
  Scenario: Successful login with valid credentials
    When I log in as a standard user
    Then I should see the inventory page

  @smoke
  Scenario: Failed login with invalid credentials
    When I login with username "standard_user" and password "wrong_password"
    Then I should see a login error message

  @smoke
  Scenario: Add item to cart and proceed to checkout
    When I log in as a standard user
    And I add "Sauce Labs Backpack" to the cart
    And I open the shopping cart
    Then I should see the product "Sauce Labs Backpack" in the cart
    When I proceed to checkout
    Then I should be on the checkout page
