---
mode: agent
---

# Update Database Script Versions

Before executing this prompt, fetch instructions file with versioning-rules available under directory which contains prompt files `_shared/db-script-versioning-rules.md` to understand the versioning patterns and rules.
Verify and update database migration script versions to ensure proper versioning and sequential order based on the project structure and existing scripts.

## Purpose

This prompt automatically:
1. Identifies database scripts that need version updates
2. Verifies that script versions follow the correct versioning pattern
3. Ensures proper sequential order across product and customization scripts
4. Fixes version numbers when necessary to maintain consistency

## Script Sources

Scripts are checked in the following priority order:

1. **Attached Context**: Scripts provided directly in the conversation or from attached files
2. **Git Staged/Uncommitted Changes**: New or modified scripts detected via a single git command on the current branch
3. **Difference from Main Branch**: If no scripts are found in attached context or uncommitted changes, compare current branch with the main branch (default: `develop`, or as specified in prompt context)

**IMPORTANT**: Only verify scripts from:
- Attached context provided in the conversation
- Current working branch (uncommitted/staged changes)
- Differences from main branch (if no uncommitted changes found)
- Do **NOT** search other branches or commits outside the diff range
- Do **NOT** switch branches to verify versions

## Verification Process

When verifying database script versions, follow these steps IN ORDER:

### Step 1: Collect Scripts to Verify

**SCOPE**: Verify scripts from attached context and current branch only. Do NOT access other branches or commits.

1. **Check attached context** for any database scripts (*.sql files) — this is the preferred source and requires no terminal commands.
2. **If no scripts in attached context**, run a single git command to find all changed SQL scripts (uncommitted, staged, and branch diff combined):
   ```bash
   git diff develop --name-status -- '*.sql'
   ```
   - Replace `develop` with the main branch specified in prompt context if different
   - This covers both uncommitted changes and branch differences in one call

⚠️ **DO NOT**:
- Run multiple separate git commands for the same purpose (status, diff, cached diff)
- Use `git log` to search other commits
- Switch to other branches
- Search in remote branches

### Step 2: Analyze Each Script Path

For each script found, determine:

1. **Script type** (Product, ALR Customization, or TMB Customization)
   - Check if path contains `customizations-alr/` → ALR Customization
   - Check if path contains `customizations-tmb/` → TMB Customization
   - Otherwise → Product script

2. **Module name** (e.g., dictionaries, accounts, permits) — extract from path structure

3. **Language** (if applicable) — check if script is in a language subdirectory (EN, PL, TH, etc.)

4. **Current version** from filename — extract version number from pattern `V{version}__...`

### Step 3: Determine Correct Version

For each script, determine the correct version by following the **Version Determination Process** from `_shared/db-script-versioning-rules.md`:

1. **Derive the product script path** (shared rules — Step 1)
2. **Find the latest product version** (shared rules — Step 2)
3. **Find the latest customization version** if applicable (shared rules — Step 3)
4. **Calculate the correct version** using the versioning patterns and formulas from the shared rules

#### Tool Preferences for Directory Scanning

**PREFERRED APPROACH**: Use file system tools (`list_dir`, `file_search`) to browse directories and read filenames — **no terminal command needed**.

- Use `list_dir` to browse `{product_schema_path}/languages/` and each language subdirectory
- Use `list_dir` to browse `{product_schema_path}/structure/` (if it exists)
- For customization scripts, also browse the customization `languages/` and `structure/` paths using `list_dir`
- Extract version prefixes from filenames and determine the highest version

**Important**:
- Search ONLY in files that exist in the current branch working directory
- If `structure/` does not exist, scan only language directories (and vice versa)


### Step 4: Compare and Report

For each script:

1. **Compare current version with expected version**
2. **Report findings**:
   - ✅ Version is correct
   - ⚠️ Version needs update (specify old → new)
   - ❌ Version conflicts with existing script
   - 🔄 Version needs adjustment due to other scripts in the same batch

3. **Group scripts by module and language** for better organization

### Step 5: Execute Corrections

If any scripts need version updates, proceed **immediately without asking for confirmation**:

