---
mode: agent
---

# Create Database Script

Before executing this prompt, fetch instructions file with versioning-rules available under directory which contains prompt files `_shared/db-script-versioning-rules.md` to understand the versioning patterns and rules.
Generate a database migration script with proper versioning based on the project structure and working directory.

## Requirements

Before running this prompt, the user must provide:

1. **Base Script Path**: The directory path where the new script should be created
   - Example (Product): `ccb-dictionaries-composite/ccb-dictionaries-composite-infrastructure/src/main/db/sql/dictionaries`
   - Example (ALR Customization): `customizations-alr/ccb-dictionaries-alr-composite/ccb-dictionaries-alr-composite-infrastructure/src/main/db/sql/dictionaries`
   - Example (TMB Customization): `customizations-tmb/ccb-dictionaries-tmb-composite/ccb-dictionaries-tmb-composite-infrastructure/src/main/db/sql/dictionaries`

2. **Script Purpose**: Description of what the database script should do

3. **Affected Table(s)**: Name of the main table(s) being created or modified

## Naming Convention

- Use descriptive names that clearly indicate the script's purpose
- Include the main table name being affected (in UPPERCASE)
- Use underscores to separate words
- Common prefixes:
    - `Create_table_` for new tables
    - `Alter_table_` for table modifications
    - `Drop_table_` for table removal
    - `Create_index_` for new indexes
    - `Update_` for data updates

## Naming Examples

### Product Scripts
```
V39__Create_table_CUSTOMER_PREFERENCES.sql
V40__Alter_table_ACCOUNTS_add_status_column.sql
V41__Create_index_IDX_ACCOUNTS_CUSTOMER_ID.sql
```

### Customization Scripts (ALR/TMB)
```
V39.0.1__Create_table_ALR_SPECIFIC_DATA.sql
V39.0.2__Alter_table_ACCOUNTS_add_alr_fields.sql
```

> **Note**: For versioning patterns, version calculation, and multi-language version sequencing, refer to `_shared/db-script-versioning-rules.md`.