/**
 * Normalize a URL for deduplication.
 * - Removes fragment (#hash) — client-side only, not part of resource identity
 * - Strips trailing slash from non-root paths
 * - Preserves query string
 * - Preserves original casing (use urlKey() for case-insensitive comparison)
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
 * Case-insensitive URL key used for indexing and deduplication.
 * Two URLs that differ only in path casing are considered identical.
 * Original casing is preserved in storage; this key is used only for lookup.
 * @param {string} url
 * @returns {string}
 */
export function urlKey(url) {
  return normalizeUrl(url).toLowerCase();
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
 * Select the single best URL from a list using priority domain order.
 * Among URLs matching the same highest-priority domain, the longest URL wins
 * (assumed to be more specific).  If no priority domain matches, the longest
 * URL in the entire list is returned.
 * Returns null for an empty list.
 * @param {string[]} urls
 * @param {string[]} priorityDomains
 * @returns {string|null}
 */
export function selectUrlByPriority(urls, priorityDomains = []) {
  if (!urls || urls.length === 0) return null;
  const sorted = sortUrlsByPriority(urls, priorityDomains);
  return sorted[0];
}

/**
 * Sort URLs by priority domain (ascending index = higher priority), then by
 * descending URL length as a tiebreaker so that longer, more specific URLs are
 * preferred over shorter ones within the same domain tier.
 * @param {string[]} urls
 * @param {string[]} priorityDomains
 * @returns {string[]}
 */
export function sortUrlsByPriority(urls, priorityDomains = []) {
  return [...urls].sort((a, b) => {
    if (priorityDomains.length) {
      const da = getDomain(a);
      const db = getDomain(b);
      const ia = priorityDomains.findIndex(d => da.includes(d));
      const ib = priorityDomains.findIndex(d => db.includes(d));
      const diff = (ia === -1 ? Infinity : ia) - (ib === -1 ? Infinity : ib);
      if (diff !== 0) return diff;
    }
    // Same priority tier (or no domains defined) → prefer the longer URL
    return b.length - a.length;
  });
}