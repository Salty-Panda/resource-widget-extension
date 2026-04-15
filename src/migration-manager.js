import { normalizeUrl, isValidUrl, urlKey } from './url-utils.js';

/**
 * ID-based URL generation for migration.
 *
 * The system generates new URLs by substituting the Resource ID into one or
 * more user-defined URL templates.  No dependency on existing resource URLs.
 *
 * Eligible resources: those whose id matches the pattern ID format
 * (isPatternId === true, i.e. \w{2,5}-\d{3,5}).
 *
 * For each eligible resource × each template:
 *   generatedUrl = template.replace('{ID}', resource.id)
 *   → added to resource.urls (non-destructive, deduplicated)
 */
export class MigrationManager {
  /**
   * @param {import('./resource-manager.js').ResourceManager} rm
   */
  constructor(rm) {
    this.rm = rm;
  }

  // ─── URL building ────────────────────────────────────────────────────────────

  /**
   * Substitute {ID} in a template and ensure a valid protocol.
   * If the template has no http(s):// prefix, https:// is prepended.
   * @param {string} template
   * @param {string} resourceId   normalised resource ID (e.g. "ABC-123")
   * @returns {string}
   */
  buildUrl(template, resourceId) {
    let url = template.replace(/\{ID}/gi, resourceId).trim();
    if (url && !/^https?:\/\//i.test(url)) url = 'https://' + url;
    return url;
  }

  // ─── Stats ───────────────────────────────────────────────────────────────────

  /**
   * Count resources eligible for migration (isPatternId === true).
   * @returns {number}
   */
  countEligible() {
    return this.rm.getAllResources().filter(r => r.isPatternId).length;
  }

  // ─── Preview ─────────────────────────────────────────────────────────────────

  /**
   * Build the full set of (resource, template, generatedUrl) triples for all
   * eligible resources × all templates.
   *
   * @param {string[]} templates
   * @returns {{ resource, template:string, generatedUrl:string, alreadyPresent:boolean }[]}
   */
  preview(templates) {
    const results = [];
    for (const resource of this.rm.getAllResources()) {
      if (!resource.isPatternId) continue;
      for (const tpl of templates) {
        const generatedUrl   = this.buildUrl(tpl, resource.id);
        const alreadyPresent = resource.urls.some(u => urlKey(u) === urlKey(generatedUrl));
        results.push({ resource, template: tpl, generatedUrl, alreadyPresent });
      }
    }
    return results;
  }

  // ─── Validation ──────────────────────────────────────────────────────────────

  /**
   * HEAD-test a random sample of URLs to gauge availability before committing.
   * @param {string[]} urls
   * @param {number}   sampleSize   max URLs to test (default 10)
   * @param {(done:number, total:number) => void} [onProgress]
   * @returns {Promise<{ url:string, ok:boolean, status:number }[]>}
   */
  async validateSample(urls, sampleSize = 10, onProgress) {
    const sample  = this._randomSample(urls, sampleSize);
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
   * Add generated URLs to all eligible resources (non-destructive).
   * Existing URLs are never removed or modified.
   * Duplicates and invalid URLs are silently skipped.
   *
   * @param {string[]} templates
   * @param {(done:number, total:number) => void} [onProgress]
   * @returns {Promise<{ applied:number, skipped:number }>}
   */
  async execute(templates, onProgress) {
    const previews = this.preview(templates);
    let applied = 0, skipped = 0;

    for (let i = 0; i < previews.length; i++) {
      const { resource, generatedUrl, alreadyPresent } = previews[i];
      if (alreadyPresent) {
        skipped++;
      } else {
        const nUrl = normalizeUrl(generatedUrl);
        if (isValidUrl(generatedUrl) && !resource.urls.some(u => urlKey(u) === urlKey(nUrl))) {
          resource.urls.push(nUrl);
          this.rm.urlIndex[urlKey(nUrl)] = resource.id;
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