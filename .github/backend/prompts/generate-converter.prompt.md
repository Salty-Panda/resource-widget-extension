# Universal Converter Generation Prompt

## Overview
This prompt is designed to generate converters between Java objects following established patterns in the CCB project. All converters must implement `com.comarch.fbu.utils.converter.Converter<Source, Target>` interface.

> **Important:**  
> Do **not** add generated converter beans to Spring configuration automatically.  
> Spring configuration for converters should be added manually as needed in the appropriate configuration classes.

## Converter Types and Patterns

### 1. Simple Object Conversion (MapStruct)
**Use Case**: When objects are structurally similar with minor field name differences or simple mapping requirements.

**Pattern**: Use `@Mapper` annotation from MapStruct library.

**Example Structure**:
```java
@Mapper
public interface SourceToTargetConverter extends Converter<Source, Target> {
    
    @Override
    @Mapping(target = "targetField", source = "sourceField")
    @Mapping(target = "id", expression = "java(\"\")")  // For empty/generated fields
    @Mapping(target = "calculatedField", ignore = true) // For fields to ignore
    Target convert(Source source);
}
```

**When to use**:
- Field names are different but mapping is straightforward
- Simple data transformations
- Objects have similar structure
- Minimal business logic required

### 2. Complex Object Conversion (Manual Implementation)
**Use Case**: When conversion requires business logic, calculations, or complex nested object handling.

**Pattern**: Manual implementation with helper methods.

**Example Structure**:
```java
public class SourceToTargetConverter implements Converter<Source, Target> {

    // Inject dependencies if needed
    private final SomeService someService;
    private final AnotherConverter nestedConverter;

    @Override
    public Target convert(Source source) {
        return Target.builder()
                .simpleField(source.getSimpleField())
                .complexField(buildComplexField(source))
                .nestedObject(convertNestedObject(source))
                .calculatedField(calculateValue(source))
                .build();
    }

    private ComplexType buildComplexField(Source source) {
        // Complex logic here
        return ComplexType.builder()
                .field1(source.getField1())
                .field2(calculateField2(source))
                .build();
    }

    private NestedTarget convertNestedObject(Source source) {
        return nestedConverter.convert(source.getNestedSource());
    }

    private SomeType calculateValue(Source source) {
        // Business logic calculations
        if (source.getValue() == null) {
            return SomeType.DEFAULT;
        }
        return someService.calculate(source.getValue());
    }
}
```

**When to use**:
- Business logic required
- Complex nested objects
- Conditional mapping
- Calculations or transformations
- Single source object

### 3. Collection Conversion
**Pattern**: Extend the basic converter with collection handling if needed.

**Example**:
```java
public class SourceToTargetConverter implements Converter<Source, Target> {
    
    @Override
    public Target convert(Source source) {
        // Main conversion logic
    }

    public List<Target> convertCollection(List<Source> sources) {
        return sources.stream()
                .map(this::convert)
                .collect(Collectors.toList());
    }
}
```

### 4. Multi-Source Conversion

#### A. Two Input Objects (ExtendedConverter)
**Use Case**: When target object requires data from exactly two source objects.

**Pattern**: Use `ExtendedConverter<Source1, Target, Source2>` interface.

**Example**:
```java
public class MultiSourceToTargetConverter implements ExtendedConverter<Source1, Target, Source2> {
    
    @Override
    public Target convert(Source1 source1, Source2 source2) {
        return Target.builder()
                .field1(source1.getField1())
                .field2(source2.getField2())
                .combinedField(combineData(source1, source2))
                .build();
    }
    
    private CombinedType combineData(Source1 source1, Source2 source2) {
        // Combination logic
        return CombinedType.builder()
                .data1(source1.getData())
                .data2(source2.getData())
                .build();
    }
}
```

#### B. Multiple Input Objects (No Interface)
**Use Case**: When target object requires data from more than two source objects.

**Pattern**: Create converter without interface implementation, use direct method parameters.

**Example**:
```java
public class MultipleSourceToTargetConverter {
    
    public Target convert(Source1 source1, Source2 source2, Source3 source3, Map<String, AdditionalData> contextData) {
        return Target.builder()
                .field1(source1.getField1())
                .field2(source2.getField2())
                .field3(source3.getField3())
                .contextualField(processContext(contextData))
                .combinedField(combineAllSources(source1, source2, source3))
                .build();
    }
    
    private ContextualType processContext(Map<String, AdditionalData> contextData) {
        // Process additional context data
    }
    
    private CombinedType combineAllSources(Source1 source1, Source2 source2, Source3 source3) {
        // Complex combination logic
    }
}
```

## Interface Selection Guidelines

### Choose the Right Interface Based on Input Count:

