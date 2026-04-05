## Versioning Rules

The script file name must follow specific versioning patterns based on the working directory:

### 1. Product Artifact (for example: ccb-dictionaries-domain-infrastructure)
When working in the main product module `ccb-dictionaries-domain-infrastructure`:
- **Pattern**: `V{next_version}__{Script_description}_{TABLE_NAME}.sql`
- **Example**: `V39__Create_table_NEW_TABLE.sql`

### 2. Customization Artifacts (ALR/TMB)
When working in customization modules (`alr` or `tmb` related artifacts):
- **Pattern**: `V{product_version}.{customization_next_version}__{Script_description}_{TABLE_NAME}.sql`
- **Example**: `V39.0.1__Create_table_NEW_TABLE.sql`

## Dictionary Script Directory Structure

Each composite-infrastructure artifact that defines dictionary scripts (e.g., `ccb-accounts`, `ccb-payments`, `ccb-dictionaries`) may contain **two types** of directories under its `src/main/db/sql/dictionaries/` path:

### `languages/` directory
Contains language-specific data scripts, organized by language code subdirectories (e.g., `EN/`, `PL/`, `TH/`). These scripts insert or update **dictionary values** (i.e., the translatable content of each dictionary entry).

### `structure/` directory
Contains language-neutral scripts that modify the **structural definition** of dictionaries. Typical operations include:
- Creating new dictionaries
- Removing existing dictionaries
- Modifying dictionary attributes (e.g., adding, updating, or deleting attributes)
- Updating the structural configuration of existing dictionaries

Example file names:
- `V542__Add_dictionary_MOBILE_RESOURCES.sql`
- `V571__Create_dictionary_FRONTEND_EXTENSIONS_NAVIGATION.sql`
- `V573__Delete_dictionary_FRONTEND_EXTENSIONS_NAVIGATION.sql`
- `V533__Update_dictionary_attributes_OPERATION_TYPE.sql`

**Important**: The `structure/` directory and all `languages/` subdirectories share the **same version number sequence**. A version number used in `structure/` cannot be reused in any language directory, and vice versa. Always treat them as a single unified version space.

## Version Sequence Scoping

**CRITICAL**: Version sequences are scoped to a **single schema directory**. Scripts in different schema directories are **completely independent** and must never be compared or mixed when determining version numbers.

### Scope boundaries

Each directory directly under `src/main/db/sql/` is an **independent version space**:

| Directory | Artifact type | Example path |
|---|---|---|
| `dictionaries/` | composite-infrastructure | `ccb-dictionaries-composite/.../sql/dictionaries` |
| `parameters/` | composite-infrastructure | `ccb-payments-composite/.../sql/parameters` |
| `rights/` | composite-infrastructure | `ccb-payments-composite/.../sql/rights` |
| `module-schema/` | domain-infrastructure | `ccb-dictionaries-domain/.../sql/module-schema` |

### Key rules

- `module-schema/` in a **domain-infrastructure** artifact has its own version sequence that is **completely unrelated** to any composite-infrastructure sequence (even within the same product module).
- Different schema directories within the **same composite-infrastructure** artifact (e.g., `dictionaries/`, `parameters/`, `rights/`) each maintain their own independent version counters.
- When determining the next version for a script, **only scan the same schema directory** as the target script. Never look at other schema directories, even in the same artifact.

## Version Determination Process

### Step 1: Derive the Product Script Path

**CRITICAL**: Always start by determining the product script path, regardless of whether you're creating product or customization scripts.

- If base path contains `customizations-alr/` (e.g., `customizations-alr/ccb-dictionaries-alr-composite/ccb-dictionaries-alr-composite-infrastructure/src/main/db/sql/dictionaries`):
   - Product path: `ccb-dictionaries-composite/ccb-dictionaries-composite-infrastructure/src/main/db/sql/dictionaries`
- If base path contains `customizations-tmb/` (e.g., `customizations-tmb/ccb-dictionaries-tmb-composite/ccb-dictionaries-tmb-composite-infrastructure/src/main/db/sql/dictionaries`):
   - Product path: `ccb-dictionaries-composite/ccb-dictionaries-composite-infrastructure/src/main/db/sql/dictionaries`
