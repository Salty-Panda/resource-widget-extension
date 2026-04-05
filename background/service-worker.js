/**
 * RIM Service Worker (MV3)
 *
 * Responsibilities:
 *   1. Listen for chrome.tabs.onUpdated to auto-capture page titles
 *      for already-tracked URLs (no fetch needed — tab.title is available).
 *   2. Handle explicit SCHEDULE_TITLE_FETCH messages (fetch HTML for title).
 *   3. Maintain a rate-limited queue to avoid spamming storage writes.
 *
 * NOTE: The service worker is ephemeral (MV3). It reloads its state
 * from chrome.storage.local on every activation via `initRM()`.
 */

import { ResourceManager }  from '../src/resource-manager.js';
import { RateLimiter }       from '../src/rate-limiter.js';
import { MSG } from '../src/constants.js';

// ─── Singleton instances (reset on SW restart — that's OK) ──────────────────
const rm          = new ResourceManager();
const rateLimiter = new RateLimiter(3000);
let   initPromise = rm.initialize();

// ─── Tab title harvesting ────────────────────────────────────────────────────

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status !== 'complete') return;
  if (!tab.url || !tab.title)           return;

  // Skip internal pages
  if (!tab.url.startsWith('http://') && !tab.url.startsWith('https://')) return;

  await initPromise;

  const resource = rm.getResourceByUrl(tab.url);
  if (!resource) return;

  rateLimiter.enqueue(async () => {
    // Re-read fresh state before writing (SW may have been dormant)
    await rm.initialize();
    await rm.addTitle(tab.url, tab.title);
  });
});

// ─── Message API ─────────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  dispatch(message)
    .then(sendResponse)
    .catch(err => sendResponse({ ok: false, error: err.message }));
  return true; // keep channel open for async response
});

async function dispatch(msg) {
  await initPromise;

  switch (msg.type) {
    case MSG.PING:
      return { ok: true, count: rm.getCount() };

    case MSG.ADD_TITLE: {
      const { url, title } = msg;
      await rm.initialize(); // fresh read
      await rm.addTitle(url, title);
      return { ok: true };
    }

    case MSG.SCHEDULE_TITLE_FETCH: {
      const { url } = msg;
      rateLimiter.enqueue(async () => {
        try {
          const title = await fetchTitle(url);
          if (title) {
            await rm.initialize();
            await rm.addTitle(url, title);
          }
        } catch { /* ignore fetch errors */ }
      });
      return { ok: true, queued: true };
    }

    default:
      return { ok: false, error: `Unknown message type: ${msg.type}` };
  }
}

// ─── Title fetcher (fetch-based, for background use) ────────────────────────

async function fetchTitle(url) {
  try {
    const resp = await fetch(url, {
      method:  'GET',
      headers: { Accept: 'text/html' },
      signal:  AbortSignal.timeout(10_000),
    });
    if (!resp.ok) return null;
    const ct = resp.headers.get('content-type') || '';
    if (!ct.includes('text/html')) return null;
    const html  = await resp.text();
    const match = html.match(/<title[^>]*>([^<]{1,300})<\/title>/i);
    return match ? match[1].trim() : null;
  } catch {
    return null;
  }
}

// ─── Extension badge: show "✓" when current tab URL is tracked ───────────────

async function updateBadge(tabId, url) {
  if (!url?.startsWith('http')) {
    chrome.action.setBadgeText({ text: '', tabId });
    return;
  }
  await initPromise;
  const resource = rm.getResourceByUrl(url);
  if (resource) {
    chrome.action.setBadgeText({ text: '✓', tabId });
    chrome.action.setBadgeBackgroundColor({ color: '#22c55e', tabId });
  } else {
    chrome.action.setBadgeText({ text: '', tabId });
  }
}

chrome.tabs.onActivated.addListener(async ({ }) => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab) updateBadge(tab.id, tab.url);
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.active) {
    updateBadge(tabId, tab.url);
  }
});