import { ResourceManager }   from '../src/resource-manager.js';
import { TagGroupManager }   from '../src/tag-group-manager.js';
import { extractIdFromUrl }  from '../src/id-extractor.js';
import { MSG, STORAGE_KEYS } from '../src/constants.js';

// ─── Module state ─────────────────────────────────────────────────────────────
const rm  = new ResourceManager();
const tgm = new TagGroupManager();
let currentTab    = null;
let editResource  = null;
let knownChips    = null; // TagChipInput for state-known
let newChips      = null; // TagChipInput for state-new
let idMatchChips  = null; // TagChipInput for state-id-match

// ─── Chip-based tag input ─────────────────────────────────────────────────────
/**
 * Manages a chip list of Tag Group IDs inside a .chip-input-wrap element.
 * Chips are styled by status: 'existing' | 'detected' | 'created'.
 * Provides live autocomplete against tgm aliases and on-Enter tag commit.
 */
class TagChipInput {
  constructor(wrapId, inputId, dropdownId) {
    this.wrap     = document.getElementById(wrapId);
    this.input    = document.getElementById(inputId);
    this.dropdown = document.getElementById(dropdownId);
    this._ids    = [];   // ordered Tag Group IDs
    this._status = {};   // { [id]: 'existing'|'detected'|'created' }
    this._acIdx  = -1;
    this._setup();
  }

  // ── Public API ───────────────────────────────────────────────────────────────

  /** Load existing resource tags (no badge). */
  setExisting(ids) {
    this._ids = []; this._status = {};
    for (const id of ids) this._add(id, 'existing');
    this._render();
  }

  /** Merge page-detected ids on top of existing chips. */
  mergeDetected(ids) {
    for (const id of ids) this._add(id, 'detected');
    this._render();
  }

  /** Set detected-only tags (for new resource with no existing tags). */
  setDetected(ids) {
    this._ids = []; this._status = {};
    for (const id of ids) this._add(id, 'detected');
    this._render();
  }

  getIds() { return [...this._ids]; }

  addById(id, status = 'existing') {
    if (!this._add(id, status)) return; // duplicate — ignore
    this._render();
  }

  removeById(id) {
    this._ids    = this._ids.filter(x => x !== id);
    delete this._status[id];
    this._render();
  }

  // ── Internal helpers ─────────────────────────────────────────────────────────

  _add(id, status) {
    if (this._ids.includes(id)) return false;
    this._ids.push(id);
    this._status[id] = status;
    return true;
  }

  _render() {
    [...this.wrap.querySelectorAll('.tag-chip')].forEach(el => el.remove());
    for (const id of this._ids) {
      const tg     = tgm.getById(id);
      const label  = tg ? tg.primaryLabel : 'Unknown tag';
      const status = this._status[id] || 'existing';
      const badge  = status === 'detected' ? '<span class="chip-badge">detected</span>'
                   : status === 'created'  ? '<span class="chip-badge">new</span>'
                   : '';
      const chip = document.createElement('span');
      chip.className  = `tag-chip ${status}`;
      chip.dataset.id = id;
      chip.innerHTML  = `<span class="chip-label">${_esc(label)}</span>${badge}<button class="chip-rm" title="Remove">✕</button>`;
      chip.querySelector('.chip-rm').addEventListener('click', e => {
        e.stopPropagation(); this.removeById(id);
      });
      this.wrap.insertBefore(chip, this.input);
    }
  }

  // ── Events ───────────────────────────────────────────────────────────────────

  _setup() {
    this.wrap.addEventListener('click', e => {
      if (!e.target.closest('.tag-chip') && !e.target.closest('.ac-dropdown'))
        this.input.focus();
    });
    this.input.addEventListener('input',   ()  => this._updateDropdown());
    this.input.addEventListener('keydown', e   => this._handleKey(e));
    this.input.addEventListener('blur',    ()  => setTimeout(() => this._closeDropdown(), 160));
  }