- If base path is already a product path (e.g., `ccb-dictionaries-composite/ccb-dictionaries-composite-infrastructure/src/main/db/sql/dictionaries`):
   - Product path: Use the same path
- For domain module schemas:
   - Product path: `ccb-dictionaries-domain/ccb-dictionaries-domain-infrastructure/src/main/db/sql/module-schema/`

### Step 2: Determine the Latest Product Version

**CRITICAL**: This step is MANDATORY for both product AND customization scripts. The product version is the base for all versioning.

You **must** scan **both** the `structure/` directory **and** all `languages/` subdirectories together, because they share the same version counter.

Command to find the latest product version across all directories:
```bash
find {product_path}/languages {product_path}/structure -name "V*.sql" -exec basename {} \; \
  | sed 's/__.*$//' | sort -V | tail -1
```

Example:
```bash
find ccb-dictionaries-composite/ccb-dictionaries-composite-infrastructure/src/main/db/sql/dictionaries/languages \
     ccb-dictionaries-composite/ccb-dictionaries-composite-infrastructure/src/main/db/sql/dictionaries/structure \
  -name "V*.sql" -exec basename {} \; | sed 's/__.*$//' | sort -V | tail -1
```

**Important**:
- Always scan **both** `languages/` (all language subdirectories) **and** `structure/` for version numbers
- Find the **highest version number across ALL directories** (languages + structure)
- Example: If EN has V612, TH has V614, and `structure/` has V606, the latest product version is **V614**
- If the `structure/` directory does not exist, scan only the language directories
- If no language directories exist, scan the `module-schema` directory directly

### Step 3: Determine the Latest Customization Version (if creating customization scripts)

**Only applicable when creating ALR or TMB customization scripts.**

Example commands to find the latest customization version (scan both `languages/` and `structure/` directories):
```bash
# For ALR
find customizations-alr/ccb-dictionaries-alr-composite/ccb-dictionaries-alr-composite-infrastructure/src/main/db/sql/dictionaries/languages \
     customizations-alr/ccb-dictionaries-alr-composite/ccb-dictionaries-alr-composite-infrastructure/src/main/db/sql/dictionaries/structure \
  -name "V*.sql" -exec basename {} \; | sed 's/__.*$//' | sort -V | tail -1

# For TMB
find customizations-tmb/ccb-dictionaries-tmb-composite/ccb-dictionaries-tmb-composite-infrastructure/src/main/db/sql/dictionaries/languages \
     customizations-tmb/ccb-dictionaries-tmb-composite/ccb-dictionaries-tmb-composite-infrastructure/src/main/db/sql/dictionaries/structure \
  -name "V*.sql" -exec basename {} \; | sed 's/__.*$//' | sort -V | tail -1
```

> **Note**: Include the `structure/` path only if it exists in the customization module.

#### For Product Module Scripts:
Use the next sequential version from the latest product version found in Step 2.
- Example: If latest product version is V593, use V594
- File pattern: `V{next_version}__{description}_{TABLE_NAME}.sql`

#### For ALR Customization Scripts:
Use pattern: `V{latest_product_version}.0.{sequence}.0`

**Calculation:**
1. Take the latest product version from Step 2 (e.g., V593)
2. Check if there are any existing ALR scripts with this product version base (e.g., V593.0.X)
3. Determine the next sequence number:
   - If no ALR scripts exist for this product version: Start at 1
   - If ALR scripts exist: Find the highest sequence number and increment
4. **For multi-language scripts**: Each language gets an incremental sequence number
   - EN directory: V593.0.1
   - PL directory: V593.0.2
   - TH directory: V593.0.3

**Example Scenario:**
- Latest product version: V593
- Latest ALR version: V592.0.8
- New ALR scripts should use: V593.0.1 (EN), V593.0.2 (PL), V593.0.3 (TH)

**Important**: Do NOT base customization version on the latest customization version alone. Always use the latest product version as the base.

#### For TMB Customization Scripts:
Use pattern: `V{latest_product_version}.0.{sequence}.0`

