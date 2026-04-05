import { STORAGE_KEYS, DEFAULT_SETTINGS } from './constants.js';
import { extractIdFromUrl, isPatternId, normalizeId } from './id-extractor.js';
import { normalizeUrl } from './url-utils.js';

/**
 * Core resource management class.
 *
 * Storage schema (chrome.storage.local):
 *   rim_resources_v1 : { [normalizedId: string]: Resource }
 *   rim_url_index_v1 : { [normalizedUrl: string]: normalizedId }
 *   rim_settings_v1  : Settings
 *
 * Resource shape:
 * {
 *   id:          string,          // normalized uppercase key
 *   isPatternId: boolean,         // true if matches \w{2,5}-\d{3,5}
 *   urls:        string[],        // unique set of normalized URLs
 *   titles:      string[],        // unique set of page titles
 *   tags:        string[],        // flat, user-defined
 *   rating:      number|null,     // 1–5 or null
 *   createdAt:   number,          // ms timestamp
 *   updatedAt:   number,
 * }
 */
export class ResourceManager {
  constructor() {
    this.resources = {};
    this.urlIndex  = {};
    this.settings  = { ...DEFAULT_SETTINGS };
    this._ready    = false;
  }

  // ─── Lifecycle ─────────────────────────────────────────────────────────────

  async initialize() {
    const data = await chrome.storage.local.get([
      STORAGE_KEYS.RESOURCES,
      STORAGE_KEYS.URL_INDEX,
      STORAGE_KEYS.SETTINGS,
    ]);
    this.resources = data[STORAGE_KEYS.RESOURCES] || {};
    this.urlIndex  = data[STORAGE_KEYS.URL_INDEX]  || {};
    this.settings  = { ...DEFAULT_SETTINGS, ...(data[STORAGE_KEYS.SETTINGS] || {}) };
    this._ready    = true;
  }

  /** Persist resources + URL index in one atomic write. */
  async save() {
    await chrome.storage.local.set({
      [STORAGE_KEYS.RESOURCES]: this.resources,
      [STORAGE_KEYS.URL_INDEX]:  this.urlIndex,
    });
  }

  async saveSettings() {
    await chrome.storage.local.set({ [STORAGE_KEYS.SETTINGS]: this.settings });
  }

  // ─── Read helpers ───────────────────────────────────────────────────────────

  getResourceByUrl(url) {
    const id = this.urlIndex[normalizeUrl(url)];
    return id ? (this.resources[id] ?? null) : null;
  }

  getResourceById(id) {
    return this.resources[normalizeId(id)] ?? null;
  }

  getAllResources() {
    return Object.values(this.resources);
  }

  getCount() {
    return Object.keys(this.resources).length;
  }

  getAllTags() {
    const s = new Set();
    for (const r of Object.values(this.resources)) r.tags.forEach(t => s.add(t));
    return [...s].sort((a, b) => a.localeCompare(b));
  }

  // ─── Write operations ───────────────────────────────────────────────────────

  /**
   * Add a URL to the system, creating or merging a resource as needed.
   *
   * Decision tree:
   *   1. URL already in index → update metadata, return existing resource
   *   2. URL has extractable ID and resource with that ID exists → add URL to it (auto-merge)
   *   3. URL has extractable ID, no resource yet → create resource with that ID
   *   4. No ID → create resource with provided name / generated fallback
   *
   * @param {string} url
   * @param {{ tags?:string[], rating?:number|null, title?:string, name?:string }} options
   * @returns {{ resource: Resource, created: boolean, merged: boolean }}
   */
  async addUrl(url, options = {}) {
    const nUrl  = normalizeUrl(url);
    const { tags = [], rating = null, title = null, name = null } = options;

    // 1. URL already known
    const existingId = this.urlIndex[nUrl];
    if (existingId && this.resources[existingId]) {
      const res = this.resources[existingId];
      let changed = false;
      if (tags.length)  { res.tags   = [...new Set([...res.tags,   ...tags])];  changed = true; }
      if (rating != null && res.rating !== rating) { res.rating = rating;        changed = true; }
      if (title && !res.titles.includes(title))   { res.titles  = [...new Set([...res.titles, title])]; changed = true; }
      if (changed) { res.updatedAt = Date.now(); await this.save(); }
      return { resource: res, created: false, merged: false };
    }

    const extractedId = extractIdFromUrl(nUrl);

    // 2 & 3. ID-based resource
    if (extractedId) {
      if (this.resources[extractedId]) {
        // auto-merge: add URL to existing resource
        const res = this.resources[extractedId];
        if (!res.urls.includes(nUrl)) res.urls.push(nUrl);
        this.urlIndex[nUrl] = extractedId;
        if (tags.length)  res.tags   = [...new Set([...res.tags,   ...tags])];
        if (rating != null) res.rating = rating;
        if (title && !res.titles.includes(title)) res.titles = [...new Set([...res.titles, title])];
        res.updatedAt = Date.now();
        await this.save();
        return { resource: res, created: false, merged: true };
      }
      // Create new resource with extracted ID
      return this._createResource(extractedId, nUrl, { tags, rating, title });
    }

    // 4. Manual-name resource
    let rawId = name || title || `UNNAMED_${Date.now()}`;
    let resourceId = normalizeId(rawId);
    // Ensure uniqueness for manual names
    if (this.resources[resourceId]) {
      let n = 2;
      while (this.resources[`${resourceId}_${n}`]) n++;
      resourceId = `${resourceId}_${n}`;
    }
    return this._createResource(resourceId, nUrl, { tags, rating, title });
  }