  _updateDropdown() {
    const q = this.input.value.trim();
    if (!q) { this._closeDropdown(); return; }
    const lq = q.toLowerCase();

    const matched = tgm.getAll()
      .filter(tg => !this._ids.includes(tg.id))
      .filter(tg => tg.aliases.some(a => a.toLowerCase().includes(lq)))
      .slice(0, 6);

    const exactMatch = tgm.findByAlias(q);
    const rows = matched.map(tg =>
      `<div class="ac-item" data-id="${_esc(tg.id)}">${_esc(tg.primaryLabel)}</div>`);
    if (!exactMatch)
      rows.push(`<div class="ac-item ac-create" data-value="${_esc(q)}">${_esc(q)}</div>`);

    if (!rows.length) { this._closeDropdown(); return; }

    this.dropdown.innerHTML = rows.join('');
    this.dropdown.querySelectorAll('.ac-item').forEach(el =>
      el.addEventListener('mousedown', e => {
        e.preventDefault();
        if (el.dataset.id)         this.addById(el.dataset.id, 'existing');
        else if (el.dataset.value) this._createAndAdd(el.dataset.value);
        this.input.value = ''; this._closeDropdown(); this.input.focus();
      })
    );
    this._acIdx = -1;
    this.dropdown.classList.remove('hidden');
  }

  _handleKey(e) {
    const q = this.input.value.trim();
    if (e.key === 'Enter' || e.key === 'Tab') {
      const active = this.dropdown.querySelector('.ac-item.active');
      // Only intercept Tab when there's something to commit; otherwise let it shift focus naturally
      if (e.key === 'Tab' && !active && !q) return;
      e.preventDefault();
      if (active) {
        if (active.dataset.id)         this.addById(active.dataset.id, 'existing');
        else if (active.dataset.value) this._createAndAdd(active.dataset.value);
      } else if (q) {
        const tg = tgm.findByAlias(q);
        if (tg) this.addById(tg.id, 'existing'); else this._createAndAdd(q);
      }
      this.input.value = ''; this._closeDropdown();
      // Keep focus in the input field for continued tag entry
      this.input.focus();
    } else if (e.key === 'Escape') {
      this._closeDropdown();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault(); this._navigateAc(1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault(); this._navigateAc(-1);
    } else if (e.key === 'Backspace' && !this.input.value && this._ids.length > 0) {
      this.removeById(this._ids[this._ids.length - 1]);
    }
  }

  _createAndAdd(label) {
    // tgm.save() is called by the parent handler on commit, not here
    const tg = tgm.getOrCreate(label);
    this.addById(tg.id, 'created');
  }

  _navigateAc(dir) {
    const items = [...this.dropdown.querySelectorAll('.ac-item')];
    if (!items.length) return;
    items.forEach(i => i.classList.remove('active'));
    this._acIdx = Math.max(-1, Math.min(items.length - 1, this._acIdx + dir));
    if (this._acIdx >= 0) items[this._acIdx].classList.add('active');
  }

  _closeDropdown() {
    this.dropdown.classList.add('hidden');
    this.dropdown.innerHTML = '';
    this._acIdx = -1;
  }
}

// ─── Page structure extractor ─────────────────────────────────────────────────
// Self-contained function injected into the current tab via chrome.scripting.
// Mirrors _extractStructuredValues in service-worker.js.
// Must NOT close over any module-level variables.
function _extractStructuredValues() {
  try {
    const TRAVERSE_SKIP = new Set(['SCRIPT','STYLE','NOSCRIPT','HEAD','IFRAME','TEMPLATE','NAV','FOOTER']);
    const TEXT_SKIP     = new Set(['SCRIPT','STYLE','NOSCRIPT','HEAD','IFRAME','TEMPLATE']);
    function isVisible(el) {
      try { const cs=window.getComputedStyle(el); return cs.display!=='none'&&cs.visibility!=='hidden'; }
      catch(_){return true;}
    }
    function innerText(el) {
      let t='';
      for(const n of el.childNodes){
        if(n.nodeType===3) t+=n.nodeValue;
        else if(n.nodeType===1&&!TEXT_SKIP.has(n.tagName)) t+=innerText(n);
      }
      return t.replace(/\s+/g,' ').trim();
    }
    const values=new Set();
    function addValue(el){if(!el||!isVisible(el))return;const t=innerText(el);if(t&&t.length>=1&&t.length<500)values.add(t);}
    document.querySelectorAll('tr').forEach(row=>{
      if(!isVisible(row))return;
      const cells=[...row.querySelectorAll(':scope > th, :scope > td')];
      if(cells.length<2)return;
      cells.slice(1).forEach(addValue);
    });
    document.querySelectorAll('dd').forEach(addValue);
    document.querySelectorAll('label').forEach(lbl=>{
      if(!isVisible(lbl))return;
      const forId=lbl.getAttribute('for');
      if(forId){const t=document.getElementById(forId);if(t){addValue(t);return;}}
      let sib=lbl.nextElementSibling;
      while(sib&&!isVisible(sib))sib=sib.nextElementSibling;
      if(sib)addValue(sib);
    });
    function scanForPairs(container){
      if(!container||TRAVERSE_SKIP.has(container.tagName))return;
      const children=[...container.children];
      for(let i=0;i<children.length;i++){
        const el=children[i];if(!isVisible(el))continue;
        if(['TABLE','DL','TR','THEAD','TBODY','TFOOT'].includes(el.tagName))continue;
        const t=innerText(el).trim();
        if(t.endsWith(':')&&t.length<=100&&el.children.length<=2){
          for(let j=i+1;j<children.length;j++){if(isVisible(children[j])){addValue(children[j]);break;}}
        }else{scanForPairs(el);}
      }
    }
    if(document.body)scanForPairs(document.body);
    if(values.size===0)return'';
    return[...values].join('\n').slice(0,100000);
  }catch(_){return'';}
}

// ─── Init ─────────────────────────────────────────────────────────────────────
(async () => {
  await rm.initialize();
  await tgm.initialize();
  if (tgm.migrateResources(rm.resources)) { await tgm.save(); await rm.save(); }
  if (tgm.resolveOrphanedTags(rm.resources) > 0) { await tgm.save(); }
  currentTab = await _getActiveTab();
  const detectedIds = await _scanPageForTags();
  await _determineState(detectedIds);
})();

async function _getActiveTab() {
  return new Promise(r =>
    chrome.tabs.query({ active: true, currentWindow: true }, ([t]) => r(t || null)));
}

// ─── Page tag scan ────────────────────────────────────────────────────────────
async function _scanPageForTags() {
  if (!currentTab?.id || !currentTab.url?.startsWith('http')) return [];
  if (tgm.getAll().length === 0) return [];
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: currentTab.id },
      func:   _extractStructuredValues,
    });
    const pageText = results?.[0]?.result || '';
    if (!pageText) return [];
    return tgm.findMatchesInText(pageText).map(m => m.tagGroup.id);
  } catch { return []; }
}

