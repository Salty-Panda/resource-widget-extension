# Panda's Box of Fluff — Chrome Extension

A structured, ID-driven resource management system that replaces Chrome bookmarks with deduplication, redundancy, and broken-link recovery.

---

## Quick Start

### Load in Chrome
1. Open `chrome://extensions`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked**
4. Select the `extension/` folder

---

## Features

### Popup (click the extension icon on any page)

| Situation | What you see |
|---|---|
| Chrome internal page | "Cannot be tracked" message |
| URL already tracked | Resource card + quick tag/rating editor |
| URL's ID matches an existing resource but URL not yet linked | Warning indicator + resource preview + "Add this URL" action |
| Completely new URL | "Add Resource" form with auto-detected ID |

All states run tag detection immediately on open — detected tags appear as chips before the user confirms anything.

### Dashboard (`⊞` button in popup, or open `dashboard/dashboard.html` directly)

**Search & Filter**
- Full-text search by ID, title, URL, or tag alias (live, debounced)
- Tag filter with autocomplete — type to search all Tag Group aliases, select as chips (AND logic)
- Tag exclusion filter — same chip autocomplete, NOT logic
- Minimum rating filter
- Pattern-IDs-only toggle
- Sort by: last modified, created, rating, or ID

**Resource management**
- Edit ID, URLs, titles, tags, and rating inline via modal
- Merge two resources with full preview before committing
- Delete resources
- Open any resource in incognito (reuses existing incognito window if one is open)

**Random unrated** (`🎲 Random` button) — picks the oldest of 3 randomly selected unrated resources and opens it in incognito

**Import** (Chrome bookmarks)
- Displays bookmarks as an expandable tree with tri-state checkboxes
- User selects exactly which folders/bookmarks to import
- Folder names become tags (root and browser-level folders ignored)
- Preserves bookmark creation/modification dates

**Migration Wizard** — generate new URLs for ID-based resources from templates
1. Define one or more URL templates using `{ID}` as placeholder (e.g. `https://example.com/browse/{ID}`)
2. Preview generated URLs across all eligible resources
3. Optionally validate a sample via HEAD requests
4. Apply — adds new URLs non-destructively, existing URLs are never removed

**Tag Groups** — manage tag aliases, rename labels, merge groups

**Bulk URL removal** — remove all URLs matching one or more domains from every resource at once

**Priority Domains** (`⚙ Settings`) — ordered list of preferred domains used when selecting which URL to open; within the same domain tier the longest (most specific) URL is preferred; fallback also picks the longest URL overall

**Backup / Restore** — full JSON export (`pbf-backup-YYYY-MM-DD.json`) and import with merge or replace modes

---

## Data Model

### Resource

```
Resource {
  id:          string          // Normalized uppercase (e.g. ABC-123 or custom name)
  isPatternId: boolean         // true if id matches \w{2,8}-\d{3,5}
  urls:        string[]        // Deduplicated set of normalized URLs (case-insensitive)
  titles:      string[]        // Deduplicated page titles (auto-fetched + manual)
  tags:        string[]        // Tag Group IDs — never raw strings
  rating:      1|2|3|4|5|null
  createdAt:   number          // ms timestamp
  updatedAt:   number          // ms timestamp
}
```

### Tag Groups

Tags are not stored as raw strings. Each tag is a **Tag Group**:

```
TagGroup {
  id:           string    // internal key, e.g. "tg_1700000000_abc12"
  primaryLabel: string    // label shown in UI
  aliases:      string[]  // all equivalent labels (includes primaryLabel)
  createdAt:    number
  updatedAt:    number
}
```

Resources store Tag Group IDs in their `tags` array. When assigning a tag, all aliases are checked — an existing group is reused on match; otherwise a new group is created.

### ID rules
- Pattern: `\w{2,8}-\d{3,5}` — prefix may contain letters, digits, or underscores
- Examples: `ABC-123`, `380sqb-139`, `MY_PROJ-4567`
- Case-insensitive: `AAA-123 = aaa-123`, but `AA-123 ≠ AAA-123`
- A URL containing multiple IDs is treated as a manual-name resource