1. **Rename files** using file system tools (rename/move file tool) — **no terminal `mv` command needed**

2. **If the renamed file was git-tracked** (i.e. it was not a new untracked file), update the git index with a single command:
   ```bash
   git add -A -- '*.sql'
   ```

3. **Report completion** with summary of changes made

## Output Format

### Verification Report

```
Database Script Version Verification Report
==========================================

Scripts Found: {count}
Sources: [Attached Context | Git Branch Diff]

Module: {module_name}
Language: {language}
Script Type: [Product | ALR Customization | TMB Customization]

Latest Product Version: V{version}
Latest Customization Version: V{version} (if applicable)

Script Analysis:
----------------

1. {script_name}
   Current Version: V{current}
   Expected Version: V{expected}
   Status: [✅ Correct | ⚠️ Needs Update | ❌ Conflict | 🔄 Batch Adjustment]
   Action: [None | Rename to {new_name}]

2. ...

Summary:
--------
✅ Correct: {count}
⚠️ Needs Update: {count}
❌ Conflicts: {count}
🔄 Batch Adjustments: {count}

Changes Made:
-------------
{old_filename} → {new_filename}
...
```

## Common Scenarios

### Scenario 1: New Product Scripts in Multiple Languages

User adds scripts for EN, PL, TH:
- `V594__Insert_dictionary_values_STATUS.sql` in EN
- `V594__Insert_dictionary_values_STATUS.sql` in PL
- `V594__Insert_dictionary_values_STATUS.sql` in TH

**Problem**: All have the same version
**Fix**: Each language needs its own sequential version
- EN: V594__Insert_dictionary_values_STATUS.sql
- PL: V595__Insert_dictionary_values_STATUS.sql
- TH: V596__Insert_dictionary_values_STATUS.sql

### Scenario 2: ALR Customization with Outdated Base Version

User adds ALR script:
- Current: `V592.0.9__Create_table_ALR_DATA.sql`
- Latest product version: V593
- Latest ALR version: V592.0.8

**Problem**: Using old product version as base
**Fix**: Update to use current product version
- New: `V593.0.1__Create_table_ALR_DATA.sql`

### Scenario 3: Mixed Product and Customization Scripts

User commits both product and customization scripts:
- Product: `V593__Create_table_CUSTOMER.sql`
- ALR: `V593.0.1__Alter_table_CUSTOMER.sql`

**Problem**: ALR script might conflict if product version increases
**Verification**: Ensure ALR script uses correct product version base
**Action**: If product script creates V594, update ALR to V594.0.1

## Common Mistakes to Avoid

❌ **DO NOT** run multiple terminal commands when file system tools suffice
- Wrong: Run `find` in terminal to list SQL files
- Correct: Use `list_dir` to browse language directories directly

❌ **DO NOT** ask for user confirmation before renaming — execute immediately

✅ **DO** always verify the latest product version first using file system tools
✅ **DO** consider all scripts in the same batch when assigning versions
✅ **DO** check for version conflicts before renaming files

> **Note**: For complete versioning rules (scope boundaries, calculation formulas, multi-language sequencing), refer to `_shared/db-script-versioning-rules.md`.

## Instructions

When this prompt is executed:

1. **Collect all scripts** from available sources (attached context preferred, then single git command)
2. **Analyze each script** following the verification process
3. **Determine correct versions** by browsing file system with `list_dir` — minimize terminal usage
4. **Generate a detailed report** with findings
5. **Execute corrections immediately** without asking for confirmation
   - ⚠️ **CRITICAL**: Update ONLY local files in the working directory
   - **DO NOT amend commits** — make changes only to uncommitted/untracked files
   - Use file system tools to rename files; fall back to terminal only if unavailable
6. **Provide final summary** of all changes made

⚠️ **Critical Constraints**:
- Only work with scripts from attached context and current working branch
- Do NOT access, search, or reference any other branches, commits, or history
- **DO NOT amend any commits** — all changes must be made to local files only
- **DO NOT use git commit --amend** or similar operations
- Changes should be to uncommitted files in the working directory