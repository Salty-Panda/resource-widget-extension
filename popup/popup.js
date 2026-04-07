import { ResourceManager }  from '../src/resource-manager.js';
import { TagGroupManager }  from '../src/tag-group-manager.js';
import { extractIdFromUrl } from '../src/id-extractor.js';
import { MSG, STORAGE_KEYS } from '../src/constants.js';

// ─── State ────────────────────────────────────────────────────────────────────
const rm  = new ResourceManager();
const tgm = new TagGroupManager();
let currentTab    = null;
let editResource  = null;
let pendingTagIds = []; // Tag Group IDs awaiting review

// ─── Init ─────────────────────────────────────────────────────────────────────
(async () => {
  await rm.initialize();
  await tgm.initialize();
  // One-time migration
  if (tgm.migrateResources(rm.resources)) { await tgm.save(); await rm.save(); }
  currentTab = await _getActiveTab();
  await _determineState();
})();

async function _getActiveTab() {
  return new Promise(r => chrome.tabs.query({ active: true, currentWindow: true }, ([t]) => r(t || null)));
}

// ─── State determination ──────────────────────────────────────────────────────
async function _determineState() {
  const url = currentTab?.url;
  if (!url || !url.startsWith('http')) { _showState('system'); return; }

  // 1. Direct URL match
  const resource = rm.getResourceByUrl(url);
  if (resource) {
    editResource = resource;
    _renderKnownState(resource);
    await _loadPendingTags(resource);
    _showState('known');
    return;
  }

  // 2. ID match (URL not registered but its ID is known)
  const extractedId = extractIdFromUrl(url);
  if (extractedId) {
    const byId = rm.getResourceById(extractedId);
    if (byId) {
      editResource = byId;
      document.getElementById('id-match-id').textContent = extractedId;
      _showState('id-match');
      return;
    }
  }

  // 3. New resource
  _renderNewState(url, extractedId);
  _showState('new');
}

// ─── Render helpers ───────────────────────────────────────────────────────────
function _showState(name) {
  ['loading','system','known','id-match','new'].forEach(p => {
    document.getElementById(`state-${p}`)?.classList.toggle('hidden', p !== name);
  });
}

function _renderKnownState(resource) {
  document.getElementById('known-id-badge').textContent = resource.id;
  document.getElementById('known-pattern-tag').classList.toggle('hidden', !resource.isPatternId);
  document.getElementById('known-url-count').textContent =
    `${resource.urls.length} URL${resource.urls.length !== 1 ? 's' : ''}`;

  const titlesEl = document.getElementById('known-titles');
  titlesEl.innerHTML = resource.titles.length
    ? resource.titles.slice(0, 2).map(t => `<div>${_esc(t)}</div>`).join('')
    : `<span class="muted">—</span>`;

  const tagsEl = document.getElementById('known-tags');
  tagsEl.innerHTML = resource.tags.length
    ? resource.tags.map(id => {
        const label = tgm.getById(id)?.primaryLabel || id;
        return `<span class="tag-chip">${_esc(label)}</span>`;
      }).join('')
    : `<span class="muted small">—</span>`;

  _renderStarDisplay('known-rating-display', resource.rating);

  // Quick-edit: show primaryLabels in text input
  const labels = resource.tags.map(id => tgm.getById(id)?.primaryLabel || id);
  document.getElementById('known-tags-input').value = labels.join(', ');
  _renderStarInput('known-rating-input', resource.rating || 0);
}

function _renderNewState(url, extractedId) {
  const idInput = document.getElementById('new-id');
  const badge   = document.getElementById('extracted-id-badge');
  if (extractedId) {
    idInput.value    = extractedId;
    idInput.readOnly = true;
    badge.textContent = 'auto-detected';
    badge.classList.remove('hidden');
  } else {
    idInput.value    = '';
    idInput.readOnly = false;
    badge.classList.add('hidden');
  }
  _renderStarInput('new-rating', 0);
}

// ─── Pending tags ─────────────────────────────────────────────────────────────
async function _loadPendingTags(resource) {
  const stored  = await chrome.storage.local.get(STORAGE_KEYS.PENDING_TAGS);
  const all     = stored[STORAGE_KEYS.PENDING_TAGS] || {};
  // Keep only IDs that still exist in tgm and aren't already on the resource
  pendingTagIds = (all[resource.id] || [])
    .filter(id => tgm.getById(id) && !resource.tags.includes(id));

  const section = document.getElementById('pending-tags-section');
  if (pendingTagIds.length === 0) { section.classList.add('hidden'); return; }
  _renderPendingList();
  section.classList.remove('hidden');
}

function _renderPendingList() {
  const list = document.getElementById('pending-tags-list');
  list.innerHTML = pendingTagIds.map(id => {
    const label = tgm.getById(id)?.primaryLabel || id;
    return `<div class="pending-tag-item">
      <span class="pending-tag-label">${_esc(label)}</span>
      <button class="btn-success pending-keep" data-id="${_esc(id)}">Keep ✓</button>
      <button class="btn-ghost  pending-dismiss" data-id="${_esc(id)}">✕</button>
    </div>`;
  }).join('');

  list.querySelectorAll('.pending-keep').forEach(btn =>
    btn.addEventListener('click', () => _handleKeep(btn.dataset.id)));
  list.querySelectorAll('.pending-dismiss').forEach(btn =>
    btn.addEventListener('click', () => _handleDismiss(btn.dataset.id)));
}

