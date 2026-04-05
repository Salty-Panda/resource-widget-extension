import { extractIdFromUrl } from './id-extractor.js';
import { isValidUrl } from './url-utils.js';

/**
 * Imports Chrome bookmarks into a ResourceManager.
 * Folder names become tags.
 */
export class ImportManager {
  /**
   * @param {import('./resource-manager.js').ResourceManager} rm
   */
  constructor(rm) {
    this.rm = rm;
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
   * @param {chrome.bookmarks.BookmarkTreeNode[]} nodes
   * @param {string[]} parentTags   accumulated folder-name tags
   * @returns {{ url:string, title:string, tags:string[] }[]}
   */
  flattenTree(nodes, parentTags = []) {
    const items = [];
    for (const node of nodes) {
      if (node.url) {
        // Leaf bookmark
        if (isValidUrl(node.url)) {
          items.push({ url: node.url, title: node.title || '', tags: [...parentTags] });
        }
      } else if (node.children) {
        // Folder — its name becomes a tag for all descendants
        const folderTag = (node.title || '').trim();
        const nextTags  = folderTag ? [...parentTags, folderTag] : [...parentTags];
        items.push(...this.flattenTree(node.children, nextTags));
      }
    }
    return items;
  }

  /**
   * Import all bookmarks. Returns a summary object.
   * @param {{ onProgress?: (done:number, total:number) => void }} options
   * @returns {Promise<{ imported:number, merged:number, skipped:number }>}
   */
  async importAll(options = {}) {
    const tree  = await this.getBookmarkTree();
    const items = this.flattenTree(tree);
    const total = items.length;
    let imported = 0, merged = 0, skipped = 0;

    for (let i = 0; i < items.length; i++) {
      const { url, title, tags } = items[i];
      try {
        const result = await this.rm.addUrl(url, { tags, title });
        if (result.created) imported++;
        else if (result.merged) merged++;
        else skipped++;
      } catch {
        skipped++;
      }
      options.onProgress?.(i + 1, total);
    }
    return { imported, merged, skipped };
  }

  /**
   * Preview import: return flattened items WITHOUT writing to storage.
   * @returns {Promise<{ url:string, title:string, tags:string[], detectedId:string|null }[]>}
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