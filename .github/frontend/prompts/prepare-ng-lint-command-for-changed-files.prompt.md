# Prepare ng lint Commands for Changed Files

You are tasked with generating `ng lint` commands for changed files in an Angular workspace. The commands should be grouped by project and include all relevant files.

## Input Analysis

1. **Check for Git Commit in Context:**
   - If a git commit is provided in the conversation context, extract the list of changed files from that commit only
   - If NO commit is provided, execute `git status --porcelain` in the terminal to get locally changed files

2. **Filter Files:**
   - Only include files that are relevant for linting (`.ts`, `.html`, `.scss`, `.css` files)
   - Exclude files outside the `client/src/` directory
   - Exclude files from `i18n` directories
   - Exclude test files unless they contain linting errors

## Project Mapping

1. **Read angular.json:**
   - Parse the `angular.json` file from the workspace root
   - Extract project configurations and their source paths

2. **Map Files to Projects:**
   - For each changed file, determine which project it belongs to based on the `root` or `sourceRoot` field in angular.json
   - Group files by project name

## Expected Project Structure (from angular.json):
- `accounts-alr` → files in `client/src/accounts-app-alr/`
- `accounts` → files in `client/src/accounts-app/`
- `deposits-alr` → files in `client/src/deposits-app-alr/`
- `deposits` → files in `client/src/deposits-app/`

## Command Generation

For each project that has changed files:

1. Generate one `ng lint` command per project
2. Use the format: `ng lint <project-name> --lint-file-patterns="<file1>" --lint-file-patterns="<file2>" ...`
3. Each file should have its own `--lint-file-patterns` flag
4. Preserve the full relative path from workspace root for each file

## Output Format

Generate commands in the following format:

```bash
ng lint <project-name> --lint-file-patterns="<file1>" --lint-file-patterns="<file2>" --lint-file-patterns="<file3>"
```

If multiple projects have changes, generate separate commands for each:

```bash
ng lint accounts-alr --lint-file-patterns="client/src/accounts-app-alr/app/module1/file1.ts" --lint-file-patterns="client/src/accounts-app-alr/app/module2/file2.html"

ng lint accounts --lint-file-patterns="client/src/accounts-app/app/module1/file1.ts"

ng lint deposits-alr --lint-file-patterns="client/src/deposits-app-alr/app/component.ts"
```

## Important Notes

- If no lintable files are found, inform the user that there are no files to lint
- If a file cannot be mapped to any project, mention this to the user
- Sort files alphabetically within each project for consistency
- Do not include the same file twice in the same command
- Ensure file paths use forward slashes (/) even on Windows