**Calculation:**
1. Take the latest product version from Step 2 (e.g., V593)
2. Check if there are any existing TMB scripts with this product version base (e.g., V593.0.X)
3. Determine the next sequence number:
   - If no TMB scripts exist for this product version: Start at 1
   - If TMB scripts exist: Find the highest sequence number and increment
4. **For multi-language scripts**: Each language gets an incremental sequence number
   - EN directory: V593.0.1
   - PL directory: V593.0.2
   - TH directory: V593.0.3

**Example Scenario:**
- Latest product version: V593
- Latest TMB version: V592.0.5
- New TMB scripts should use: V593.0.1 (EN), V593.0.2 (PL), V593.0.3 (TH)

## Special Rule: Customization Base Version Higher Than Product Version

**CRITICAL EXCEPTION**: Before finalizing any version number, always check whether existing customization scripts (ALR or TMB, **not being modified in the current change**) contain a **base product version higher than the latest product version**. Ignoring this can cause Flyway execution-order conflicts on environments where both product and customization scripts are applied.

### How to detect

Extract the integer base version from all existing customization scripts (the leading integer prefix before any customization sub-version dots):

```bash
# Highest base product version in ALR customizations (e.g. V4.0.7 → base 4)
find {alr_path} -name "V*.sql" -exec basename {} \; \
  | sed 's/__.*$//' | sort -V | tail -1

# Highest base product version in TMB customizations (e.g. V7.2.0 → base 7)
find {tmb_path} -name "V*.sql" -exec basename {} \; \
  | sed 's/__.*$//' | sort -V | tail -1
```

Take the leading integer from the result (e.g. `V7.2.0` → base = **7**) and compare it with the latest product version.

### Resolution rules

- **New product script**: If any customization's integer base version exceeds the latest product version, the new product script version **must be strictly greater than the highest integer base** found across all customizations.
  - Example: TMB latest = `V7.2.0` (base 7), ALR latest = `V4.0.7` (base 4), product latest = `V1.x` → new product script must be **V8** (not V2).

- **New ALR-only script** (not tied to a new product version in this change): Continue incrementing from the latest existing ALR version, keeping the existing ALR base. Do **not** jump to the new product base that does not exist yet.
  - Example: ALR latest = `V4.0.7` → next ALR script = **V4.0.8**.

- **New TMB-only script** (not tied to a new product version in this change): Continue incrementing from the latest existing TMB version, keeping the existing TMB base.
  - Example: TMB latest = `V7.2.0` → next TMB script = **V7.2.1**.

> **Note**: ALR and TMB maintain **independent** version streams. Never compare ALR versions with TMB versions when determining the next version for a specific customization.

### Example (ccb-accounts rights)

| Source | Latest script | Integer base |
|---|---|---|
| Product (`ccb-accounts-composite/.../rights`) | `V1.x` | 1 |
| ALR (`customizations-alr/.../rights`) | `V4.0.7` | 4 |
| TMB (`customizations-tmb/.../rights`) | `V7.2.0` | 7 |

Highest customization base = **7** (TMB) > latest product version (1).

| Scenario | Correct version |
|---|---|
| New product script | **V8** |
| New ALR-only script | **V4.0.8** |
| New TMB-only script | **V7.2.1** |

> ⚠️ **ANOMALY DETECTED**: The TMB customization contains `V7.2.0`, while the product only has `V1.x`. This indicates **historical versioning errors** in previous changes (likely from inconsistent or manual version assignments). This is a legacy data quality issue. When working with this artifact, always apply the special rule above to prevent Flyway conflicts.

## Detecting and Reporting Versioning Anomalies

**CRITICAL**: Before processing any script additions, scan all three version spaces (product, ALR, TMB) for anomalies. If the integer bases of customizations are significantly misaligned or exceed the product base, this indicates **legacy versioning errors** that must be flagged.

### How to identify anomalies

