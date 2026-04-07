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
          items.push({ url: node.url, title: node.title || '', tags: [...parentTags] });
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
      const { url, title, tags: rawLabels } = items[i];
      try {
        // Resolve raw label strings → Tag Group IDs (create groups if needed)
        const tagIds = rawLabels.map(label => this.tgm.getOrCreate(label).id);
        const result = await this.rm.addUrl(url, { tags: tagIds, title });
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
}