  async _createResource(id, url, { tags = [], rating = null, title = null } = {}) {
    const now = Date.now();
    const resource = {
      id,
      isPatternId: isPatternId(id),
      urls:        url ? [url] : [],
      titles:      title ? [title] : [],
      tags:        [...new Set(tags)],
      rating,
      createdAt:   now,
      updatedAt:   now,
    };
    this.resources[id] = resource;
    if (url) this.urlIndex[url] = id;
    await this.save();
    return { resource, created: true, merged: false };
  }

  /**
   * Append a title to the resource containing this URL (idempotent).
   * @param {string} url
   * @param {string} title
   */
  async addTitle(url, title) {
    if (!title?.trim()) return;
    const res = this.getResourceByUrl(url);
    if (!res) return;
    const t = title.trim();
    if (!res.titles.includes(t)) {
      res.titles   = [...new Set([...res.titles, t])];
      res.updatedAt = Date.now();
      await this.save();
    }
  }

  /**
   * Update arbitrary fields on a resource.
   * Handles 'urls' specially (keeps urlIndex in sync).
   * Handles 'id' rename (moves the resource key).
   * @param {string} resourceId
   * @param {Partial<Resource>} updates
   * @returns {Resource}
   */
  async updateResource(resourceId, updates) {
    const nid = normalizeId(resourceId);
    const res = this.resources[nid];
    if (!res) throw new Error(`Resource not found: ${resourceId}`);

    // ID rename
    if ('id' in updates) {
      const newId = normalizeId(updates.id);
      if (newId !== nid) {
        if (this.resources[newId]) throw new Error(`ID already exists: ${newId}`);
        res.id          = newId;
        res.isPatternId = isPatternId(newId);
        this.resources[newId] = res;
        delete this.resources[nid];
        for (const u of res.urls) this.urlIndex[u] = newId;
        delete updates.id;
      }
      const finalId = res.id;
      await this._applyFieldUpdates(this.resources[finalId], updates);
      await this.save();
      return this.resources[finalId];
    }

    await this._applyFieldUpdates(res, updates);
    await this.save();
    return res;
  }

  async _applyFieldUpdates(res, updates) {
    if ('urls' in updates) {
      const newUrls = [...new Set(updates.urls.map(normalizeUrl))];
      // Remove stale index entries
      for (const u of res.urls) if (!newUrls.includes(u)) delete this.urlIndex[u];
      // Add new entries
      for (const u of newUrls) this.urlIndex[u] = res.id;
      res.urls = newUrls;
    }
    if ('titles' in updates) res.titles = [...new Set(updates.titles)];
    if ('tags'   in updates) res.tags   = [...new Set(updates.tags)];
    if ('rating' in updates) res.rating = updates.rating;
    res.updatedAt = Date.now();
  }

  /**
   * Delete a resource and clean up the URL index.
   * @param {string} resourceId
   * @returns {boolean}
   */
  async deleteResource(resourceId) {
    const nid = normalizeId(resourceId);
    const res = this.resources[nid];
    if (!res) return false;
    for (const u of res.urls) delete this.urlIndex[u];
    delete this.resources[nid];
    await this.save();
    return true;
  }

