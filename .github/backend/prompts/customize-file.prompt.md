---
applyTo: "**/*.java"
mode: agent
---

# GitHub Copilot Prompt for Creating Customization Files

When creating ALR/TMB customization files from product files, follow these rules:

## General Principles

1. **Package Structure Mirroring:**
   - Customization files must be placed in the corresponding customization artifact (`customizations-alr` or `customizations-tmb`)
   - The package structure must mirror the product package structure
   - Example: If product file is in `ccb-accounts-infrastructure-spring/src/main/java/com/comarch/fbi/ccb/accounts/infrastructure/spring/delivery/frontend/ib/http/init/`
     then ALR file should be in `customizations-alr/ccb-accounts-alr-infrastructure-spring/src/main/java/com/comarch/fbi/ccb/accounts/alr/infrastructure/spring/delivery/frontend/ib/http/init/`

2. **Naming Convention:**
   - Customization class name = Product class name + customization suffix (e.g., `Alr`, `Tmb`)
   - Example: `SharedContextInitHttpEndpoint` → `SharedContextInitHttpEndpointAlr`

3. **Import Adjustments:**
   - Import the product class being extended
   - Adjust package declarations to include customization identifier (`alr`, `tmb`)
   - Import only additional dependencies needed for customization

4. **Code Reuse:**
   - Extend product classes when reusing common functionality
   - Override product classes when implementing completely different behavior
   - Call `super` methods when extending product behavior

## Case 1: Standard Class Beans (Spring Components, Services, Helpers)

**Pattern:** Extend product class and override specific methods to add or modify behavior.

**When to use:**
- Spring `@Component`, `@Service`, `@RestController` beans
- Helper classes
- HTTP endpoints
- Services with partial customization needs

**Structure:**
```java
package com.comarch.fbi.ccb.{module}.{customization}.infrastructure.spring.{subpackage};

import com.comarch.fbi.ccb.{module}.infrastructure.spring.{subpackage}.ProductClass;
// Import additional customization-specific dependencies

public class ProductClassAlr extends ProductClass {
    // Additional fields for customization-specific dependencies
    private final CustomizationSpecificDependency customizationDependency;

    // Constructor with all dependencies (product + customization)
    public ProductClassAlr(
        final ProductDependency1 productDep1,
        final ProductDependency2 productDep2,
        final CustomizationSpecificDependency customizationDep) {
        super(productDep1, productDep2);
        this.customizationDependency = customizationDep;
    }

    // Override methods to modify behavior
    @Override
    protected void methodToCustomize() {
        // Call customization-specific logic
        customizationDependency.doSomething();
        // Optionally call parent implementation
        // super.methodToCustomize();
    }
}
```

**Examples:**
- `SharedContextInitHttpEndpoint` → `SharedContextInitHttpEndpointAlr`
  - Extends REST controller
  - Adds `AccountsSynchronizationHelper` dependency
  - Overrides `runAdditionalProcesses()` to add synchronization logic

- `UserPrivilegesBoHelper` → `UserPrivilegesBoHelperAlr`
  - Extends helper class
  - Adds `ModuleServiceExecutor` dependency
  - Overrides `getUserPrivileges()` to synchronize cards before fetching privileges
  - Calls `super.getUserPrivileges()` to reuse product logic

**Key Rules:**
- Keep all product dependencies in constructor
- Add customization dependencies after product dependencies
- Always pass product dependencies to `super()` constructor
- Override only methods that need customization
- Use `@Override` annotation
- Preserve product annotations (e.g., `@CheckPermission`)

## Case 2: Domain Models and DTOs

**Pattern:** Extend product model to add customization-specific fields.

**When to use:**
- Domain models
- DTOs (Data Transfer Objects)
- Integration models
- View models

**Structure:**
```java
package com.comarch.fbi.ccb.{module}.{customization}.domain.types.{subpackage};

import com.comarch.fbi.ccb.{module}.domain.types.{subpackage}.ProductModel;

import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.ToString;
import lombok.experimental.SuperBuilder;

@Data
@NoArgsConstructor
@SuperBuilder(toBuilder = true)
@ToString(callSuper = true)
public class ProductModelAlr extends ProductModel {
    // Additional fields specific to customization
    private String customField1;
    private Integer customField2;
    
    // Optional: Override getters/setters if type casting needed
    @Override
    public CustomTypeAlr getCustomProperty() {
        return (CustomTypeAlr) super.getCustomProperty();
    }
    
    public void setCustomProperty(CustomTypeAlr customProperty) {
        super.setCustomProperty(customProperty);
    }
}
```