// ─── State determination ──────────────────────────────────────────────────────
async function _determineState(detectedIds = []) {
  const url = currentTab?.url;
  if (!url || !url.startsWith('http')) { _showState('system'); return; }

  // 1. Direct URL match
  const resource = rm.getResourceByUrl(url);
  if (resource) {
    editResource = resource;
    // Merge: fresh page scan + any previously stored pending tags (from SW)
    const stored  = await chrome.storage.local.get(STORAGE_KEYS.PENDING_TAGS);
    const stored_ = (stored[STORAGE_KEYS.PENDING_TAGS] || {})[resource.id] || [];
    const allNew  = [...new Set([...stored_, ...detectedIds])]
      .filter(id => tgm.getById(id) && !resource.tags.includes(id));
    _renderKnownState(resource, allNew);
    _showState('known');
    return;
  }

  // 2. ID-only match (URL not stored, but its ID belongs to a known resource)
  const extractedId = extractIdFromUrl(url);
  if (extractedId) {
    const byId = rm.getResourceById(extractedId);
    if (byId) {
      editResource = byId;
      document.getElementById('id-match-id').textContent = extractedId;
      _renderIdMatchState(byId, detectedIds);
      _showState('id-match');
      return;
    }
  }

  // 3. New resource
  _renderNewState(url, extractedId, detectedIds);
  _showState('new');
}

// ─── Render helpers ───────────────────────────────────────────────────────────
function _showState(name) {
  ['loading','system','known','id-match','new'].forEach(p =>
    document.getElementById(`state-${p}`)?.classList.toggle('hidden', p !== name));
}