  /**
   * Merge sourceId into targetId.
   * The merged resource keeps targetId (or resolvedId if provided).
   * Source is deleted.
   * @param {string} sourceId
   * @param {string} targetId
   * @param {string} [resolvedId]  final ID (defaults to targetId)
   * @returns {Resource}
   */
  async mergeResources(sourceId, targetId, resolvedId = null) {
    const ns = normalizeId(sourceId);
    const nt = normalizeId(targetId);
    const src = this.resources[ns];
    const tgt = this.resources[nt];
    if (!src) throw new Error(`Source not found: ${sourceId}`);
    if (!tgt) throw new Error(`Target not found: ${targetId}`);

    const finalId = resolvedId ? normalizeId(resolvedId) : nt;
    if (finalId !== nt && this.resources[finalId]) throw new Error(`ID conflict: ${finalId}`);

    const merged = {
      id:          finalId,
      isPatternId: isPatternId(finalId),
      urls:        [...new Set([...tgt.urls, ...src.urls])],
      titles:      [...new Set([...tgt.titles, ...src.titles])],
      tags:        [...new Set([...tgt.tags, ...src.tags])],
      rating:      tgt.rating ?? src.rating,
      createdAt:   Math.min(tgt.createdAt, src.createdAt),
      updatedAt:   Date.now(),
    };

    // Update URL index
    for (const u of merged.urls) this.urlIndex[u] = finalId;
    // Cleanup old URL index entries that aren't in merged
    for (const u of src.urls) { if (!merged.urls.includes(u)) delete this.urlIndex[u]; }

    delete this.resources[ns];
    delete this.resources[nt];
    this.resources[finalId] = merged;
    await this.save();
    return merged;
  }

  // ─── Search / filter / sort ──────────────────────────────────────────────────

  /**
   * @param {string} query       text to match against id, titles, tags, urls
   * @param {object} filters     { tags, excludeTags, minRating, patternOnly }
   * @param {string} sort        'updatedAt' | 'createdAt' | 'rating' | 'id'
   * @returns {Resource[]}
   */
  searchResources(query = '', filters = {}, sort = 'updatedAt') {
    let res = Object.values(this.resources);

    if (query.trim()) {
      const q = query.trim().toLowerCase();
      res = res.filter(r =>
        r.id.toLowerCase().includes(q) ||
        r.titles.some(t => t.toLowerCase().includes(q)) ||
        r.tags.some(t => t.toLowerCase().includes(q)) ||
        r.urls.some(u => u.toLowerCase().includes(q))
      );
    }

    const { tags = [], excludeTags = [], minRating = 0, patternOnly = false } = filters;

    if (tags.length)
      res = res.filter(r => tags.every(t => r.tags.includes(t)));

    if (excludeTags.length)
      res = res.filter(r => !excludeTags.some(t => r.tags.includes(t)));

    if (minRating > 0)
      res = res.filter(r => r.rating != null && r.rating >= minRating);

    if (patternOnly)
      res = res.filter(r => r.isPatternId);

    res.sort((a, b) => {
      switch (sort) {
        case 'rating':    return (b.rating || 0) - (a.rating || 0);
        case 'createdAt': return b.createdAt - a.createdAt;
        case 'id':        return a.id.localeCompare(b.id);
        default:          return b.updatedAt - a.updatedAt;
      }
    });

    return res;
  }

  // ─── Bulk import (used by ImportManager & BackupManager) ────────────────────

  /**
   * Import a single resource data object, merging if the ID already exists.
   * Does NOT save — caller must call save() after batch operations.
   * @param {{ id, urls, titles, tags, rating, createdAt, updatedAt }} data
   * @returns {Resource}
   */
  importResourceData(data) {
    const { urls = [], titles = [], tags = [], rating = null } = data;
    const nid = normalizeId(data.id);
    const nUrls = [...new Set(urls.map(normalizeUrl))];

    if (this.resources[nid]) {
      const r = this.resources[nid];
      for (const u of nUrls) { if (!r.urls.includes(u)) { r.urls.push(u); this.urlIndex[u] = nid; } }
      r.titles   = [...new Set([...r.titles, ...titles])];
      r.tags     = [...new Set([...r.tags,   ...tags])];
      if (rating && !r.rating) r.rating = rating;
      r.updatedAt = Date.now();
      return r;
    }

    const now = Date.now();
    const resource = {
      id: nid, isPatternId: isPatternId(nid),
      urls: nUrls, titles: [...new Set(titles)],
      tags: [...new Set(tags)], rating,
      createdAt: data.createdAt || now,
      updatedAt: data.updatedAt || now,
    };
    this.resources[nid] = resource;
    for (const u of nUrls) this.urlIndex[u] = nid;
    return resource;
  }
}