**Examples:**
- `AccountIntegration` → `AccountIntegrationAlr`
  - Adds `vatAccountNumber` field
  - Uses `@SuperBuilder` to support builder pattern

- `OperationModel` → `OperationModelAlr`
  - Adds multiple customization fields (e.g., `gvcDictionaryType`, `stornoReference`, `blikDescriptions`)
  - Overrides `getCounterparty()` with proper type casting to `OperationPartyModelAlr`
  - Includes JavaDoc for fields that might seem redundant but serve specific purposes

**Key Rules:**
- Use `@SuperBuilder(toBuilder = true)` for builder pattern support
- Use `@ToString(callSuper = true)` to include parent fields in toString
- Use `@Data` or specific Lombok annotations (`@Getter`, `@Setter`)
- Add `@NoArgsConstructor` for JPA/serialization compatibility
- Override getters/setters only when type casting is needed
- Document fields that override or extend product functionality with JavaDoc
- Preserve all product annotations (e.g., `@SensitiveData`, `@SensitiveInformation`)

## Case 3: Command/Query Handlers - Complete Override

**Pattern:** Implement handler interface directly when product logic is not reusable.

**When to use:**
- Command handlers with completely different business logic
- Query handlers with no common implementation
- Handlers where all steps differ from product
- Multiple customizations need different implementations (ALR vs TMB)

**Structure:**
```java
package com.comarch.fbi.ccb.{module}.{customization}.domain.application.{subpackage};

import com.comarch.fbi.ccb.{module}.domain.api.{command/query}.ProductCommand;
import com.comarch.fbu.ccb.cqrs.command.handling.CommandHandler;

import lombok.RequiredArgsConstructor;
import lombok.extern.log4j.Log4j2;

@Log4j2
@RequiredArgsConstructor
public class ProductCommandHandlerAlr implements CommandHandler<ProductCommand, ReturnType> {
    // Customization-specific dependencies only
    private final CustomizationDependency1 dependency1;
    private final CustomizationDependency2 dependency2;

    @Override
    public ReturnType handle(ProductCommand command) throws Exception {
        // Completely custom implementation
        log.debug("Custom logic for {}", command);
        
        var result = dependency1.customProcess(command);
        dependency2.customValidation(result);
        
        return result;
    }
    
    // Custom helper methods
    private void customHelper() {
        // ...
    }
}
```

**Examples:**
- `InitializeSynchronizeProductsCommandHandler` → `InitializeSynchronizeProductsCommandHandlerAlr`
  - Implements `CommandHandler<InitializeSynchronizeProductsCommand, Void>` directly
  - Product uses integration service, ALR uses custom providers
  - Completely different dependencies and logic flow
  
- `InitializeSynchronizeProductsCommandHandler` → `InitializeSynchronizeProductsCommandHandlerTmb`
  - Implements same interface but with TMB-specific logic
  - Simplified implementation compared to product

**Key Rules:**
- Do NOT extend product handler class
- Implement the same interface as product (`CommandHandler<T, R>` or `QueryHandler<T, R>`)
- Use same command/query classes from domain API
- Use `@RequiredArgsConstructor` for dependency injection
- Include `@Log4j2` for logging
- Add `@Transactional` if product handler has it
- Preserve timeout values from product if applicable

## Case 4: Command/Query Handlers - Partial Extension

**Pattern:** Extend product handler to reuse common logic and customize specific parts.

**When to use:**
- Handlers where most logic is reusable
- Only specific methods need customization
- Pre/post-processing hooks needed
- Additional validation or data retrieval required

