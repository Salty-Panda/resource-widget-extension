import { STORAGE_KEYS } from './constants.js';

const BACKUP_VERSION = 2;

/**
 * Handles JSON export/import of all PBF data.
 */
export class BackupManager {
  /**
   * @param {import('./resource-manager.js').ResourceManager} rm
   * @param {import('./tag-group-manager.js').TagGroupManager} [tgm]
   */
  constructor(rm, tgm = null) {
    this.rm  = rm;
    this.tgm = tgm;
  }

  // ─── Export ──────────────────────────────────────────────────────────────────

  /**
   * Serialise current data to a plain object ready for JSON.stringify.
   * Runs orphan recovery before export to ensure consistency.
   * @returns {object}
   */
  buildExportData() {
    // Repair any orphaned tag references before exporting
    if (this.tgm) {
      const fixed = this.tgm.resolveOrphanedTags(this.rm.resources);
      if (fixed > 0) this.tgm.save(); // fire-and-forget; export continues
    }

    return {
      version:       BACKUP_VERSION,
      exportedAt:    Date.now(),
      resourceCount: this.rm.getCount(),
      resources:     this.rm.getAllResources(),
      tagGroups:     this.tgm ? this.tgm.getAll() : [],
      settings:      this.rm.settings,
    };
  }

  /**
   * Trigger a browser file download of the backup JSON.
   * Works only from popup / dashboard pages (not service worker).
   */
  async downloadBackup() {
    const data = this.buildExportData();
    // Include per-folder import state so fast-path tracking survives device transfers
    const stored = await chrome.storage.local.get(STORAGE_KEYS.IMPORT_STATE);
    data.importState = stored[STORAGE_KEYS.IMPORT_STATE] || {};

    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);

    const date = new Date().toISOString().slice(0, 10);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `pbf-backup-${date}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // ─── Import ──────────────────────────────────────────────────────────────────

  /**
   * Parse a JSON string (from a backup file) and import into storage.
   * @param {string} jsonText
   * @param {{ mode?: 'merge'|'replace', settingsMode?: 'overwrite'|'keep' }} options
   *   merge   — combine with existing data (default)
   *   replace — clear everything first, then import
   *   settingsMode defaults to 'overwrite' when mode=replace, 'keep' when mode=merge
   * @returns {{ imported:number, merged:number, errors:string[] }}
   */
  async importFromJson(jsonText, options = {}) {
    const { mode = 'merge' } = options;
    const settingsMode = options.settingsMode ?? (mode === 'replace' ? 'overwrite' : 'keep');

    let data;
    try {
      data = JSON.parse(jsonText);
    } catch (e) {
      throw new Error(`Invalid JSON: ${e.message}`);
    }

    if (!data.resources || !Array.isArray(data.resources)) {
      throw new Error('Backup file is missing "resources" array.');
    }

    // Warn about version mismatch but continue
    if (data.version && data.version > BACKUP_VERSION) {
      console.warn(`[BackupManager] Backup version ${data.version} is newer than supported ${BACKUP_VERSION}. Proceeding with best-effort import.`);
    }

    // ── Step 1: Clear if replace mode ──────────────────────────────────────
    if (mode === 'replace') {
      this.rm.resources = {};
      this.rm.urlIndex  = {};
      if (this.tgm) this.tgm.tagGroups = {};
    }

    // ── Step 2: Restore Tag Groups (must happen before resources) ──────────
    const idRemap = {}; // { oldId → newId } for conflict resolution
    if (this.tgm) {
      const tagGroupsSource = Array.isArray(data.tagGroups) ? data.tagGroups : [];

      for (const tg of tagGroupsSource) {
        if (!tg.id || !tg.primaryLabel) continue;
        const aliases = Array.isArray(tg.aliases) ? tg.aliases : [tg.primaryLabel];

        if (this.tgm.tagGroups[tg.id]) {
          // Same ID already exists — merge aliases in
          const existing = this.tgm.tagGroups[tg.id];
          existing.aliases   = [...new Set([...existing.aliases, ...aliases])];
          existing.updatedAt = Date.now();
          // No remap — same ID, compatible
        } else {
          // Check if any alias matches an existing group
          const conflict = aliases.reduce(
            (found, alias) => found || this.tgm.findByAlias(alias), null
          );
          if (conflict) {
            // Remap: point old ID to the matched existing group
            idRemap[tg.id] = conflict.id;
            conflict.aliases   = [...new Set([...conflict.aliases, ...aliases])];
            conflict.updatedAt = Date.now();
          } else {
            // No conflict — import with original ID preserved
            this.tgm.tagGroups[tg.id] = {
              id:           tg.id,
              primaryLabel: tg.primaryLabel,
              aliases,
              createdAt:    tg.createdAt || Date.now(),
              updatedAt:    tg.updatedAt || Date.now(),
            };
          }
        }
      }

      // Handle old v1 backups that had no tagGroups array:
      // flat string tags in resources will be converted during migrateResources() below.

      await this.tgm.save();
    }

    // ── Step 3: Import Resources ────────────────────────────────────────────
    let imported = 0, mergedCount = 0;
    const errors = [];

    for (const res of data.resources) {
      try {
        // Remap tag IDs if any conflicts were resolved above
        if (res.tags && Object.keys(idRemap).length > 0) {
          res.tags = [...new Set(res.tags.map(t => idRemap[t] || t))];
        }
        const before = !!this.rm.resources[res.id?.toUpperCase?.()];
        this.rm.importResourceData(res);
        if (before) mergedCount++; else imported++;
      } catch (e) {
        errors.push(`${res.id}: ${e.message}`);
      }
    }

    // ── Step 4: Migrate legacy flat-string tags & recover orphaned IDs ─────
    if (this.tgm) {
      this.tgm.migrateResources(this.rm.resources);
      this.tgm.resolveOrphanedTags(this.rm.resources);
      await this.tgm.save();
    }

    await this.rm.save();

    // ── Step 5: Settings ────────────────────────────────────────────────────
    if (data.settings) {
      if (settingsMode === 'overwrite') {
        Object.assign(this.rm.settings, data.settings);
      } else {
        // 'keep': only fill in keys that are missing from current settings
        for (const [k, v] of Object.entries(data.settings)) {
          if (this.rm.settings[k] === undefined || this.rm.settings[k] === null) {
            this.rm.settings[k] = v;
          }
        }
      }
      await this.rm.saveSettings();
    }

    // ── Step 6: Import state (fast-path tracking) ────────────────────────────
    if (data.importState && typeof data.importState === 'object') {
      if (mode === 'replace') {
        // Replace mode: restore import state verbatim
        await chrome.storage.local.set({ [STORAGE_KEYS.IMPORT_STATE]: data.importState });
      } else {
        // Merge mode: combine — existing state takes priority for conflicting folders
        const existing = await chrome.storage.local.get(STORAGE_KEYS.IMPORT_STATE);
        const merged   = { ...data.importState, ...(existing[STORAGE_KEYS.IMPORT_STATE] || {}) };
        await chrome.storage.local.set({ [STORAGE_KEYS.IMPORT_STATE]: merged });
      }
    }

    return { imported, merged: mergedCount, errors };
  }

  /**
   * Read a File object and pass its text content to importFromJson.
   * @param {File} file
   * @param {object} options
   */
  async importFromFile(file, options = {}) {
    const text = await file.text();
    return this.importFromJson(text, options);
  }
}