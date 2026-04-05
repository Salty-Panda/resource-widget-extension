---
applyTo: "**/*Test.java"
---
# Copilot Integration Testing Best Practices

This document summarizes best practices for writing integration tests in this repository. Follow these guidelines to ensure consistency, maintainability, and reliability.

## Structure and Organization

- Place integration tests in `/ccb-accounts-standalone/src/test`.
- Separate configuration classes from test classes at the package level.
- Store test resources (e.g., `application-test.yml`, `logback-test.xml`, SQL scripts) in `/ccb-accounts-standalone/src/test/resources`.
- Organize SQL scripts by schema and data, using uppercase and underscores in filenames.

## Configuration

- Use meta-annotations to group test configuration annotations (e.g., `@AccountsIntegrationTest`).
- Avoid using base test classes for configuration.
- Use H2 as the default in-memory database for integration tests.
- SQL scripts must be idempotent (safe to run multiple times).
- For modules with Oracle-specific queries, provide H2-compatible alternatives and select by configuration.

## Mocking and Dependencies

- Mock external module communication at the handler level using dedicated mock configuration classes and fixtures.
- Implement mocks in the module providing the query/command and expose them via `ccb-accounts-api-mock`.
- Avoid using `@MockBean` in test classes; prefer Java-based mocks in configuration classes for performance and clarity.

## Elasticsearch

- Use Testcontainers for Elasticsearch integration tests.
- Activate Elasticsearch-related tests via a dedicated Spring profile (e.g., `TEST_ES_CONTAINER`).
- Only start Elasticsearch containers when the profile is active.

## Example: Meta-Annotation for Integration Tests

```java
@IntegrationTest
@Import(IntegrationTestConfiguration.class)
@Target(ElementType.TYPE)
@Retention(RetentionPolicy.RUNTIME)
@Sql(value = {"classpath:h2_init.sql"})
public @interface AccountsIntegrationTest {
}
```

## References

- See `integration-testing.guide.md` for detailed examples and rationale.
- Follow the Project Naming Guideline for all naming conventions and formatting.