**Structure:**
```java
package com.comarch.fbi.ccb.{module}.{customization}.domain.application.{subpackage};

import com.comarch.fbi.ccb.{module}.domain.application.{subpackage}.ProductQueryHandler;

import lombok.extern.slf4j.Slf4j;

@Slf4j
public class ProductQueryHandlerAlr extends ProductQueryHandler {
    // Additional customization dependencies
    private final CustomizationDependency customDependency;

    public ProductQueryHandlerAlr(
        final ProductDependency1 productDep1,
        final ProductDependency2 productDep2,
        final CustomizationDependency customDep) {
        super(productDep1, productDep2);
        this.customDependency = customDep;
    }

    @Override
    protected ReturnType customizableMethod(Parameter param) {
        // Custom logic
        var customData = customDependency.fetch(param);
        
        if (customCondition(customData)) {
            return handleCustomCase(customData);
        }
        
        // Fallback to product logic
        return super.customizableMethod(param);
    }
    
    // Additional helper methods
    private boolean customCondition(Data data) {
        // ...
    }
}
```

**Examples:**
- `GetCompanyChannelsStatusesQueryHandler` → `GetCompanyChannelsStatusesQueryHandlerAlr`
  - Extends product query handler
  - Adds `CoreParameterAdapter` and `CoreCompaniesAdapter` dependencies
  - Overrides `getOpenApiStatus()` to implement ALR-specific logic
  - Reuses `getInactiveMobileChannels()` from product

**Key Rules:**
- Extend product handler class
- Add customization dependencies to constructor
- Call `super()` with product dependencies
- Override only specific methods that need customization
- Call `super.method()` when appropriate to reuse product logic
- Use `protected` methods in product classes to allow customization
- Preserve transaction and permission annotations
- Keep same return types and exceptions

## Artifact Mapping Reference

**Module Structure:**
```
ccb-{module}/
├── ccb-{module}-{artifact}/           → Product artifact
└── customizations-{customization}/
    └── ccb-{module}-{customization}-{artifact}/  → Customization artifact
```

**Common Artifacts:**
- `domain-api` → `{customization}-domain-api` (commands, queries, DTOs)
- `domain-application` → `{customization}-domain-application` (handlers, services)
- `domain-core` → `{customization}-domain-core` (domain logic, repositories)
- `domain-types` → `{customization}-domain-types` (models, enums, views)
- `infrastructure-spring` → `{customization}-infrastructure-spring` (controllers, configs)
- `composite-application` → `{customization}-composite-application` (composite handlers)
- `integration-application` → `{customization}-integration-application` (integration logic)

**Example Paths:**
- Product: `ccb-accounts/ccb-accounts-infrastructure-spring/src/main/java/com/comarch/fbi/ccb/accounts/infrastructure/spring/`
- ALR: `ccb-accounts/customizations-alr/ccb-accounts-alr-infrastructure-spring/src/main/java/com/comarch/fbi/ccb/accounts/alr/infrastructure/spring/`
- TMB: `ccb-accounts/customizations-tmb/ccb-accounts-tmb-infrastructure-spring/src/main/java/com/comarch/fbi/ccb/accounts/tmb/infrastructure/spring/`

## Checklist Before Creating Customization File

- [ ] Identified correct customization type (alr/tmb)
- [ ] Located corresponding product file
- [ ] Determined correct artifact (domain, infrastructure, composite, etc.)
- [ ] Verified package structure mirrors product package
- [ ] Chosen correct pattern (extend vs. implement)
- [ ] Identified all required dependencies
- [ ] Reviewed product class for `protected` methods to override
- [ ] Checked for annotations to preserve
- [ ] Planned which methods to override
- [ ] Considered whether to call `super` methods

## Anti-Patterns to Avoid

❌ **Don't** place customization files in product artifacts
❌ **Don't** duplicate product code instead of extending/overriding
❌ **Don't** forget to import product class when extending
❌ **Don't** create beans for both product and customization
❌ **Don't** extend when complete override is needed
❌ **Don't** implement interface when partial extension is sufficient

## Common Customization Scenarios

### Adding New Field to Model
→ Use Case 2 (Models): Extend product model with `@SuperBuilder`

### Modifying Bean Behavior
→ Use Case 1 (Standard Beans): Extend and override specific methods

### Complete Business Logic Change
→ Use Case 3 (Complete Override): Implement handler interface

### Adding Pre/Post Processing
→ Use Case 4 (Partial Extension): Extend handler and override hooks

### New REST Endpoint Operation
→ Use Case 1 (Standard Beans): Extend controller and override/add methods