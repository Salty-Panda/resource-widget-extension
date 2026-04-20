
const BACKUP_VERSION = 1;

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
   * @returns {object}
   */
  buildExportData() {
    return {
      version:   BACKUP_VERSION,
      exportedAt: Date.now(),
      resourceCount: this.rm.getCount(),
      resources: this.rm.getAllResources(),
      tagGroups: this.tgm ? this.tgm.getAll() : [],
      settings:  this.rm.settings,
    };
  }

  /**
   * Trigger a browser file download of the backup JSON.
   * Works only from popup / dashboard pages (not service worker).
   */
  downloadBackup() {
    const data = this.buildExportData();
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
   * Parse a JSON string (from a backup file) and import into the ResourceManager.
   * @param {string} jsonText
   * @param {{ mode?: 'merge'|'replace' }} options
   *   merge  — import resources, merging with existing (default)
   *   replace — clear everything first, then import
   * @returns {{ imported:number, merged:number, errors:string[] }}
   */
  async importFromJson(jsonText, options = {}) {
    const { mode = 'merge' } = options;
    let data;
    try {
      data = JSON.parse(jsonText);
    } catch (e) {
      throw new Error(`Invalid JSON: ${e.message}`);
    }

    if (!data.resources || !Array.isArray(data.resources)) {
      throw new Error('Backup file is missing "resources" array.');
    }

    if (mode === 'replace') {
      this.rm.resources = {};
      this.rm.urlIndex  = {};
      if (this.tgm) this.tgm.tagGroups = {};
    }

    // ── Restore Tag Groups before processing resources ──────────────────────
    const idRemap = {}; // { oldId → newId } for conflict resolution
    if (this.tgm && Array.isArray(data.tagGroups)) {
      for (const tg of data.tagGroups) {
        if (!tg.id) continue;
        if (this.tgm.tagGroups[tg.id]) {
          // ID already exists — merge aliases into existing group
          const existing = this.tgm.tagGroups[tg.id];
          existing.aliases = [...new Set([...existing.aliases, ...tg.aliases])];
          existing.updatedAt = Date.now();
          // No remap needed — same ID
        } else {
          // Check if any alias conflicts with an existing Tag Group
          const conflict = tg.aliases.reduce((found, alias) =>
            found || this.tgm.findByAlias(alias), null);
          if (conflict) {
            // Remap this imported tag group to the existing one
            idRemap[tg.id] = conflict.id;
            conflict.aliases = [...new Set([...conflict.aliases, ...tg.aliases])];
            conflict.updatedAt = Date.now();
          } else {
            // No conflict — import as-is, preserving original ID
            this.tgm.tagGroups[tg.id] = {
              id:           tg.id,
              primaryLabel: tg.primaryLabel,
              aliases:      [...tg.aliases],
              createdAt:    tg.createdAt || Date.now(),
              updatedAt:    tg.updatedAt || Date.now(),
            };
          }
        }
      }
      await this.tgm.save();
    }

    let imported = 0, mergedCount = 0;
    const errors = [];

    for (const res of data.resources) {
      try {
        // Remap tag IDs if conflicts were resolved
        if (res.tags && Object.keys(idRemap).length > 0) {
          res.tags = res.tags.map(t => idRemap[t] || t);
          res.tags = [...new Set(res.tags)];
        }
        const before = !!this.rm.resources[res.id?.toUpperCase?.()];
        this.rm.importResourceData(res);
        if (before) mergedCount++; else imported++;
      } catch (e) {
        errors.push(`${res.id}: ${e.message}`);
      }
    }

    // ── Recover any orphaned tag references ─────────────────────────────────
    if (this.tgm) {
      this.tgm.resolveOrphanedTags(this.rm.resources);
      await this.tgm.save();
    }

    await this.rm.save();

    // Optionally restore settings
    if (data.settings) {
      Object.assign(this.rm.settings, data.settings);
      await this.rm.saveSettings();
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