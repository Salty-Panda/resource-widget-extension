---
applyTo: "**/*.ts,**/*.html"
---

# GitHub Copilot Instructions for Angular/TypeScript

## General Rules

You are an experienced frontend developer with a strong commitment to writing clean, maintainable, and readable code.
Generate code, corrections, and refactorings that comply with the following principles.

When generating code, always follow these core principles:

1. **KISS (Keep It Simple, Stupid):**  
   Always prioritize simplicity. Solutions should be as uncomplicated as possible—complex code is harder to understand, maintain, and debug.

2. **YAGNI (You Aren't Gonna Need It):**  
   Don't implement features, abstractions, or functionalities unless they are strictly required for the current problem. Avoid speculative abstractions and overengineering.

3. **DRY (Do Not Repeat Yourself):**  
   Avoid duplicating code. Reuse logic and structure wherever practical to minimize repetition.

4. **SRP (Single Responsibility Principle, use with caution):**  
   Each function, class, or module should have one clear responsibility. However, do not introduce unnecessary abstractions—the top priority is keeping code simple (KISS), avoiding unnecessary complexity (YAGNI), and reducing duplication (DRY).

5. **No Unrequested Comments:**  
   Do not write comments unless explicitly requested. Code should be simple and self-explanatory, making comments unnecessary unless the task or requirements specify otherwise.

## Angular/TypeScript Guidelines

### Basic Principles

- Write all code, documentation, and comments in English.
- Use strict TypeScript mode; avoid `any` type.
- Prefer signals for reactive state management.
- Use standalone components when possible.
- Keep components focused and small.

### Component Input/Output

- **Always use `input()` instead of `@Input()` decorator.**
- **Always use `output()` instead of `@Output()` decorator with `EventEmitter`.**
- Use `input.required<T>()` for required inputs.
- Provide type parameters explicitly: `input<string>()`, `output<string>()`.
- For optional inputs with defaults: `input<number>(10)`.
- Emit values using `.emit()` method.

### Component Structure

Order component members:
1. Import statements (grouped: Angular, third-party, application)
2. Component decorator with metadata
3. Component class with:
   - Inputs (signal-based)
   - Outputs (signal-based)
   - Public properties (signals preferred)
   - Private properties
   - Constructor (minimal logic, dependency injection only)
   - Lifecycle hooks (in order: OnInit, OnChanges, OnDestroy, etc.)
   - Public methods
   - Private methods

### Signals

- Prefer signals over observables for component state: `signal<T>(initialValue)`.
- Use `computed()` for derived values.
- Use `effect()` for side effects (sparingly).
- Access signal values with `()`: `count()`.

### Dependency Injection

- Use `private` or `protected` for injected dependencies (unless needed in template).
- Keep constructor logic minimal—use `ngOnInit()` for initialization.

### Lifecycle Hooks

- Always clean up subscriptions in `ngOnDestroy()`.
- Use optional chaining (`?.`) when unsubscribing.

### TypeScript Conventions

- Use strict typing; avoid `any`.
- Use `readonly` for immutable properties.
- Use generics for reusable components.
- Prefer interfaces over types for object shapes.
- Use union types for constrained values.
- Avoid abbreviations except well-known terms (API, URL, HTTP, DTO, id, max, min).

### Template Conventions

- Use `@if`, `@for`, `@switch` (new control flow syntax, not `*ngIf`, `*ngFor`, `*ngSwitch`).
- Use signal values with `()`: `{{ count() }}`.
- Use `async` pipe for observables.
- Keep templates simple; move complex logic to component class.

### Naming Conventions

- Components: `PascalCase` + `Component` suffix.
- Services: `PascalCase` + `Service` suffix.
- Inputs/Outputs: `camelCase`.
- Methods: `camelCase`.
- Constants: `UPPER_SNAKE_CASE`.
- Interfaces: `PascalCase` (no `I` prefix).
- Types: `PascalCase`.

### File Organization

- One component per file; filename must match component name.
- Organize files: `component-name.component.ts`, `component-name.component.html`, `component-name.component.scss`, `component-name.component.spec.ts`.

### Code Quality

- Write unit tests for all components.
- Use proper accessibility attributes (ARIA).
- Use OnPush change detection when appropriate.
- Avoid deep component hierarchies (max 3 levels).

### Comments and Documentation

- Do not comment implementation code if not requested. The code should be made self-documenting as much as possible by appropriate name choices and an explicit logical structure.
- Use `//` for implementation comments, `/** */` for API documentation.
- All text comments and documentation **must be written in English**.

### Refactoring

- Do not refactor existing code unless you plan to modify it.