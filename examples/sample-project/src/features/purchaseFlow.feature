Feature: eCommerce Purchase Flow

  @e2e @smoke
  Scenario: Successful 5-page purchase search journey
    Given I am on the LambdaTest eCommerce home page
    When I search for product "HP LP3065"
    And I select the "HP LP3065" product from the search results
    And I add the product to the cart
    And I view the shopping cart
    Then I should be able to proceed to the checkout page
