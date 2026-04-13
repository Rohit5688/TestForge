@smoke
Feature: Sample Playwright BDD Test

  Scenario: Verify page loads
    Given I navigate to the home page
    Then the page title should be visible