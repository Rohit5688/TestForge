@ecommerce
Feature: E-Commerce Checkout Flow

  Background:
    Given I navigate to the LambdaTest home page

  Scenario Outline: Search and add product to cart
    When I search for product <product>
    And I filter the results by "In stock"
    Then I should see some in-stock results
    When I add the first available item to my cart
    And I open the shopping cart
    Then I should see the item in the cart
    When I proceed to the final checkout
    Then I should be on the checkout page

    Examples:
      | product |
      | "iPhone" |
      | "MacBook" |
