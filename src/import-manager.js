import { extractIdFromUrl } from './id-extractor.js';
import { isValidUrl } from './url-utils.js';

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