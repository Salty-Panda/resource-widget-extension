import { extractIdFromUrl } from './id-extractor.js';
import { isValidUrl } from './url-utils.js';
import { STORAGE_KEYS } from './constants.js';

/**
 * Imports Chrome bookmarks into a ResourceManager.
 * Folder names become tags.
 */
export class ImportManager {
  /**
   * @param {import('./resource-manager.js').ResourceManager} rm
   * @param {import('./tag-group-manager.js').TagGroupManager} tgm
   */
  constructor(rm, tgm) {
    this.rm  = rm;
    this.tgm = tgm;
  }

  // ─── Import State ────────────────────────────────────────────────────────────

  /**
   * Load per-folder import state from storage.
   * Shape: { [folderNodeId]: { count, lastUrl, ts, title } }
   * @returns {Promise<object>}
   */
  async loadImportState() {
    const data = await chrome.storage.local.get(STORAGE_KEYS.IMPORT_STATE);
    return data[STORAGE_KEYS.IMPORT_STATE] || {};
  }

  /**
   * Persist per-folder import state.
   * @param {object} state
   */
  async saveImportState(state) {
    await chrome.storage.local.set({ [STORAGE_KEYS.IMPORT_STATE]: state });
  }

  /** Clear all stored import state (e.g. to reset fast-path tracking). */
  async clearImportState() {
    await chrome.storage.local.remove(STORAGE_KEYS.IMPORT_STATE);
  }

  // ─── Grouped / incremental import ────────────────────────────────────────────

  /**
   * State-aware grouped import with per-folder fast-path optimisation.
   *
   * For each fully-selected folder whose state is already stored:
   *   1. Compare current leaf count with stored count.
   *   2. If count grew (append-only pattern) and the last-processed URL still
   *      matches → skip the first N items (fast path).
   *   3. If the folder shrank or the URL does not match → fall back to full scan.
   *
   * Partially-selected folders always use full scan (URL-based deduplication
   * inside rm.addUrl prevents duplicates).
   *
   * @param {Array<{
   *   folderId:      string,                              // stable nodeId, e.g. "f_123"
   *   folderTitle:   string,
   *   orderedLeaves: {url,title,tags,dateAdded}[],        // ALL direct-child leaves, in tree order
   *   selectedLeaves:{url,title,tags,dateAdded}[],        // only the selected subset
   *   allSelected:   boolean,
   * }>} groups
   * @param {{ forceFull?: boolean, onProgress?: (done:number, total:number)=>void }} options
   * @returns {Promise<{ imported:number, merged:number, skipped:number, fastPathSkipped:number, mode:'incremental'|'full' }>}
   */
  async importSelectedGrouped(groups, options = {}) {
    const { forceFull = false, onProgress } = options;
    const storedState = await this.loadImportState();
    const newState    = { ...storedState };

    let imported = 0, merged = 0, skipped = 0, fastPathSkipped = 0;
    let anyIncremental = false;

    // Build the de-duplicated processing list, applying fast-path per folder
    const toProcess = [];

    for (const group of groups) {
      const { folderId, folderTitle, orderedLeaves, selectedLeaves, allSelected } = group;

      let startIndex = 0;

      if (!forceFull && allSelected && orderedLeaves.length > 0) {
        const fs = storedState[folderId];
        if (fs && fs.count > 0) {
          const storedCount  = fs.count;
          const currentCount = orderedLeaves.length;

          if (currentCount >= storedCount) {
            // Validate by checking that the item at (storedCount-1) still has the same URL
            const expectedItem = orderedLeaves[storedCount - 1];
            const urlMatches   = expectedItem &&
              expectedItem.url.toLowerCase() === (fs.lastUrl || '').toLowerCase();

            if (urlMatches) {
              startIndex       = storedCount;
              fastPathSkipped += storedCount;
              anyIncremental   = true;
            }
            // urlMatches === false → validation failed → full scan (startIndex stays 0)
          }
          // currentCount < storedCount → folder shrank → full scan
        }
      }

      if (allSelected) {
        for (const item of orderedLeaves.slice(startIndex)) toProcess.push(item);
        // Always update state for fully-selected folders (captures current count)
        if (orderedLeaves.length > 0) {
          newState[folderId] = {
            count:   orderedLeaves.length,
            lastUrl: orderedLeaves[orderedLeaves.length - 1].url,
            ts:      Date.now(),
            title:   folderTitle,
          };
        }
      } else {
        // Partial selection: process only selected leaves, no state update
        for (const item of selectedLeaves) toProcess.push(item);
      }
    }

    // Process all collected items
    const total = toProcess.length;
    for (let i = 0; i < total; i++) {
      const { url, title, tags: rawLabels, dateAdded } = toProcess[i];
      try {
        const tagIds = rawLabels.map(label => this.tgm.getOrCreate(label).id);
        const result = await this.rm.addUrl(url, { tags: tagIds, title, createdAt: dateAdded || null });
        if (result.created) imported++;
        else if (result.merged) merged++;
        else skipped++;
      } catch { skipped++; }
      onProgress?.(i + 1, total);
    }

    await this.tgm.save();
    await this.saveImportState(newState);

    return {
      imported,
      merged,
      skipped,
      fastPathSkipped,
      mode: anyIncremental ? 'incremental' : 'full',
    };
  }

