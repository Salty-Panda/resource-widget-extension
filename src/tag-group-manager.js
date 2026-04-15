import { STORAGE_KEYS, LEGACY_STORAGE_KEYS } from './constants.js';

/**
 * Tag Group shape:
 * {
 *   id:           string,    // e.g. "tg_1700000000_abc12"
 *   primaryLabel: string,    // display name shown in UI
 *   aliases:      string[],  // all equivalent values (includes primaryLabel)
 *   createdAt:    number,
 *   updatedAt:    number,
 * }
 *
 * Resources store Tag Group IDs in their `tags` array, never raw strings.
 */
export class TagGroupManager {
  constructor() {
    this.tagGroups = {}; // { [id]: TagGroup }
  }

  // ─── Lifecycle ─────────────────────────────────────────────────────────────

  async initialize() {
    // One-time migration: move rim_tag_groups_v1 → pbf_tag_groups_v1 if needed.
    // ResourceManager handles resources/settings; we handle tag groups here.
    const legacy = await chrome.storage.local.get(LEGACY_STORAGE_KEYS.TAG_GROUPS);
    if (legacy[LEGACY_STORAGE_KEYS.TAG_GROUPS] != null) {
      await chrome.storage.local.set({
        [STORAGE_KEYS.TAG_GROUPS]: legacy[LEGACY_STORAGE_KEYS.TAG_GROUPS],
      });
      await chrome.storage.local.remove(LEGACY_STORAGE_KEYS.TAG_GROUPS);
    }

    const data = await chrome.storage.local.get(STORAGE_KEYS.TAG_GROUPS);
    this.tagGroups = data[STORAGE_KEYS.TAG_GROUPS] || {};
  }

  async save() {
    await chrome.storage.local.set({ [STORAGE_KEYS.TAG_GROUPS]: this.tagGroups });
  }

  // ─── Read helpers ───────────────────────────────────────────────────────────

  getAll() {
    return Object.values(this.tagGroups)
      .sort((a, b) => a.primaryLabel.localeCompare(b.primaryLabel));
  }

  getById(id) {
    return this.tagGroups[id] || null;
  }

  /**
   * Find a Tag Group whose aliases contain this label (case-insensitive exact match).
   * @param {string} label
   * @returns {TagGroup|null}
   */
  findByAlias(label) {
    const norm = label.trim().toLowerCase();
    return Object.values(this.tagGroups).find(tg =>
      tg.aliases.some(a => a.toLowerCase() === norm)
    ) || null;
  }

  // ─── Create / mutate ────────────────────────────────────────────────────────