### URL handling
- Stored with original casing; compared and indexed **case-insensitively**
- Fragment (`#hash`) stripped; trailing slash stripped from non-root paths
- Duplicates are silently discarded on every write path

### Auto-merge
Adding a URL whose extracted ID matches an existing resource automatically links the URL to that resource without creating a duplicate.

---

## Tag Detection

When the popup opens on a tracked page the extension scans the page for **structured label-value content** (tables, definition lists, `label`+sibling patterns) and checks values against all Tag Group aliases. Matches surface as "detected" chips the user can confirm or remove before saving.

Rules:
- Only **values** in structured data are tested, never label text
- Matching is case-insensitive and word-boundary strict (no partial substrings)
- No new Tag Groups are ever created automatically

---

## Migration Wizard

Generates new URLs for resources that have a pattern ID using URL templates.

**Template syntax:** any URL containing `{ID}`, e.g. `https://archive.example.com/{ID}`

**Workflow:**
1. Enter one or more templates
2. Preview — every (resource × template) pair, flagging already-present URLs
3. Validate *(optional)* — HEAD-tests a random sample, shows success %
4. Confirm — adds generated URLs non-destructively; existing URLs are untouched
5. Resources without a pattern ID are skipped entirely

---

## File Structure

```
extension/
├── manifest.json
├── create_icons.py          ← regenerate icons (requires Pillow)
├── icons/                   ← PNG icons: 16, 48, 128 px
├── src/
│   ├── constants.js         ID regex, storage keys (pbf_*), message types
│   ├── id-extractor.js      ID detection, normalization, pattern test
│   ├── url-utils.js         URL normalization, urlKey, domain helpers, priority sort
│   ├── rate-limiter.js      Async rate-limiting queue (title fetching)
│   ├── resource-manager.js  Core CRUD, search, merge, bulk import
│   ├── tag-group-manager.js Tag Group CRUD, alias matching, merge, detection
│   ├── import-manager.js    Chrome bookmarks → resources (tree + tag extraction)
│   ├── migration-manager.js Template-based URL generation + validation
│   └── backup-manager.js    JSON export/import
├── background/
│   └── service-worker.js    Auto-title fetching, badge updates, message API
├── popup/
│   ├── popup.html
│   ├── popup.css
│   └── popup.js             Chip-based tag input, all popup states
└── dashboard/
    ├── dashboard.html
    ├── dashboard.css
    └── dashboard.js         Full management UI
```

---

## Storage

All data is stored locally via `chrome.storage.local`. Nothing is sent to any server.

| Key | Contents |
|---|---|
| `pbf_resources_v1` | `{ [id]: Resource }` — all resources |
| `pbf_url_index_v1` | `{ [urlKey]: resourceId }` — fast URL lookup (lowercase-keyed) |
| `pbf_tag_groups_v1` | `{ [id]: TagGroup }` — all tag groups |
| `pbf_pending_tags_v1` | `{ [resourceId]: tagGroupId[] }` — tags detected by service worker, awaiting user review |
| `pbf_settings_v1` | `{ priorityDomains, titleFetchEnabled, titleFetchDelay }` |

On first run after upgrading from the previous version, all `rim_*` keys are automatically migrated to `pbf_*` and deleted.

---

## Permissions

| Permission | Reason |
|---|---|
| `storage` + `unlimitedStorage` | Store up to ~10 k resources locally |
| `tabs` | Read URL/title from active tab; update badge |
| `activeTab` | Popup access to current tab content |
| `bookmarks` | Read Chrome bookmark tree for import |
| `scripting` | Inject page-structure extractor for tag detection |
| `windows` | Open / reuse incognito windows |
| `<all_urls>` | Background title fetching and migration URL validation |

---

## Performance

Designed for ~10 000 resources. All filtering and search run in-memory after a single load from `chrome.storage.local`. The dashboard paginates results (50 per page) to keep rendering fast.