  /**
   * Fetch the Chrome bookmarks tree.
   * @returns {Promise<chrome.bookmarks.BookmarkTreeNode[]>}
   */
  async getBookmarkTree() {
    return new Promise((resolve, reject) => {
      chrome.bookmarks.getTree((tree) => {
        if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
        else resolve(tree);
      });
    });
  }

  /**
   * Flatten the bookmark tree into an array of { url, title, tags }.
   * Folder names become tags ONLY from depth >= 2:
   *   depth 0 — Chrome root node (ignored)
   *   depth 1 — Chrome top-level sections: "Bookmarks bar", "Other bookmarks", etc. (ignored)
   *   depth 2+ — user-defined folders → tag
   * @param {chrome.bookmarks.BookmarkTreeNode[]} nodes
   * @param {string[]} parentTags   accumulated folder-name tags
   * @param {number}   depth        current tree depth (default 0)
   * @returns {{ url:string, title:string, tags:string[] }[]}
   */
  flattenTree(nodes, parentTags = [], depth = 0) {
    const items = [];
    for (const node of nodes) {
      if (node.url) {
        if (isValidUrl(node.url)) {
          items.push({
            url:       node.url,
            title:     node.title || '',
            tags:      [...parentTags],
            dateAdded: node.dateAdded || null,   // ms since epoch, provided by Chrome
          });
        }
      } else if (node.children) {
        const folderTag  = (node.title || '').trim();
        // Only add folder as tag starting at depth 2 (user-defined folders)
        const addAsTag   = depth >= 2 && folderTag.length > 0;
        const nextTags   = addAsTag ? [...parentTags, folderTag] : [...parentTags];
        items.push(...this.flattenTree(node.children, nextTags, depth + 1));
      }
    }
    return items;
  }

  /**
   * Import all bookmarks. Resolves folder-name tags to Tag Group IDs.
   * @param {{ onProgress?: (done:number, total:number) => void }} options
   * @returns {Promise<{ imported:number, merged:number, skipped:number }>}
   */
  async importAll(options = {}) {
    const tree  = await this.getBookmarkTree();
    const items = this.flattenTree(tree);
    const total = items.length;
    let imported = 0, merged = 0, skipped = 0;

    for (let i = 0; i < items.length; i++) {
      const { url, title, tags: rawLabels, dateAdded } = items[i];
      try {
        const tagIds = rawLabels.map(label => this.tgm.getOrCreate(label).id);
        const result = await this.rm.addUrl(url, {
          tags:      tagIds,
          title,
          createdAt: dateAdded || null,
        });
        if (result.created) imported++;
        else if (result.merged) merged++;
        else skipped++;
      } catch {
        skipped++;
      }
      options.onProgress?.(i + 1, total);
    }

    await this.tgm.save(); // persist any newly created Tag Groups
    return { imported, merged, skipped };
  }