function _renderKnownState(resource, detectedIds = []) {
  document.getElementById('known-id-badge').textContent = resource.id;
  document.getElementById('known-pattern-tag').classList.toggle('hidden', !resource.isPatternId);
  document.getElementById('known-url-count').textContent =
    `${resource.urls.length} URL${resource.urls.length !== 1 ? 's' : ''}`;

  const titlesEl = document.getElementById('known-titles');
  titlesEl.innerHTML = resource.titles.length
    ? resource.titles.slice(0, 2).map(t => `<div>${_esc(t)}</div>`).join('')
    : `<span class="muted">—</span>`;

  // Read-only tag summary in the info card
  const tagsEl = document.getElementById('known-tags');
  tagsEl.innerHTML = resource.tags.length
    ? resource.tags.map(id => {
        const label = tgm.getById(id)?.primaryLabel || 'Unknown tag';
        return `<span class="tag-chip">${_esc(label)}</span>`;
      }).join('')
    : `<span class="muted small">—</span>`;

  _renderStarDisplay('known-rating-display', resource.rating);

  // Chip input — recreate on every render so chips are always fresh
  knownChips = new TagChipInput('known-chip-wrap', 'known-chip-text', 'known-ac-drop');
  knownChips.setExisting(resource.tags);
  if (detectedIds.length > 0) knownChips.mergeDetected(detectedIds);

  _renderStarInput('known-rating-input', resource.rating || 0);
}

function _renderNewState(url, extractedId, detectedIds = []) {
  const idInput = document.getElementById('new-id');
  const badge   = document.getElementById('extracted-id-badge');
  if (extractedId) {
    idInput.value = extractedId; idInput.readOnly = true;
    badge.textContent = 'auto-detected'; badge.classList.remove('hidden');
  } else {
    idInput.value = ''; idInput.readOnly = false;
    badge.classList.add('hidden');
  }
  newChips = new TagChipInput('new-chip-wrap', 'new-chip-text', 'new-ac-drop');
  if (detectedIds.length > 0) newChips.setDetected(detectedIds);
  _renderStarInput('new-rating', 0);
}

/**
 * Render the id-match state panel:
 *  - compact summary of the matched resource
 *  - chip input pre-populated with existing tags + page-detected tags
 */
function _renderIdMatchState(resource, detectedIds = []) {
  // Fill compact resource preview card
  const card = document.getElementById('id-match-resource-card');
  const tagLabels = resource.tags
    .slice(0, 4)
    .map(id => tgm.getById(id)?.primaryLabel || 'Unknown tag')
    .join(', ') || '—';
  const moreTags = resource.tags.length > 4 ? ` +${resource.tags.length - 4}` : '';
  card.innerHTML = `
    <div class="resource-preview-row">
      <span class="resource-preview-label">ID</span>
      <span class="resource-preview-value" style="font-weight:700;font-family:monospace">${_esc(resource.id)}</span>
      ${resource.isPatternId ? '<span class="tag-pattern" style="font-size:9px">ID</span>' : ''}
    </div>
    <div class="resource-preview-row">
      <span class="resource-preview-label">URLs</span>
      <span class="resource-preview-value">${resource.urls.length} stored</span>
    </div>
    <div class="resource-preview-row">
      <span class="resource-preview-label">Tags</span>
      <span class="resource-preview-value">${_esc(tagLabels + moreTags)}</span>
    </div>`;

  // Chip input: existing resource tags + newly detected tags
  idMatchChips = new TagChipInput('idmatch-chip-wrap', 'idmatch-chip-text', 'idmatch-ac-drop');
  idMatchChips.setExisting(resource.tags);
  if (detectedIds.length > 0) {
    const newDetected = detectedIds.filter(id => !resource.tags.includes(id));
    if (newDetected.length > 0) idMatchChips.mergeDetected(newDetected);
  }
}

// ─── Stars ────────────────────────────────────────────────────────────────────
function _renderStarDisplay(id, rating) {
  document.getElementById(id).textContent =
    rating ? '★'.repeat(rating) + '☆'.repeat(5 - rating) : '—';
}