async function _handleKeep(tagGroupId) {
  if (!editResource) return;
  if (!editResource.tags.includes(tagGroupId)) {
    await rm.updateResource(editResource.id, {
      tags: [...editResource.tags, tagGroupId]
    });
    editResource = rm.getResourceById(editResource.id);
    _renderKnownState(editResource);
  }
  await _removePendingTag(tagGroupId);
}

async function _handleDismiss(tagGroupId) {
  await _removePendingTag(tagGroupId);
}

async function _removePendingTag(tagGroupId) {
  await chrome.runtime.sendMessage({
    type: MSG.CLEAR_PENDING_TAG,
    resourceId:  editResource.id,
    tagGroupId,
  });
  pendingTagIds = pendingTagIds.filter(id => id !== tagGroupId);

  if (pendingTagIds.length === 0) {
    document.getElementById('pending-tags-section').classList.add('hidden');
    chrome.action.setBadgeText({ text: '✓', tabId: currentTab.id });
    chrome.action.setBadgeBackgroundColor({ color: '#22c55e', tabId: currentTab.id });
  } else {
    _renderPendingList();
  }
}

// ─── Star helpers ─────────────────────────────────────────────────────────────
function _renderStarDisplay(id, rating) {
  document.getElementById(id).textContent =
    rating ? '★'.repeat(rating) + '☆'.repeat(5 - rating) : '—';
}

function _renderStarInput(containerId, value) {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = '';
  el.dataset.value = value;
  for (let i = 1; i <= 5; i++) {
    const s = document.createElement('span');
    s.className   = 'star' + (i <= value ? ' active' : '');
    s.textContent = '★';
    s.dataset.val = i;
    el.appendChild(s);
  }
}

function _getStarValue(containerId) {
  return parseInt(document.getElementById(containerId)?.dataset.value, 10) || null;
}

// ─── Event wiring ─────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // Delegated star-input clicks
  document.addEventListener('click', e => {
    const star = e.target.closest('.star-input .star');
    if (!star) return;
    const cont = star.closest('.star-input');
    const val  = parseInt(star.dataset.val, 10);
    const prev = parseInt(cont.dataset.value, 10);
    _renderStarInput(cont.id, val === prev ? 0 : val);
  });

  document.getElementById('btn-dashboard').addEventListener('click', () => _openDashboard());
  document.getElementById('btn-update').addEventListener('click',    _handleUpdate);
  document.getElementById('btn-open-in-dashboard').addEventListener('click', () =>
    _openDashboard(editResource?.id));
  document.getElementById('btn-link-url').addEventListener('click',  _handleLinkUrl);
  document.getElementById('btn-open-matched').addEventListener('click', () =>
    _openDashboard(editResource?.id));
  document.getElementById('btn-add').addEventListener('click', _handleAdd);
});

// ─── Action handlers ──────────────────────────────────────────────────────────
async function _handleUpdate() {
  if (!editResource) return;
  try {
    const rawTags = document.getElementById('known-tags-input').value;
    const tagIds  = _parseTags(rawTags).map(label => tgm.getOrCreate(label).id);
    await tgm.save();
    await rm.updateResource(editResource.id, { tags: tagIds, rating: _getStarValue('known-rating-input') });
    editResource = rm.getResourceById(editResource.id);
    _renderKnownState(editResource);
    _showToast('Saved ✓', 'success');
  } catch (e) { _showToast(e.message, 'error'); }
}

async function _handleLinkUrl() {
  if (!currentTab?.url || !editResource) return;
  try {
    await rm.addUrl(currentTab.url, {});
    editResource = rm.getResourceByUrl(currentTab.url);
    _renderKnownState(editResource);
    await _loadPendingTags(editResource);
    _showState('known');
    _showToast('URL linked ✓', 'success');
  } catch (e) { _showToast(e.message, 'error'); }
}

async function _handleAdd() {
  const url  = currentTab?.url;
  if (!url)  return;
  const name   = document.getElementById('new-id').value.trim();
  const tagIds = _parseTags(document.getElementById('new-tags').value)
    .map(label => tgm.getOrCreate(label).id);
  await tgm.save();
  const rating = _getStarValue('new-rating');

  if (!name && !extractIdFromUrl(url)) { _showToast('Please enter a name', 'error'); return; }
  try {
    const { resource } = await rm.addUrl(url, { name, tags: tagIds, rating, title: currentTab.title });
    editResource = resource;
    _renderKnownState(resource);
    _showState('known');
    _showToast('Resource added ✓', 'success');
    chrome.runtime.sendMessage({ type: MSG.SCHEDULE_TITLE_FETCH, url });
  } catch (e) { _showToast(e.message, 'error'); }
}

// ─── Utilities ────────────────────────────────────────────────────────────────
function _openDashboard(resourceId = null) {
  const base = chrome.runtime.getURL('dashboard/dashboard.html');
  chrome.tabs.create({ url: resourceId ? `${base}#${encodeURIComponent(resourceId)}` : base });
  window.close();
}

function _parseTags(raw) { return raw.split(',').map(t => t.trim()).filter(Boolean); }
function _esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

let _toastTimer;
function _showToast(msg, type = '') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className   = `toast${type ? ' ' + type : ''}`;
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => el.classList.add('hidden'), 2200);
}