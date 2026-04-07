/**
 * RIM Service Worker (MV3)
 *
 * Responsibilities:
 *   1. Harvest page titles from chrome.tabs.onUpdated for tracked URLs.
 *   2. Scan visible page text for Tag Group alias matches → store as pending tags.
 *   3. Show badge: "✓" (tracked, no pending) | "!" (pending tags) | "" (untracked).
 *   4. Respond to popup/dashboard messages.
 */

import { ResourceManager }   from '../src/resource-manager.js';
import { TagGroupManager }   from '../src/tag-group-manager.js';
import { RateLimiter }       from '../src/rate-limiter.js';
import { MSG, STORAGE_KEYS } from '../src/constants.js';

// ─── Singletons (reset on SW restart — acceptable) ───────────────────────────
const rm          = new ResourceManager();
const tgm         = new TagGroupManager();
const rateLimiter = new RateLimiter(3000);
let   initPromise = _init();

async function _init() {
  await rm.initialize();
  await tgm.initialize();
  // One-time migration: flat string tags → Tag Group IDs
  if (tgm.migrateResources(rm.resources)) {
    await tgm.save();
    await rm.save();
  }
}

// ─── Tab events ───────────────────────────────────────────────────────────────

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status !== 'complete') return;
  if (!tab.url?.startsWith('http'))      return;

  await initPromise;

  const resource = rm.getResourceByUrl(tab.url);
  if (!resource) {
    chrome.action.setBadgeText({ text: '', tabId });
    return;
  }

  // 1. Rate-limited title harvest (reads fresh state before write)
  rateLimiter.enqueue(async () => {
    await rm.initialize();
    await rm.addTitle(tab.url, tab.title);
  });

  // 2. Automatic tag detection via page text scan
  if (tgm.getAll().length > 0) {
    _scanPageForTags(tabId, tab.url, resource.id).catch(() => {});
  }

  _updateBadge(tabId, tab.url);
});

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab) _updateBadge(tab.id, tab.url);
});

// ─── Page text scanning ───────────────────────────────────────────────────────

async function _scanPageForTags(tabId, url, resourceId) {
  let pageText = '';
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func:   _extractVisibleText,
    });
    pageText = results?.[0]?.result || '';
  } catch {
    return; // no permission or inaccessible frame
  }
  if (!pageText) return;

  // Re-read fresh state before comparing/writing
  await rm.initialize();
  await tgm.initialize();

  const resource = rm.getResourceById(resourceId);
  if (!resource) return;

  const matches   = tgm.findMatchesInText(pageText);
  const newTagIds = matches
    .map(m => m.tagGroup.id)
    .filter(id => !resource.tags.includes(id));

  if (newTagIds.length === 0) return;

  const stored  = await chrome.storage.local.get(STORAGE_KEYS.PENDING_TAGS);
  const pending = stored[STORAGE_KEYS.PENDING_TAGS] || {};
  pending[resourceId] = [...new Set([...(pending[resourceId] || []), ...newTagIds])];
  await chrome.storage.local.set({ [STORAGE_KEYS.PENDING_TAGS]: pending });

  chrome.action.setBadgeText({ text: '!', tabId });
  chrome.action.setBadgeBackgroundColor({ color: '#f59e0b', tabId });
}

/**
 * Self-contained — injected into the page via chrome.scripting.
 * Recursively walks the entire body, collects all visible text nodes.
 * No fixed selectors, no depth assumptions.
 * Must NOT reference any variables outside this function.
 */
function _extractVisibleText() {
  try {
    const SKIP = new Set(['SCRIPT','STYLE','NOSCRIPT','HEAD','IFRAME','OBJECT','EMBED','TEMPLATE','SVG']);
    let text = '';

    function walk(node) {
      if (node.nodeType === 3) { // TEXT_NODE
        const t = (node.nodeValue || '').trim();
        if (t) text += t + ' ';
        return;
      }
      if (node.nodeType !== 1) return; // not ELEMENT_NODE
      if (SKIP.has(node.tagName)) return;
      try {
        const cs = window.getComputedStyle(node);
        if (cs.display === 'none' || cs.visibility === 'hidden') return;
      } catch (_) {}
      for (let i = 0; i < node.childNodes.length; i++) walk(node.childNodes[i]);
    }

    if (document.body) walk(document.body);
    return text.slice(0, 100000);
  } catch (_) { return ''; }
}

// ─── Badge ────────────────────────────────────────────────────────────────────

async function _updateBadge(tabId, url) {
  if (!url?.startsWith('http')) { chrome.action.setBadgeText({ text: '', tabId }); return; }
  await initPromise;
  const resource = rm.getResourceByUrl(url);
  if (!resource)  { chrome.action.setBadgeText({ text: '', tabId }); return; }

  const stored  = await chrome.storage.local.get(STORAGE_KEYS.PENDING_TAGS);
  const pending = (stored[STORAGE_KEYS.PENDING_TAGS] || {})[resource.id] || [];
  if (pending.length > 0) {
    chrome.action.setBadgeText({ text: '!', tabId });
    chrome.action.setBadgeBackgroundColor({ color: '#f59e0b', tabId });
  } else {
    chrome.action.setBadgeText({ text: '✓', tabId });
    chrome.action.setBadgeBackgroundColor({ color: '#22c55e', tabId });
  }
}

// ─── Message API ──────────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  _dispatch(message).then(sendResponse).catch(err => sendResponse({ ok: false, error: err.message }));
  return true;
});

async function _dispatch(msg) {
  await initPromise;
  switch (msg.type) {
    case MSG.PING:
      return { ok: true, count: rm.getCount() };

    case MSG.ADD_TITLE:
      await rm.initialize();
      await rm.addTitle(msg.url, msg.title);
      return { ok: true };

    case MSG.SCHEDULE_TITLE_FETCH:
      rateLimiter.enqueue(async () => {
        try {
          const title = await _fetchTitle(msg.url);
          if (title) { await rm.initialize(); await rm.addTitle(msg.url, title); }
        } catch {}
      });
      return { ok: true, queued: true };

    case MSG.GET_PENDING_TAGS: {
      const stored  = await chrome.storage.local.get(STORAGE_KEYS.PENDING_TAGS);
      const tagGroupIds = (stored[STORAGE_KEYS.PENDING_TAGS] || {})[msg.resourceId] || [];
      return { ok: true, tagGroupIds };
    }

    case MSG.CLEAR_PENDING_TAG: {
      const stored  = await chrome.storage.local.get(STORAGE_KEYS.PENDING_TAGS);
      const pending = stored[STORAGE_KEYS.PENDING_TAGS] || {};
      pending[msg.resourceId] = (pending[msg.resourceId] || []).filter(id => id !== msg.tagGroupId);
      if (pending[msg.resourceId].length === 0) delete pending[msg.resourceId];
      await chrome.storage.local.set({ [STORAGE_KEYS.PENDING_TAGS]: pending });
      return { ok: true };
    }

    default:
      return { ok: false, error: `Unknown message: ${msg.type}` };
  }
}

async function _fetchTitle(url) {
  try {
    const res = await fetch(url, { method: 'GET', headers: { Accept: 'text/html' }, signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return null;
    if (!(res.headers.get('content-type') || '').includes('text/html')) return null;
    const match = (await res.text()).match(/<title[^>]*>([^<]{1,300})<\/title>/i);
    return match ? match[1].trim() : null;
  } catch { return null; }
}