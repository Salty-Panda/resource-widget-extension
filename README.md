# Resource ID Manager (RIM) — Chrome Extension

A structured, ID-driven resource management system that replaces Chrome bookmarks with redundancy, deduplication, and broken-link recovery.

---

## Quick Start

### 1. Generate icons
```powershell
cd C:\Repozytoria\extension
.\create-icons.ps1
```

### 2. Load in Chrome
1. Open `chrome://extensions`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked**
4. Select the `C:\Repozytoria\extension` folder

---

## Features

### Popup (click the extension icon on any page)
| Situation | What you see |
|---|---|
| URL not tracked | "Add Resource" form with auto-detected ID |
| URL's ID matches an existing resource | "Link this URL" prompt |
| URL already tracked | Resource info + quick tag/rating edit |
| Chrome internal page | "Cannot be tracked" message |

### Dashboard (`⊞` button in popup)
- **Search** — by ID, title, tag, or URL (live, debounced)
- **Filter** — by tags (AND logic), exclude tags (NOT logic), minimum rating, pattern-ID-only
- **Sort** — last modified, created, rating, alphabetical
- **Resource editing** — IDs, URLs, titles, tags, rating
- **Merge tool** — combine two resources with preview
- **Import** — Chrome bookmarks (folder names → tags)
- **Migration Wizard** — define source→target URL patterns, validate, apply
- **Backup / Restore** — JSON export/import

---

## Data Model

```
Resource {
  id:          string          // Normalized uppercase (ABC-123 or custom name)
  isPatternId: boolean         // true if matches \w{2,5}-\d{3,5}
  urls:        string[]        // Unique set of URLs
  titles:      string[]        // Page titles (auto-fetched + manual)
  tags:        string[]        // Flat user-defined tags
  rating:      1|2|3|4|5|null
  createdAt:   timestamp (ms)
  updatedAt:   timestamp (ms)
}
```

### ID rules
- Pattern: `\w{2,8}-\d{3,5}` (case-insensitive, stored uppercase)
- Prefix can be letters, digits, or mixed: `ABC-123`, `380sqb-139`, `MY_PROJ-4567`
- `AAA-123 = aaa-123`, but `AA-123 ≠ AAA-123`
- Multiple IDs in one URL → treated as manual-name resource

### Auto-merge
When you add a URL containing an already-known ID (e.g. `ABC-123`), it is automatically merged into the existing resource.

---

## Migration Wizard

1. **Define rule** — source pattern (`https://old.site/{ID}`) → target template (`https://new.site/{ID}`)
2. **Preview** — shows which resources are affected and the generated URLs
3. **Validate** *(optional)* — HEAD-requests a random sample; shows success rate
4. **Apply** — adds new URLs non-destructively (old URLs preserved)

---

## File Structure

```
extension/
├── manifest.json
├── create-icons.ps1        ← run this once to generate icons
├── icons/                  ← generated PNG icons
├── src/
│   ├── constants.js        ID regex, storage keys, message types
│   ├── id-extractor.js     ID detection & normalization
│   ├── url-utils.js        URL normalization & helpers
│   ├── rate-limiter.js     Async rate-limiting queue
│   ├── resource-manager.js Core CRUD, search, merge
│   ├── import-manager.js   Chrome bookmarks import
│   ├── migration-manager.js Migration rules engine
│   └── backup-manager.js   JSON export/import
├── background/
│   └── service-worker.js   Auto-title harvesting, badge, message API
├── popup/
│   ├── popup.html/css/js   Extension popup
└── dashboard/
    ├── dashboard.html/css/js  Full management dashboard
```

---

## Permissions Used

| Permission | Reason |
|---|---|
| `storage` + `unlimitedStorage` | Store up to ~10k resources locally |
| `tabs` | Read URL/title from active tab; badge updates |
| `activeTab` | Popup access to current tab |
| `bookmarks` | Import Chrome bookmarks |
| `scripting` | Reserved for future content scripts |
| `<all_urls>` | Background title fetching via `fetch()` |

All data is stored **locally**. Nothing is sent to external servers.

---

## Performance

Designed for ~10 000 resources. All filtering/search is done in-memory (loaded from `chrome.storage.local` on page open). For very large datasets the dashboard uses pagination (50 per page).