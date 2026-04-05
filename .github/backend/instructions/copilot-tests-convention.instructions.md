---
applyTo: "**/*Test.java"
---
# Copilot Instructions: General Test Writing Guidelines

This document defines general conventions for writing both unit and integration tests in this repository. Follow these guidelines in addition to any test-type-specific instructions.

## Libraries

- Use JUnit 5 (`org.junit.jupiter.api`) for all unit and integration tests.
- Use AssertJ (`org.assertj.core`) for assertions.
- Do not use TestNG for any tests.

## Structure

- Each test must verify a single business requirement.
- Use the given-when-then pattern in test methods:
  - **given:** Set up all necessary context and data.
  - **when:** Execute the action under test.
  - **then:** Assert the expected outcome.
- Separate given/when/then sections with blank lines or comments for clarity.
- There should be only one `given`, `when`, and `then` section per test method.
- Don't write additional comments explaining what the code does; the code should be self-explanatory.
- For .given() .when() .then() sections from libraries like RestAssured or Mockito, place emptylines after each section for better readability.
- Sections .given() .when() .then() from libraries like RestAssured or Mockito should not replace the given-when-then pattern in test methods. Even when using RestAssured, you must still clearly separate the logical test sections with comments or blank lines. The only exception is when the entire test consists of a single RestAssured call with assertions in the .then() section.

**Example of proper structure with RestAssured:**
```java
@Test
    void returnsAllAccountDataWithTypeCode() throws JsonProcessingException {
        // given
        var request = IbAggregatedContextInitRequest.of(Language.ENGLISH, 0);

        // when
        var result = RestAssuredMockMvc
            .given()
            .body(request)

            .when()
            .post("/frontend/ib/accounts/IbAggregatedContextInitRequest")

            .then()
            .statusCode(200)
            .extract()
            .as(AggregationResponseItem[].class);

        // then
        var initResponse = convertToInitResponse(result);

        assertEquals(0, initResponse.getPortfolio().getDeposits().size());
        assertEquals(4, initResponse.getPortfolio().getAccounts().size());
    }
}
```

## Naming

- Test method names must clearly state the expected result and the conditions (e.g., `activityCreatedSuccessfully`, `activityMarkedAsOnHold`, `activityStatusChangesToCompleted`, `orderActivityApprovedEventIsEmittedWithClientMessage`, `informationAboutApprovingActionIsStoredInActivityHistory`).
- **Do not start test method names with "should".**
- Test class names should reflect the business process or entity under test (e.g., `ApproveActivityTest`).
- Name test classes after the tested command/query with a `Test` suffix for integration tests (e.g., `ChangeAccountAliasCommandTest`).
- Use PascalCase for test class names and camelCase for test method names, following the [Project Naming Guideline](project-naming-guideline.instructions).
- Use `@DisplayName` annotation to provide a brief, human-readable description of what the test verifies (e.g., `@DisplayName("Activity is created successfully when all required data is provided")`).

## Formatting

- Use 4 spaces for indentation and limit lines to 140 characters.
- Use blank lines after package declaration, between import groups, before each field and method declaration, and between logical sections in methods.
- Use one statement per line.

## Visibility

- JUnit 5 test classes and test methods should have default (package-private) visibility.

## RestAssured Assertions

- **Prefer using `.body()` method on RestAssuredMockMvc service result for assertions when possible.**
- If the check using `.body()` is complicated and less readable, extract the object using `.extract()` and perform assertions using JUnit static methods like `assertEquals`, `assertTrue`, etc.
- When extracting objects, use descriptive variable names that clearly indicate what the object represents.

**Example of preferred .body() assertions:**
```java
@Test
@DisplayName("Returns account IDs mapped by bank IDs when valid bank IDs are provided")
void returnsAccountIdsMappedByBankIds() {
    // given
    var bankIds = Set.of(FIRST_BANK_ID, SECOND_BANK_ID, NON_EXISTENT_BANK_ID);

    // when & then
    RestAssuredMockMvc
            .given()
            .body(AccountsIdsByBankIdsQuery.of(bankIds))

            .when()
            .post("/accounts/AccountsIdsByBankIdsQuery")

            .then()
            .statusCode(200)
            .body(FIRST_BANK_ID, equalTo(FIRST_ACCOUNT_ID))
            .body(SECOND_BANK_ID, equalTo(SECOND_ACCOUNT_ID))
            .body("size()", equalTo(2));
}
```