1. **Single Input Object**: Use `Converter<Source, Target>`
2. **Two Input Objects**: Use `ExtendedConverter<Source1, Target, Source2>`
3. **Three or More Input Objects**: No interface implementation (direct methods)
4. **Complex Context Data**: No interface implementation (use Maps, custom parameters)

### Examples of Interface Selection:

```java
// Single input - Use Converter
public class CurrencyRateConverter implements Converter<CurrencyExchangeRate, DashboardsCurrencyRates> {
    // Implementation
}

// Two inputs - Use ExtendedConverter  
public class AccountDataConverter implements ExtendedConverter<AccountData, AccountUpdateModel, CustomerAccount> {
    // Implementation
}

// Multiple inputs - No interface
public class ComplexDataConverter {
    public Target convert(Source1 s1, Source2 s2, Source3 s3, Map<String, Object> context) {
        // Implementation
    }
}
```

## Generation Guidelines

### 1. Analyze Object Complexity
- **Simple mapping**: Use MapStruct `@Mapper`
- **Complex logic**: Use manual implementation
- **Mixed**: Combine approaches or break into smaller converters

### 2. Handle Null Safety
```java
private SomeType safeConvert(SourceType source) {
    return source != null ? source.getValue() : null;
}

// Or use Optional
private SomeType safeConvertWithOptional(SourceType source) {
    return Optional.ofNullable(source)
            .map(SourceType::getValue)
            .orElse(null);
}
```

### 3. Dependency Injection
- Use constructor injection with `@RequiredArgsConstructor` (Lombok)
- Inject other converters for nested objects
- Inject services for business logic

### 4. Package Structure
Place converters in appropriate packages:
- Domain converters: `*.domain.application.*.converter`
- Composite converters: `*.composite.application.*.converter`
- Integration converters: `*.integration.*.converter`

### 5. Naming Convention
- Pattern: `SourceToTargetConverter`
- Be specific: `CurrencyExchangeRateToDashboardsCurrencyRatesConverter`
- Use clear, descriptive names

## Common Patterns

### Enum/Trend Calculations
```java
private TrendType calculateTrend(BigDecimal change) {
    if (change == null || change.compareTo(BigDecimal.ZERO) == 0) {
        return TrendType.STABLE;
    }
    return change.compareTo(BigDecimal.ZERO) > 0 ? TrendType.RISING : TrendType.FALLING;
}
```

### Builder Pattern Usage
```java
return Target.builder()
        .field1(source.getField1())
        .field2(buildComplexField(source))
        .build();
```

### Stream Operations
```java
return sourceList.stream()
        .map(this::convert)
        .filter(Objects::nonNull)
        .collect(Collectors.toList());
```

## Error Handling
- Handle null inputs gracefully
- Use Optional for nullable returns
- Validate required fields
- Log conversion errors if needed

## Testing Considerations
- Test null inputs
- Test empty collections
- Test edge cases
- Verify all fields are mapped correctly

## Template Request Format

When requesting converter generation, provide:

1. **Source Object(s)**: Full class definition or key fields (specify if multiple inputs)
2. **Target Object**: Full class definition or key fields  
3. **Conversion Requirements**: Any special logic needed
4. **Dependencies**: Services or other converters needed
5. **Package Location**: Where to place the converter
7. **Interface Type**: Specify based on number of inputs

### Single Input Example:
```
Generate converter from CurrencyExchangeRate to DashboardsCurrencyRates:
- Source: CurrencyExchangeRate (domain object with rates and percentage changes)
- Target: DashboardsCurrencyRates (composite API object with trends)
- Logic: Calculate trends based on percentage changes (RISING/FALLING/STABLE)
- Location: composite.application.currencyrates package
- Inject into: DashboardsCurrencyRatesQueryHandler
- Interface: Converter<CurrencyExchangeRate, DashboardsCurrencyRates>
```

### Two Input Example:
```
Generate converter from AccountData and CustomerAccount to AccountUpdateModel:
- Source1: AccountData (contains alias information)
- Source2: CustomerAccount (contains name and type information)
- Target: AccountUpdateModel (contains computed alias)
- Logic: Priority-based alias selection (accountData.alias > customerAccount.name > type name lookup)
- Dependencies: AccountDictionaryAdapter for type name resolution
- Location: domain.application.usecase.account.common.converter package
- Interface: ExtendedConverter<AccountData, AccountUpdateModel, CustomerAccount>
```

### Multiple Input Example:
```
Generate converter for complex exchange rate calculation:
- Sources: ExchangeRatesRecordData, Map<String, CurrencyExchangeRate>, Map<String, BigDecimal>
- Target: CurrencyExchangeRateType
- Logic: Complex rate calculation with context data and current values
- Dependencies: DateTimeProvider, DateConverter
- Location: integration.application.synchronization.converter package
- Interface: None (direct method parameters)
```

This approach ensures consistent, maintainable converters following project patterns and best practices.