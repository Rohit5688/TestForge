Feature: Add to Cart

  Background:
    Given I am on the SauceDemo login page
    And I log in as a standard user

  @saucedemo
  Scenario: Add Sauce Labs Backpack to cart
    When I select the product "Sauce Labs Backpack"
    And I verify it is in stock and add it to the cart
    And I go to the shopping cart
    Then I should see the product "Sauce Labs Backpack" in the cart
