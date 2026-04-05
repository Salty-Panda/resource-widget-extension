import { normalizeUrl, isValidUrl } from './url-utils.js';

/**
 * Migration rule shape:
 * {
 *   id:             string,   // unique rule identifier
 *   name:           string,   // human-readable label
 *   sourcePattern:  string,   // URL pattern with {ID} placeholder
 *   targetTemplate: string,   // URL template with {ID} placeholder
 * }
 *
 * Example:
 *   sourcePattern:  "https://oldjira.example.com/browse/{ID}"
 *   targetTemplate: "https://newjira.example.com/browse/{ID}"
 */
export class MigrationManager {
  /**
   * @param {import('./resource-manager.js').ResourceManager} rm
   */
  constructor(rm) {
    this.rm = rm;
  }

  // ─── Rule helpers ────────────────────────────────────────────────────────────

  /**
   * Build a RegExp from a sourcePattern by replacing {ID} with the ID regex.
   * Returns null if pattern is invalid.
   */
  buildSourceRegex(sourcePattern) {
    try {
      const escaped = sourcePattern
        .replace(/[.*+?^${}()|[\]\\]/g, '\\$&') // escape regex meta-chars
        .replace(/\\\{ID\\\}/g, '(\\w{2,5}-\\d{3,5})'); // un-escape placeholder
      return new RegExp(`^${escaped}$`, 'i');
    } catch {
      return null;
    }
  }

  /**
   * Generate a target URL for a given resource ID.
   */
  buildTargetUrl(targetTemplate, resourceId) {
    return targetTemplate.replace(/\{ID\}/gi, resourceId);
  }

  // ─── Preview ─────────────────────────────────────────────────────────────────

  /**
   * Find all resources that have at least one URL matching the sourcePattern
   * and whose ID is a pattern ID.
   *
   * @param {string} sourcePattern
   * @param {string} targetTemplate
   * @returns {{ resource, matchedUrl, generatedUrl, alreadyPresent }[]}
   */
  preview(sourcePattern, targetTemplate) {
    const regex = this.buildSourceRegex(sourcePattern);
    if (!regex) return [];

    const results = [];
    for (const resource of this.rm.getAllResources()) {
      if (!resource.isPatternId) continue;
      const matchedUrl = resource.urls.find(u => regex.test(u));
      if (!matchedUrl) continue;

      const generatedUrl    = this.buildTargetUrl(targetTemplate, resource.id);
      const normalizedGen   = normalizeUrl(generatedUrl);
      const alreadyPresent  = resource.urls.map(normalizeUrl).includes(normalizedGen);

      results.push({ resource, matchedUrl, generatedUrl, alreadyPresent });
    }
    return results;
  }

  // ─── Validation ──────────────────────────────────────────────────────────────

  /**
   * Validate a random sample of generated URLs by sending HEAD requests.
   * @param {string[]} urls
   * @param {number}   sampleSize   max URLs to test
   * @param {(done:number, total:number) => void} onProgress
   * @returns {Promise<{ url, ok, status }[]>}
   */
  async validateSample(urls, sampleSize = 10, onProgress) {
    const sample = this._randomSample(urls, sampleSize);
    const results = [];
    for (let i = 0; i < sample.length; i++) {
      const url = sample[i];
      try {
        const res = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(8000) });
        results.push({ url, ok: res.ok, status: res.status });
      } catch {
        results.push({ url, ok: false, status: 0 });
      }
      onProgress?.(i + 1, sample.length);
    }
    return results;
  }

  _randomSample(arr, n) {
    if (arr.length <= n) return [...arr];
    const copy = [...arr];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy.slice(0, n);
  }

  // ─── Execution ───────────────────────────────────────────────────────────────

  /**
   * Apply the migration: add generated URLs to matched resources (non-destructive).
   * Preserves existing URLs.
   *
   * @param {string} sourcePattern
   * @param {string} targetTemplate
   * @param {(done:number, total:number) => void} onProgress
   * @returns {Promise<{ applied:number, skipped:number }>}
   */
  async execute(sourcePattern, targetTemplate, onProgress) {
    const previews = this.preview(sourcePattern, targetTemplate);
    let applied = 0, skipped = 0;

    for (let i = 0; i < previews.length; i++) {
      const { resource, generatedUrl, alreadyPresent } = previews[i];
      if (alreadyPresent) { skipped++; }
      else {
        const nUrl = normalizeUrl(generatedUrl);
        if (!resource.urls.includes(nUrl) && isValidUrl(generatedUrl)) {
          resource.urls.push(nUrl);
          this.rm.urlIndex[nUrl] = resource.id;
          resource.updatedAt = Date.now();
          applied++;
        } else {
          skipped++;
        }
      }
      onProgress?.(i + 1, previews.length);
    }

    if (applied > 0) await this.rm.save();
    return { applied, skipped };
  }
}