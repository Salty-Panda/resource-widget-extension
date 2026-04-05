---
applyTo: "**/*Test.java"
---
# Copilot Instructions: Unit Testing Best Practices

See [copilot-tests-convention.instructions.md](copilot-tests-convention.instructions) for general test structure, naming conventions, and required libraries.

## Assertions

- Make assertions precise and meaningful; avoid vague checks.
- Use expressive assertion libraries (e.g., AssertJ).
- Prefer `assertThatThrownBy` or `catchThrowable` for exception testing.
- Avoid redundant assertions (e.g., do not check for non-null before accessing a property if the next assertion would fail anyway).
- Use one statement per line.
## Test Data

- Use meaningful, unique, and descriptive values for test data.
- Prefer edge values and parameterized tests for input validation.
- Avoid repeating test cases with generic or duplicate values.

## Isolation

- Tests must be independent and not rely on execution order.
- Avoid shared mutable state between tests.
- Isolate tests from external dependencies (e.g., time, filesystem, network) using fakes or in-memory implementations.

## Performance

- Keep unit tests fast; avoid `Thread.sleep` and minimize test data.
- All tests in a file should run in under one second.

## Readability

- Avoid logic (loops, conditionals, switches) in test methods.
- Remove unnecessary or superfluous tests.
- Refactor tests for clarity and maintainability as understanding improves.
- Use 4 spaces for indentation, no tabs, and avoid trailing spaces.

## Documentation

- Write all comments and documentation in English.
- Use comments to clarify intent, not to explain obvious code.
- Do not commit commented-out code.

- Follow the [Project Naming Guideline](project-naming-guideline.instructions) for all naming conventions and formatting.