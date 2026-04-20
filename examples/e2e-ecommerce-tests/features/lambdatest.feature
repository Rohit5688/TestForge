@lambdatest
Feature: LambdaTest Selenium Playground Interactions

  Background:
    Given I am on the LambdaTest Playground

  Scenario: Interact with Simple Form Demo
    When I navigate to the "Simple Form Demo" page
    And I enter the message "Hello TestForge"
    And I click the show message button
    Then I should see "Hello TestForge" displayed in the message section

  Scenario: Handle Javascript Alerts
    When I navigate to the "Javascript Alert Box Demo" page
    And I click the JS Alert button
    And I click the Confirm Box button and "accept" it
    Then I should see "You pressed OK!" in the confirm result
    When I click the Confirm Box button and "dismiss" it
    Then I should see "You pressed Cancel!" in the confirm result

  Scenario: Handle Prompt Box
    When I navigate to the "Javascript Alert Box Demo" page
    And I click the Prompt Box button and enter "TestForge Agent"
    Then I should see "You have entered 'TestForge Agent' !" in the prompt result