  /**
   * Preview import: return flattened items WITHOUT writing to storage.
   * Tags are returned as raw label strings (not IDs) for display purposes.
   */
  async preview() {
    const tree  = await this.getBookmarkTree();
    const items = this.flattenTree(tree);
    return items.map(item => ({
      ...item,
      detectedId: extractIdFromUrl(item.url),
    }));
  }

  /**
   * Build a nested display tree from the raw Chrome bookmark tree.
   * Each node: { nodeId, title, url, isFolder, children, parentTags, dateAdded }
   *   - nodeId:     unique string identifier for DOM / state tracking
   *   - parentTags: accumulated folder labels at depth >= 2 (used as tags on import)
   *   - depth 0     Chrome synthetic root  → skipped (children flattened up)
   *   - depth 1     System folders (Bookmarks bar, etc.) → shown, not tagged
   *   - depth >= 2  User-defined folders → shown AND tagged
   * @param {chrome.bookmarks.BookmarkTreeNode[]} nodes
   * @param {number}   depth
   * @param {string[]} parentTags
   * @returns {object[]}
   */
  buildDisplayTree(nodes, depth = 0, parentTags = []) {
    const result = [];
    for (const node of nodes) {
      if (node.url) {
        // Bookmark leaf
        if (isValidUrl(node.url)) {
          result.push({
            nodeId:     `bm_${node.id}`,
            title:      node.title || node.url,
            url:        node.url,
            isFolder:   false,
            children:   [],
            parentTags: [...parentTags],
            dateAdded:  node.dateAdded  || null,
          });
        }
      } else if (node.children) {
        const folderLabel = (node.title || '').trim();
        const addAsTag    = depth >= 2 && folderLabel.length > 0;
        const childTags   = addAsTag ? [...parentTags, folderLabel] : [...parentTags];
        if (depth >= 1) {
          // Show this folder in the tree
          result.push({
            nodeId:     `f_${node.id}`,
            title:      folderLabel || 'Folder',
            url:        null,
            isFolder:   true,
            isTaggable: addAsTag,
            children:   this.buildDisplayTree(node.children, depth + 1, childTags),
            parentTags: [...parentTags],
            dateAdded:  node.dateAdded || null,
          });
        } else {
          // depth 0 = Chrome root wrapper: flatten its children
          result.push(...this.buildDisplayTree(node.children, depth + 1, childTags));
        }
      }
    }
    return result;
  }

  /**
   * Import only the provided selection of bookmark items.
   * Each item: { url, title, tags: string[], dateAdded }
   * Tags are raw folder-name strings that are resolved to Tag Group IDs here.
   * @param {{ url:string, title:string, tags:string[], dateAdded:number|null }[]} selectedItems
   * @param {{ onProgress?: (done:number, total:number) => void }} options
   * @returns {Promise<{ imported:number, merged:number, skipped:number }>}
   */
  async importSelected(selectedItems, options = {}) {
    const total = selectedItems.length;
    let imported = 0, merged = 0, skipped = 0;
    for (let i = 0; i < total; i++) {
      const { url, title, tags: rawLabels, dateAdded } = selectedItems[i];
      try {
        const tagIds = rawLabels.map(label => this.tgm.getOrCreate(label).id);
        const result = await this.rm.addUrl(url, {
          tags:      tagIds,
          title,
          createdAt: dateAdded || null,
        });
        if (result.created) imported++;
        else if (result.merged) merged++;
        else skipped++;
      } catch { skipped++; }
      options.onProgress?.(i + 1, total);
    }
    await this.tgm.save();
    return { imported, merged, skipped };
  }
}