function _renderStarInput(containerId, value) {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = ''; el.dataset.value = value;
  for (let i = 1; i <= 5; i++) {
    const s = document.createElement('span');
    s.className = 'star' + (i <= value ? ' active' : '');
    s.textContent = '★'; s.dataset.val = i;
    el.appendChild(s);
  }
}

function _getStarValue(containerId) {
  return parseInt(document.getElementById(containerId)?.dataset.value, 10) || null;
}

// ─── Pending tags cleanup (called after save so badge resets) ─────────────────
async function _clearPendingTags(resourceId) {
  const stored  = await chrome.storage.local.get(STORAGE_KEYS.PENDING_TAGS);
  const pending = stored[STORAGE_KEYS.PENDING_TAGS] || {};
  if (pending[resourceId]) {
    delete pending[resourceId];
    await chrome.storage.local.set({ [STORAGE_KEYS.PENDING_TAGS]: pending });
  }
}

// ─── Event wiring ─────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // Delegated star clicks
  document.addEventListener('click', e => {
    const star = e.target.closest('.star-input .star'); if (!star) return;
    const cont = star.closest('.star-input');
    const val  = parseInt(star.dataset.val, 10);
    const prev = parseInt(cont.dataset.value, 10);
    _renderStarInput(cont.id, val === prev ? 0 : val);
  });

  document.getElementById('btn-dashboard').addEventListener('click', () => _openDashboard());
  document.getElementById('btn-update').addEventListener('click', _handleUpdate);
  document.getElementById('btn-open-in-dashboard').addEventListener('click', () =>
    _openDashboard(editResource?.id));
  document.getElementById('btn-link-url').addEventListener('click', _handleLinkUrl);
  document.getElementById('btn-open-matched').addEventListener('click', () =>
    _openDashboard(editResource?.id));
  document.getElementById('btn-add').addEventListener('click', _handleAdd);
});

// ─── Action handlers ──────────────────────────────────────────────────────────
async function _handleUpdate() {
  if (!editResource || !knownChips) return;
  try {
    await tgm.save(); // persist any newly created Tag Groups
    await rm.updateResource(editResource.id, {
      tags:   knownChips.getIds(),
      rating: _getStarValue('known-rating-input'),
    });
    editResource = rm.getResourceById(editResource.id);
    // Clear stored pending tags — user reviewed them via chip input
    await _clearPendingTags(editResource.id);
    // Reset badge to ✓
    if (currentTab?.id) {
      chrome.action.setBadgeText({ text: '✓', tabId: currentTab.id });
      chrome.action.setBadgeBackgroundColor({ color: '#22c55e', tabId: currentTab.id });
    }
    _renderKnownState(editResource, []); // re-render without detected chips
    _showToast('Saved ✓', 'success');
  } catch (e) { _showToast(e.message, 'error'); }
}

async function _handleLinkUrl() {
  if (!currentTab?.url || !editResource) return;
  try {
    const tagIds = idMatchChips ? idMatchChips.getIds() : [];
    await tgm.save(); // persist any newly created Tag Groups
    await rm.addUrl(currentTab.url, { tags: tagIds });
    editResource = rm.getResourceByUrl(currentTab.url);
    _renderKnownState(editResource, []);
    _showState('known');
    _showToast('URL linked ✓', 'success');
  } catch (e) { _showToast(e.message, 'error'); }
}

async function _handleAdd() {
  const url = currentTab?.url; if (!url) return;
  const name   = document.getElementById('new-id').value.trim();
  const tagIds = newChips ? newChips.getIds() : [];
  const rating = _getStarValue('new-rating');
  if (!name && !extractIdFromUrl(url)) { _showToast('Please enter a name', 'error'); return; }
  try {
    await tgm.save(); // persist any newly created Tag Groups
    const { resource } = await rm.addUrl(url, { name, tags: tagIds, rating, title: currentTab.title });
    editResource = resource;
    knownChips = null; // force fresh creation in renderKnownState
    _renderKnownState(resource, []);
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

function _esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

let _toastTimer;
function _showToast(msg, type = '') {
  const el = document.getElementById('toast');
  el.textContent = msg; el.className = `toast${type ? ' ' + type : ''}`;
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => el.classList.add('hidden'), 2200);
}