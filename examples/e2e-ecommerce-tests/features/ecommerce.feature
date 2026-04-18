Feature: E-Commerce Navigation & Checkout
  As a customer
  I want to be able to search for products and complete a guest checkout
  So that I can purchase items efficiently even if some are out of stock

  Background:
    Given I am on the home page

  @ecommerce @lambdatest @smoke
  Scenario: Search and Purchase In-Stock Product
    When I search for "iMac"
    And I select the product "iMac"
    And I add the product to the cart
    And I proceed to checkout from the cart
    And I complete the guest checkout with details:
      | firstName | lastName | email            | telephone  | address1     | city   | postcode | country        | zone      |
      | John      | Doe      | john@example.com | 1234567890 | 123 Test St | London | E1 6AN   | United Kingdom | Middlesex |
    Then I should see the order confirmation

  @ecommerce @lambdatest @dynamic
  Scenario: Dynamic Fallback for Out-of-Stock Product
    When I search for "Palm Treo Pro"
    And I select the product "Palm Treo Pro"
    But the product is "Out of Stock"
    Then I should go back and pick the next in-stock product
    And I should be able to add it to the cart

  @ecommerce @lambdatest @negative
  Scenario: Negative Checkout - Missing Information
    When I search for "iMac"
    And I add the product to the cart
    And I proceed to checkout from the cart
    And I attempt to continue without filling details
    Then I should see validation errors for required fields
