/**
 * Normalize a URL for deduplication.
 * - Removes fragment (#hash) — client-side only, not part of resource identity
 * - Strips trailing slash from non-root paths
 * - Preserves query string
 * @param {string} url
 * @returns {string}
 */
export function normalizeUrl(url) {
  try {
    const u = new URL(url);
    let path = u.pathname;
    if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1);
    return `${u.protocol}//${u.host}${path}${u.search}`;
  } catch {
    return url.split('#')[0]; // best-effort fallback
  }
}

/**
 * Extract the hostname from a URL.
 * @param {string} url
 * @returns {string}
 */
export function getDomain(url) {
  try { return new URL(url).hostname; } catch { return ''; }
}

/**
 * Return true for http/https URLs only.
 * @param {string} str
 * @returns {boolean}
 */
export function isValidUrl(str) {
  try {
    const u = new URL(str);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch { return false; }
}

/**
 * Sort URLs by preferred domains (first match = highest priority).
 * @param {string[]} urls
 * @param {string[]} priorityDomains
 * @returns {string[]}
 */
export function sortUrlsByPriority(urls, priorityDomains = []) {
  if (!priorityDomains.length) return [...urls];
  return [...urls].sort((a, b) => {
    const da = getDomain(a);
    const db = getDomain(b);
    const ia = priorityDomains.findIndex(d => da.includes(d));
    const ib = priorityDomains.findIndex(d => db.includes(d));
    return (ia === -1 ? Infinity : ia) - (ib === -1 ? Infinity : ib);
  });
}