---
applyTo: "**/*.java"
---
# Project Naming Guideline

This guideline defines naming conventions for files, classes, interfaces, and variables in this monorepo, based on current workspace structure and best practices for Java projects.

## 1. File and Folder Naming
- Use **lowercase** for Java package and file names.
- Group related features in dedicated folders (feature modules).

### Java
- Package: `com.company.feature` (all lowercase, dot-separated)
- Class: `FeatureName.java` (filename matches public class name)
- Interface: `FeatureNameInterface.java` or `IFeatureName.java`
- Enum: `FeatureType.java`
- Exception: `FeatureNameException.java`
- Test: `FeatureNameTest.java`
- Constants class or enum: `FeatureConstants.java` or `FeatureType.java`

## 2. Class and Interface Naming
- Use **PascalCase** for all class and interface names.
- **Java:**
  - Class: `FeatureName`
  - Interface: `FeatureNameInterface` or `IFeatureName`
  - Enum: `FeatureType`
  - Exception: `FeatureNameException`
  - Test: `FeatureNameTest`
  - Constants: `FEATURE_CONSTANT` (see below)

## 3. Variable and Function Naming
- Use **camelCase** for variables, functions, and methods.
- Use verbs for functions (e.g., `getInvoice`, `createUser`).
- Use `isX`, `hasX`, `canX` for booleans.
- **Java:**
  - Variable and parameter: `featureName`, `currentValue`
  - Constant (static final): `FEATURE_CONSTANT`
  - Method: `computeTotalWidth()`, `runFast()`
  - Boolean: `isEnabled`, `hasLicense`, `canEvaluate`
  - Collection: Use plural form, e.g., `features`, `points`
  - Iterator: `i`, `j`, `k` (for loops)

## 4. Environment Variables
- Use **UPPERCASE** with underscores: `API_URL`, `DB_HOST`

## 5. General Principles
- Avoid abbreviations except for well-known terms (API, URL, DTO, id, min, max, etc.).
- Keep names descriptive and consistent across the codebase.
- Follow the Java style guide for any cases not covered here.
- **Java-specific:**
  - Class names should be nouns; interface names often adjectives.
  - Exception classes should be suffixed with `Exception`.
  - Use `get`/`set` for getters/setters, `is`/`has`/`can` for booleans.
  - Use all uppercase with underscores for constants.
  - Use English for all names and comments.