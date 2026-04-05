import { ResourceManager }    from '../src/resource-manager.js';
import { extractIdFromUrl }   from '../src/id-extractor.js';
import { MSG }                from '../src/constants.js';

// ─── State ───────────────────────────────────────────────────────────────────
const rm  = new ResourceManager();
let currentTab   = null;
let currentState = null; // 'loading' | 'system' | 'known' | 'id-match' | 'new'
let editResource = null; // resource object for known/id-match states

// ─── Init ────────────────────────────────────────────────────────────────────
(async () => {
  await rm.initialize();
  currentTab = await getActiveTab();
  await determineState();
})();

async function getActiveTab() {
  return new Promise(resolve => {
    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => resolve(tab || null));
  });
}

// ─── State determination ─────────────────────────────────────────────────────
async function determineState() {
  const url = currentTab?.url;

  if (!url || !url.startsWith('http')) {
    showState('system');
    return;
  }

  // 1. Direct URL match
  const resource = rm.getResourceByUrl(url);
  if (resource) {
    editResource = resource;
    renderKnownState(resource);
    showState('known');
    return;
  }

  // 2. ID match (URL not registered but its ID belongs to an existing resource)
  const extractedId = extractIdFromUrl(url);
  if (extractedId) {
    const byId = rm.getResourceById(extractedId);
    if (byId) {
      editResource = byId;
      document.getElementById('id-match-id').textContent = extractedId;
      showState('id-match');
      return;
    }
  }

  // 3. New resource
  renderNewState(url, extractedId);
  showState('new');
}

// ─── Render helpers ───────────────────────────────────────────────────────────
function showState(name) {
  currentState = name;
  const panels = ['loading', 'system', 'known', 'id-match', 'new'];
  panels.forEach(p => {
    const el = document.getElementById(`state-${p}`);
    if (el) el.classList.toggle('hidden', p !== name);
  });
}

function renderKnownState(resource) {
  document.getElementById('known-id-badge').textContent = resource.id;

  const patternTag = document.getElementById('known-pattern-tag');
  patternTag.classList.toggle('hidden', !resource.isPatternId);

  document.getElementById('known-url-count').textContent =
    `${resource.urls.length} URL${resource.urls.length !== 1 ? 's' : ''}`;

  const titlesEl = document.getElementById('known-titles');
  titlesEl.innerHTML = resource.titles.length
    ? resource.titles.slice(0, 2).map(t => `<div>${escHtml(t)}</div>`).join('')
    : `<span class="muted">—</span>`;

  const tagsEl = document.getElementById('known-tags');
  tagsEl.innerHTML = resource.tags.length
    ? resource.tags.map(t => `<span class="tag-chip">${escHtml(t)}</span>`).join('')
    : `<span class="muted small">—</span>`;

  renderStarDisplay('known-rating-display', resource.rating);

  // Populate quick-edit fields
  document.getElementById('known-tags-input').value = resource.tags.join(', ');
  renderStarInput('known-rating-input', resource.rating || 0);
}

function renderNewState(url, extractedId) {
  const idInput = document.getElementById('new-id');
  const badge   = document.getElementById('extracted-id-badge');
  if (extractedId) {
    idInput.value = extractedId;
    idInput.readOnly = true;
    badge.textContent = 'auto-detected';
    badge.classList.remove('hidden');
  } else {
    idInput.value = '';
    idInput.readOnly = false;
    badge.classList.add('hidden');
  }
  renderStarInput('new-rating', 0);
}

// ─── Star rendering ───────────────────────────────────────────────────────────
function renderStarDisplay(containerId, rating) {
  const el = document.getElementById(containerId);
  el.textContent = rating ? '★'.repeat(rating) + '☆'.repeat(5 - rating) : '—';
}

function renderStarInput(containerId, value) {
  const el = document.getElementById(containerId);
  el.innerHTML = '';
  el.dataset.value = value;
  for (let i = 1; i <= 5; i++) {
    const star = document.createElement('span');
    star.className = 'star' + (i <= value ? ' active' : '');
    star.textContent = '★';
    star.dataset.val = i;
    el.appendChild(star);
  }
}

function getStarValue(containerId) {
  return parseInt(document.getElementById(containerId).dataset.value, 10) || null;
}

// ─── Event wiring ─────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // Star inputs (delegated)
  document.addEventListener('click', e => {
    const star = e.target.closest('.star-input .star');
    if (!star) return;
    const container = star.closest('.star-input');
    const val  = parseInt(star.dataset.val, 10);
    const prev = parseInt(container.dataset.value, 10);
    const newVal = val === prev ? 0 : val; // click same → clear
    container.dataset.value = newVal;
    renderStarInput(container.id, newVal);
  });

  // Dashboard button
  document.getElementById('btn-dashboard').addEventListener('click', openDashboard);

  // Update existing resource
  document.getElementById('btn-update').addEventListener('click', handleUpdate);

  // Open in dashboard (from known state)
  document.getElementById('btn-open-in-dashboard').addEventListener('click', () =>
    openDashboard(editResource?.id));

  // Link current URL to matched resource
  document.getElementById('btn-link-url').addEventListener('click', handleLinkUrl);

  // Open matched resource in dashboard
  document.getElementById('btn-open-matched').addEventListener('click', () =>
    openDashboard(editResource?.id));

  // Add new resource
  document.getElementById('btn-add').addEventListener('click', handleAdd);
});

// ─── Handlers ─────────────────────────────────────────────────────────────────
async function handleUpdate() {
  if (!editResource) return;
  try {
    const rawTags = document.getElementById('known-tags-input').value;
    const tags    = parseTags(rawTags);
    const rating  = getStarValue('known-rating-input');

    await rm.updateResource(editResource.id, { tags, rating });
    showToast('Saved ✓', 'success');
    editResource = rm.getResourceById(editResource.id);
    renderKnownState(editResource);
  } catch (e) {
    showToast(e.message, 'error');
  }
}

async function handleLinkUrl() {
  if (!currentTab?.url || !editResource) return;
  try {
    await rm.addUrl(currentTab.url, {});
    showToast('URL linked ✓', 'success');
    editResource = rm.getResourceByUrl(currentTab.url);
    renderKnownState(editResource);
    showState('known');
  } catch (e) {
    showToast(e.message, 'error');
  }
}

async function handleAdd() {
  const url = currentTab?.url;
  if (!url) return;

  const name   = document.getElementById('new-id').value.trim();
  const rawTags = document.getElementById('new-tags').value;
  const tags   = parseTags(rawTags);
  const rating = getStarValue('new-rating');

  if (!name && !extractIdFromUrl(url)) {
    showToast('Please enter a name', 'error');
    return;
  }

  try {
    const { resource } = await rm.addUrl(url, { name, tags, rating, title: currentTab.title });
    editResource = resource;
    renderKnownState(resource);
    showState('known');
    showToast('Resource added ✓', 'success');

    // Schedule background title fetch
    chrome.runtime.sendMessage({ type: MSG.SCHEDULE_TITLE_FETCH, url });
  } catch (e) {
    showToast(e.message, 'error');
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function openDashboard(resourceId = null) {
  const base = chrome.runtime.getURL('dashboard/dashboard.html');
  const url  = resourceId ? `${base}#${encodeURIComponent(resourceId)}` : base;
  chrome.tabs.create({ url });
  window.close();
}

function parseTags(raw) {
  return raw.split(',').map(t => t.trim()).filter(Boolean);
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

let toastTimer = null;
function showToast(msg, type = '') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = `toast${type ? ' ' + type : ''}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('hidden'), 2200);
}