  /**
   * Return the Tag Group whose aliases include `label`, or create one.
   * Does NOT auto-save — caller must call save() when done.
   */
  getOrCreate(label) {
    const trimmed = label.trim();
    if (!trimmed) throw new Error('Tag label cannot be empty');
    const existing = this.findByAlias(trimmed);
    if (existing) return existing;

    const id = `tg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const tg = {
      id,
      primaryLabel: trimmed,
      aliases:      [trimmed],
      createdAt:    Date.now(),
      updatedAt:    Date.now(),
    };
    this.tagGroups[id] = tg;
    return tg;
  }

  async addAlias(tagGroupId, alias) {
    const tg = this._get(tagGroupId);
    const trimmed = alias.trim();
    if (!trimmed) throw new Error('Alias cannot be empty');

    const conflict = this.findByAlias(trimmed);
    if (conflict && conflict.id !== tagGroupId)
      throw new Error(`"${trimmed}" already belongs to "${conflict.primaryLabel}"`);

    if (!tg.aliases.some(a => a.toLowerCase() === trimmed.toLowerCase())) {
      tg.aliases    = [...tg.aliases, trimmed];
      tg.updatedAt  = Date.now();
      await this.save();
    }
    return tg;
  }

  async removeAlias(tagGroupId, alias) {
    const tg = this._get(tagGroupId);
    if (tg.aliases.length <= 1) throw new Error('Cannot remove the last alias');

    tg.aliases = tg.aliases.filter(a => a !== alias);
    if (tg.primaryLabel === alias) tg.primaryLabel = tg.aliases[0];
    tg.updatedAt = Date.now();
    await this.save();
    return tg;
  }

  async renamePrimaryLabel(tagGroupId, newLabel) {
    const tg = this._get(tagGroupId);
    const trimmed = newLabel.trim();
    if (!trimmed) throw new Error('Label cannot be empty');

    // Keep old primary label as an alias so existing matches still work
    if (!tg.aliases.some(a => a.toLowerCase() === trimmed.toLowerCase())) {
      tg.aliases = [...tg.aliases, trimmed];
    }
    tg.primaryLabel = trimmed;
    tg.updatedAt    = Date.now();
    await this.save();
    return tg;
  }

  /**
   * Merge sourceId into targetId.
   * All resource tag references to sourceId are rewritten to targetId.
   * @param {string}   sourceId
   * @param {string}   targetId
   * @param {object[]} allResources — pass rm.resources (object) or array
   */
  async merge(sourceId, targetId, allResources) {
    const src = this._get(sourceId);
    const tgt = this._get(targetId);

    tgt.aliases  = [...new Set([...tgt.aliases, ...src.aliases])];
    tgt.updatedAt = Date.now();

    const resources = Array.isArray(allResources)
      ? allResources
      : Object.values(allResources);

    for (const res of resources) {
      if (!res.tags.includes(sourceId)) continue;
      res.tags = [...new Set(
        res.tags.filter(t => t !== sourceId).concat(
          res.tags.includes(targetId) ? [] : [targetId]
        )
      )];
      res.updatedAt = Date.now();
    }

    delete this.tagGroups[sourceId];
    await this.save();
    return tgt;
  }

  /**
   * Delete a Tag Group and remove its ID from all resources.
   * @param {string}   tagGroupId
   * @param {object[]} allResources
   */
  async delete(tagGroupId, allResources) {
    const resources = Array.isArray(allResources)
      ? allResources
      : Object.values(allResources);

    for (const res of resources) {
      if (res.tags.includes(tagGroupId)) {
        res.tags      = res.tags.filter(t => t !== tagGroupId);
        res.updatedAt = Date.now();
      }
    }
    delete this.tagGroups[tagGroupId];
    await this.save();
  }

  // ─── Text matching ───────────────────────────────────────────────────────────

  /**
   * Scan `text` for any Tag Group alias (word-bounded, case-insensitive).
   * Skips aliases shorter than 3 characters to avoid noise.
   * @param {string} text
   * @returns {{ tagGroup: TagGroup, matchedAlias: string }[]}
   */
  findMatchesInText(text) {
    if (!text) return [];
    const matches = [];
    for (const tg of Object.values(this.tagGroups)) {
      for (const alias of tg.aliases) {
        if (alias.length < 3) continue;
        // Word-boundary pattern; escape special regex chars in the alias
        const pattern = new RegExp(`(?<![\\w])${_escapeRegex(alias)}(?![\\w])`, 'i');
        if (pattern.test(text)) {
          matches.push({ tagGroup: tg, matchedAlias: alias });
          break; // one match per Tag Group is enough
        }
      }
    }
    return matches;
  }

  // ─── Migration ───────────────────────────────────────────────────────────────

  /**
   * Migrate / repair resource tags:
   *   1. Convert legacy flat-string tags (not starting with "tg_") to Tag Group IDs.
   *   2. Remove orphaned tg_… IDs — IDs that exist in a resource's tags array but
   *      have no corresponding entry in this.tagGroups (can happen when concurrent
   *      migrations in the dashboard and service worker race each other and their
   *      tgm.save() calls overwrite each other's newly-created groups).
   *
   * Mutates resources in-place. Does NOT save — caller saves both managers.
   * @param {object} resources  rm.resources (keyed object)
   * @returns {boolean}  true if any resource was changed
   */
  migrateResources(resources) {
    let migrated = false;
    for (const res of Object.values(resources)) {
      const hasFlatStrings  = res.tags.some(t => !t.startsWith('tg_'));
      const hasOrphanedIds  = res.tags.some(t => t.startsWith('tg_') && !this.tagGroups[t]);
      if (!hasFlatStrings && !hasOrphanedIds) continue;

      // 1. Convert flat strings → tag group IDs (getOrCreate is idempotent via alias check)
      // 2. Drop any tg_… ID that has no matching tag group
      const converted = res.tags.map(t =>
        t.startsWith('tg_') ? t : this.getOrCreate(t).id
      );
      res.tags      = [...new Set(converted.filter(t => this.tagGroups[t]))];
      res.updatedAt = Date.now();
      migrated      = true;
    }
    return migrated;
  }

  // ─── Private ─────────────────────────────────────────────────────────────────

  _get(id) {
    const tg = this.tagGroups[id];
    if (!tg) throw new Error(`Tag group not found: ${id}`);
    return tg;
  }
}

function _escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}