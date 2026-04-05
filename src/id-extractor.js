import { ID_REGEX } from './constants.js';

/**
 * Normalize an ID or name to uppercase (canonical form).
 * @param {string} raw
 * @returns {string}
 */
export function normalizeId(raw) {
  return String(raw).trim().toUpperCase();
}

/**
 * Return true if the string matches the ID pattern exactly.
 * @param {string} str
 * @returns {boolean}
 */
export function isPatternId(str) {
  return /^\w{2,8}-\d{3,5}$/i.test(str);
}

/**
 * Extract all pattern IDs from arbitrary text.
 * Returns a de-duplicated array of normalized IDs.
 * @param {string} text
 * @returns {string[]}
 */
export function extractIds(text) {
  const re = new RegExp(ID_REGEX.source, 'gi');
  const found = [];
  let m;
  while ((m = re.exec(text)) !== null) {
    found.push(normalizeId(m[1] || m[0]));
  }
  return [...new Set(found)];
}

/**
 * Attempt to extract a SINGLE pattern ID from a URL.
 * Returns null if zero or two+ IDs are found (ambiguous per spec).
 * Searches the decoded pathname + search string.
 * @param {string} url
 * @returns {string|null}
 */
export function extractIdFromUrl(url) {
  try {
    const u = new URL(url);
    const searchText = decodeURIComponent(u.pathname + u.search);
    const ids = extractIds(searchText);
    if (ids.length === 1) return ids[0];
    return null; // 0 or 2+ IDs → no unambiguous ID
  } catch {
    return null;
  }
}