```bash
# For each schema directory (rights, dictionaries, parameters, etc.):
# 1. Find product version
PROD_VERSION=$(find ccb-MODULE-composite/.../sql/SCHEMA -name "V*.sql" -exec basename {} \; \
  | sed 's/__.*$//' | sort -V | tail -1 | sed 's/V\([0-9]*\).*/\1/')

# 2. Find ALR base version
ALR_VERSION=$(find customizations-alr/ccb-MODULE-alr-composite/.../sql/SCHEMA -name "V*.sql" -exec basename {} \; \
  | sed 's/__.*$//' | sort -V | tail -1 | sed 's/V\([0-9]*\).*/\1/')

# 3. Find TMB base version
TMB_VERSION=$(find customizations-tmb/ccb-MODULE-tmb-composite/.../sql/SCHEMA -name "V*.sql" -exec basename {} \; \
  | sed 's/__.*$//' | sort -V | tail -1 | sed 's/V\([0-9]*\).*/\1/')

# 4. Compare and alert
if [[ $ALR_VERSION -gt $PROD_VERSION ]] || [[ $TMB_VERSION -gt $PROD_VERSION ]]; then
  echo "⚠️  ANOMALY: Customization base(s) exceed product base!"
  echo "   Product: V$PROD_VERSION | ALR: V$ALR_VERSION | TMB: V$TMB_VERSION"
fi
```

### What to flag

An anomaly exists when:
- A customization's integer base is **significantly higher** (more than 1–2 versions) than the product base
- Different customizations have **drastically different bases** (e.g., ALR=4, TMB=7, product=1)
- The gap suggests **multiple independent version branches** were not synchronized

### How to report

When you detect such anomalies during version determination, **emphasize in your response**:

```
⚠️  **VERSIONING ANOMALY DETECTED**

Schema: {SCHEMA_NAME} (e.g., rights)
Product: {PROD_LATEST}  (base {PROD_BASE})
ALR:     {ALR_LATEST}   (base {ALR_BASE})
TMB:     {TMB_LATEST}   (base {TMB_BASE})

Root cause: Historical versioning errors from previous changes. The special rule for 
"Customization Base Version Higher Than Product Version" applies here.

Consequence: Any new product script MUST use version V{MAX_CUSTOM_BASE + 1} to avoid 
Flyway execution-order conflicts.
```

This highlights that the versioning is **not normal** and stems from legacy data quality issues that developers should be aware of when working with this module.

## Product Script Overrides in Customizations

Customization modules may contain SQL files with the **exact same version and name** as a product script. These files **override** the product script for that customization — most commonly by being **empty**, effectively disabling the execution of the product script in that customization context.

### Key Rules

- **Same filename as product**: The override file has the identical version number and description as the corresponding product script (e.g., `V386__Update_dictionary_values_IMP_UPLOAD_FILES_TO_BANK.sql`).
- **Empty file = disabled**: An empty customization script means the product script is intentionally suppressed and will not run for that customization.
- **Language directory scope**: Override scripts only apply to the language directory they are placed in. If a language directory (e.g., `PL/`) does **not exist** in the customization module, the product scripts for that language are not executed at all in that customization — no override file is needed.

### Example

Product scripts:
- `ccb-payments-composite/.../languages/EN/V386__Update_dictionary_values_IMP_UPLOAD_FILES_TO_BANK.sql` ← has content
- `ccb-payments-composite/.../languages/TH/V388__Update_dictionary_values_IMP_UPLOAD_FILES_TO_BANK.sql` ← has content
- `ccb-payments-composite/.../languages/PL/V386__Update_dictionary_values_IMP_UPLOAD_FILES_TO_BANK.sql` ← has content

TMB customization overrides:
- `customizations-tmb/.../languages/EN/V386__Update_dictionary_values_IMP_UPLOAD_FILES_TO_BANK.sql` ← **empty** (disables EN product script)
- `customizations-tmb/.../languages/TH/V388__Update_dictionary_values_IMP_UPLOAD_FILES_TO_BANK.sql` ← **empty** (disables TH product script)
- `customizations-tmb/.../languages/PL/` ← **directory does not exist** → PL product script is not executed in TMB at all

### When Scanning for Existing Versions

When scanning customization directories for existing versions, be aware that some files matching `V*.sql` may be **product override files** (same version as product, typically empty). These should **not** be confused with regular customization-versioned scripts (e.g., `V593.0.1__...sql`) when determining the next customization version.