**Example when extraction is needed for complex assertions:**
```java
@Test
@DisplayName("Brokerage accounts are filtered by account status and trusteeId successfully")
void searchBrokerageAccountsFiltersAccountsByStatusAndTrusteeId() {
    // given
    var customerId = "19853764";
    var trusteeId = "19853765";
    var request = BrokerageSearchRequest.builder()
            .customerId(customerId)
            .trusteeId(trusteeId)
            .accountStatusList(List.of(BrokerageSearchRequest.AccountStatusListEnum.A))
            .contextFlag(0)
            .build();

    // when & then
    RestAssuredMockMvc
            .given()
            .headers(TestFixture.getRequiredAdapHeaders())
            .body(request)

            .when()
            .post("/ablaccounts/brokerage/search")

            .then()
            .status(HttpStatus.OK)
            .body("accountList.ownerCustomerId", everyItem(equalTo(customerId)))
            .body("accountList.accountStatus", everyItem(equalTo("A")))
            .body("accountList.attorneyList.coownerId.flatten()", everyItem(equalTo(trusteeId)));
}
```

## Test Data Management

- **Extract test values to local or class variables with proper descriptive names.**
- Use class-level constants for values that can be reused across multiple tests.
- Use local variables for test-specific data.
- Variable names should clearly indicate what the value represents in the business context.

**Example of proper test data extraction:**
```java
@AccountsIntegrationTest
class AccountsIdsByBankIdsQueryTest {

    private static final String FIRST_BANK_ID = "0147644020415653";
    private static final String SECOND_BANK_ID = "0147644610721618";
    private static final String NON_EXISTENT_BANK_ID = "0";
    private static final String FIRST_ACCOUNT_ID = "45";
    private static final String SECOND_ACCOUNT_ID = "46";

    @Test
    @DisplayName("Returns account IDs mapped by bank IDs when valid bank IDs are provided")
    void returnsAccountIdsMappedByBankIds() {
        // given
        var bankIds = Set.of(FIRST_BANK_ID, SECOND_BANK_ID, NON_EXISTENT_BANK_ID);

        // when & then
        RestAssuredMockMvc
                .given()
                .body(AccountsIdsByBankIdsQuery.of(bankIds))

                .when()
                .post("/accounts/AccountsIdsByBankIdsQuery")

                .then()
                .statusCode(200)
                .body(FIRST_BANK_ID, equalTo(FIRST_ACCOUNT_ID))
                .body(SECOND_BANK_ID, equalTo(SECOND_ACCOUNT_ID))
                .body("size()", equalTo(2));
    }
}
```

## Generic Assertions and Test Data

- **If a test (or test class) does not prepare data for tests, do result size checks only if the request object defines specific identifiers from the database.**
- **Assertions should be more generic in case the test data in JSON/SQL files change (mostly by addition of new test data).**
- Avoid hard-coding expected counts unless the test specifically creates or filters by known identifiers.
- When testing with existing test data, focus on verifying the correctness of the returned data rather than exact counts.

**Example of generic assertions:**
```java
@Test
@DisplayName("Returns customer accounts when company ID is valid")
void returnsCustomerAccountsWhenCompanyIdIsValid() {
    // given
    var companyId = TestFixture.COMPANY_ID;

    // when & then
    RestAssuredMockMvc
            .given()
            .body(CustomerAccountsQuery.of(companyId, null, true))

            .when()
            .post("/accounts/CustomerAccountsQuery")

            .then()
            .statusCode(200)
            .body("size()", greaterThan(0))  // Generic assertion - don't assume exact count
            .body("[0].id", notNullValue())
            .body("[0].companyId", equalTo(companyId));
}
```

**Example when specific identifiers are used:**
```java
@Test
@DisplayName("Returns account when specific bank ID exists")
void returnsAccountWhenSpecificBankIdExists() {
    // given
    var specificBankId = TestFixture.BANK_ACCOUNT_ID;  // Known identifier from test data

    // when & then
    RestAssuredMockMvc
            .given()
            .body(AccountByAccountBankIdQuery.of(specificBankId))

            .when()
            .post("/accounts/AccountByAccountBankIdQuery")

            .then()
            .statusCode(200)
            .body("id", equalTo(TestFixture.ACCOUNT_ID))  // Can assert exact values for known data
            .body("number", equalTo(TestFixture.ACCOUNT_NUMBER))
            .body("customerBankId", equalTo(TestFixture.CUSTOMER_BANK_ID));
}
```

## General Practices

- Write all code, comments, and documentation in English.
- Do not commit commented-out code.
- Avoid magic numbers; use named constants.
- Keep tests isolated and repeatable.
- Ensure tests run both locally and in CI environments.
- Avoid tabs and trailing spaces.

## Mockito Resource Management

- When using `MockitoAnnotations.openMocks(this)` in test setup (`@BeforeEach`), assign the result to a `Closeable` field.
- Always close the `Closeable` in an `@AfterEach` method to release Mockito resources and avoid memory leaks.

**Example:**
```java
private Closeable closeable;

@BeforeEach
void setUp() {
    closeable = MockitoAnnotations.openMocks(this);
    // additional setup
}

@AfterEach
void tearDown() throws Exception {
    closeable.close();
}
```

## References

- Follow the [Project Naming Guideline](project-naming-guideline.instructions) for all naming conventions and formatting.