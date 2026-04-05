# Prompt: Replace Explicit Variable Types with 'var' Where Obvious

## Task
Write a script or tool that scans Java source files and replaces explicit variable type declarations with the `var` keyword **only when the type is obvious from the right-hand side of the assignment** and using `var` improves readability. The script should first analyze which explicit types will be replaced by `var`, remove any now-unused import statements for those types, remove the `final` modifier from eligible local variable declarations, and then perform the variable declaration replacements.

## Prompt Chain
After performing the replacements and modifications described above, also remove import statements for types that will be replaced by `var` and are no longer used elsewhere in the file.

## Requirements
- Remove the `final` modifier from local variable declarations that will be replaced by `var`.
- Only replace explicit types with `var` when the type is clear and unambiguous from the assignment (e.g., `String s = "foo";` → `var s = "foo";`).
- Do **not** use `var` for fields, method parameters, or return types—only for local variables inside methods, constructors, or blocks.
- Do **not** use `var` for variables without an initializer.
- After replacing types, ensure that any now-unused import statements are removed from the file.
- The script should process all `.java` files in a given directory (recursively).
- The script should output a summary of files changed and the number of replacements per file.
- When initializing generic objects (such as lists or arrays), always specify the type in the diamond operator (`<>`) on the right side of the assignment to preserve type information.

## Example
**Before:**
```java
import java.util.List;

public class Example {
    public void foo() {
        final List<String> list = new ArrayList<>();
        final String s = "bar";
        int x = 42;
    }
}
```

**After:**
```java
public class Example {
    public void foo() {
        var list = new ArrayList<String>();
        var s = "bar";
        var x = 42;
    }
}
```
*Note: The unused import `import java.util.List;` has been removed.*

## Notes
- The script can be written in Java, Kotlin, Python, or another suitable language.
- Bonus: Optionally, provide a flag to preview changes without modifying files.