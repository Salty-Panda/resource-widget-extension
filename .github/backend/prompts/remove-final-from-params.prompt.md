---
applyTo: "**/*.java"
---

# Remove `final` Modifiers from Method Parameters

When editing or generating Java code, do not use the `final` modifier for method parameters. If you encounter method parameters declared as `final`, remove the `final` keyword so that parameters are declared without it.

**Example:**

```java
// Before:
public void process(final String input, final int count) {
    // ...existing code...
}

// After:
public void process(String input, int count) {
    // ...existing code...
}
```