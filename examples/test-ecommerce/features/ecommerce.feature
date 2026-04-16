Feature: eCommerce Navigation Flow

  Scenario: eCommerce Full Journey with Resilient Selection
    Given I am on the eCommerce home page
    When I search for "HTC"
    And I select the first available product from the search results
    And I add the product to the cart
    And I navigate to the shopping cart page
    Then the cart should contain the selected product
    When I proceed to the checkout page
    Then I should be on the checkout page
