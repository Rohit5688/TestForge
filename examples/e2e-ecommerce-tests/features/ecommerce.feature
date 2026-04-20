@saucedemo @ecommerce
Feature: SauceDemo E2E Flow

  Background:
    Given I am on the SauceDemo login page
    And I log in as a standard user

  Scenario: Happy Path Checkout
    When I select the product "Sauce Labs Backpack"
    And I verify it is in stock and add it to the cart
    And I go to the shopping cart
    Then I should see the product "Sauce Labs Backpack" in the cart
    When I proceed to checkout
    And I fill checkout information with "Rohit", "Kumar", "123456"
    And I finish the checkout
    Then I should see a success message

  Scenario: Dynamic Fallback Out of Stock
    When I select the product "Sauce Labs Onesie"
    And I check the product availability
    And I fallback to the second product "Sauce Labs Bike Light" if unavailable
    And I go to the shopping cart
    Then I should see the product "Sauce Labs Bike Light" in the cart
    When I fill checkout information and finish successfully

  Scenario: Negative Checkout
    When I select the product "Sauce Labs Backpack"
    And I add it to the cart and go to checkout
    And I leave First Name empty and click continue
    Then I should see a validation error "Error: First Name is required"
