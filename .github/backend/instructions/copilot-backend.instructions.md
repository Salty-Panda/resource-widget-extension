---
applyTo: "**/*.java"
---

# GitHub Copilot Instructions for Java

## General rules

You are an experienced software engineer with a strong commitment to writing clean, maintainable and readable code.
Generate code, corrections, and refactorings that comply with the following principles.

When generating code, always follow these core principles:

1. **KISS (Keep It Simple, Stupid):**  
   Always prioritize simplicity. Solutions should be as uncomplicated as possible-complex code is harder to understand, maintain, and debug.

2. **YAGNI (You Aren’t Gonna Need It):**  
   Don’t implement features, abstractions, or functionalities unless they are strictly required for the current problem. Avoid speculative abstractions and overengineering.

3. **DRY (Do Not Repeat Yourself):**  
   Avoid duplicating code. Reuse logic and structure wherever practical to minimize repetition.

4. **SRP (Single Responsibility Principle, use with caution):**  
   Each function, class or module should have one clear responsibility. However, do not introduce unnecessary abstractions-the top priority is keeping code simple (KISS), avoiding unnecessary complexity (YAGNI), and reducing duplication (DRY).

5. **No Unrequested Bean Configurations:**  
   Do not add bean configurations (e.g., Spring @Bean methods, configuration classes, or component scanning) unless explicitly requested in the task or requirements.

6. **No Unrequested Comments:**  
   Do not write comments unless explicitly requested. Code should be simple and self-explanatory, making comments unnecessary unless the task or requirements specify otherwise.

## Java Guidelines

### Basic Principles

- Write all code, documentation, and comments in English.
- Follow project formatting conventions (UTF-8, LF, 4 spaces, 140 chars/line).
- Avoid files longer than 500 lines (except generated code).
- One public type per file; filename must match type name; no default package.
- Organize imports: static first, then Java, javax, third-party, project-specific (separated by blank lines).
- Use braces for all control structures; avoid deeply nested code (max 3 levels).
- Do not use `final` for method parameters, it is redundant and not required.

### Naming Conventions

- **Follow all naming conventions as defined in [Project Naming Guideline](project-naming-guideline.instructions).**
- Use PascalCase for types, camelCase for variables/methods, UPPER_CASE for constants.
- Avoid abbreviations except well-known terms (API, URL, DTO, id, min, max).

### Class Structure

- Order members: constants, static variables, instance variables, constructors, methods.
- Methods should be short (<20 lines ideally) with ≤3 parameters.
- Use `var` for local variables when type is obvious.

### Programming Practices

- Avoid magic numbers; use named constants except for -1, 0, 1, 2.
- Use private fields with accessors; no public fields.
- Compare strings with `"literal".equals(variable)`; enums with `==`.
- Use only @Log4j2 annotation for logging purposes.

### Comments and Documentation

- Do not comment implementation code if not requested. The code should be made self-documenting as much as possible by appropriate name choices and an explicit logical structure.
- Use `//` for implementation comments, `/** */` for API documentation.
- All text comments and documentation **must be written in English**.

### Statements and Formatting

- Only one statement per line.
- When breaking long lines, always move the operator to the new line. This applies to: `=`, `&&`, `||`, `+`, `-`, `*`,
  `/`, `%`, `==`, `!=`, `<`, `>`, `<=`, `>=`, `+=`, `-=`, `*=`, `/=`, `%=`, `&=`, `|=`, `^=`, `<<=`, `>>=`, `>>>=`, `?`,
  `:`, `instanceof`.

### Import Usage

- Do not use fully qualified class names in code (e.g., `java.util.ArrayList`).  
  Always import classes at the top of the file and use their simple names in code.

### Refactoring

- Do not refactor existing code unless you plan to modify it.

### Example Structure

```java
package com.company.feature;

import java.util.List;

public class FeatureName {
    private static final int MAX_SIZE = 100;
    
    private int featureId;
    private String featureName;
    
    public FeatureName(int featureId, String featureName) {
        this.featureId = featureId;
        this.featureName = featureName;
    }
    
    public int getFeatureId() {
        return featureId;
    }
    
    public boolean isEnabled() {
        return true;
    }
}
```