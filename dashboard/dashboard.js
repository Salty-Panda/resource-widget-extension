import { ResourceManager }  from '../src/resource-manager.js';
import { TagGroupManager }  from '../src/tag-group-manager.js';
import { ImportManager }    from '../src/import-manager.js';
import { MigrationManager } from '../src/migration-manager.js';
import { BackupManager }    from '../src/backup-manager.js';
import { normalizeId }      from '../src/id-extractor.js';
import { isValidUrl, normalizeUrl, selectUrlByPriority, getDomain } from '../src/url-utils.js';

// ─── Managers ────────────────────────────────────────────────────────────────
const rm  = new ResourceManager();
const tgm = new TagGroupManager();
let   im   = null;
let   migm = null;

// ─── State ───────────────────────────────────────────────────────────────────
const state = {
  all:      [],
  filtered: [],
  page:     1,
  pageSize: 50,
  query:    '',
  sort:     'updatedAt',
  filters: { tags: [], excludeTags: [], minRating: 0, patternOnly: false },
  editingResource: null,
  mergeSourceId:   null,
};

// ─── Init ────────────────────────────────────────────────────────────────────
(async () => {
  await rm.initialize();
  await tgm.initialize();
  // One-time migration: flat string tags → Tag Group IDs
  if (tgm.migrateResources(rm.resources)) { await tgm.save(); await rm.save(); }
  im   = new ImportManager(rm, tgm);
  migm = new MigrationManager(rm);
  loadAll();
  bindStaticEvents();
  checkUrlHash();
})();

function loadAll() {
  state.all = rm.getAllResources();
  applyAndRender();
  updateTagDatalist();
  renderFilterChips();
}

// ─── Tag alias resolver (passed to searchResources) ───────────────────────────
function tagResolver(id) { return tgm.getById(id)?.aliases || []; }

function applyAndRender() {
  state.filtered = rm.searchResources(state.query, state.filters, state.sort, tagResolver);
  state.page = 1;
  renderTable();
  renderPagination();
  renderStats();
  renderResultsCount();
}

// ─── URL hash → auto-open ────────────────────────────────────────────────────
function checkUrlHash() {
  const hash = decodeURIComponent(location.hash.replace('#', ''));
  if (!hash) return;
  const res = rm.getResourceById(hash);
  if (res) openResourceModal(res);
}

// ─── Table ────────────────────────────────────────────────────────────────────
function renderTable() {
  const tbody = document.getElementById('resource-tbody');
  const empty = document.getElementById('empty-state');
  const items = state.filtered.slice((state.page - 1) * state.pageSize, state.page * state.pageSize);

  if (!items.length) { tbody.innerHTML = ''; empty.classList.remove('hidden'); return; }
  empty.classList.add('hidden');
  tbody.innerHTML = items.map(renderRow).join('');

  tbody.querySelectorAll('tr[data-id]').forEach(row => {
    row.addEventListener('click', e => {
      if (e.target.closest('button')) return;
      const res = rm.getResourceById(row.dataset.id);
      if (res) openResourceModal(res);
    });
  });
  tbody.querySelectorAll('.btn-row-incognito').forEach(btn =>
    btn.addEventListener('click', e => { e.stopPropagation(); openInIncognito(btn.dataset.id); }));
  tbody.querySelectorAll('.btn-row-delete').forEach(btn =>
    btn.addEventListener('click', e => { e.stopPropagation(); confirmDeleteResource(btn.dataset.id); }));
}

function renderRow(r) {
  const title    = r.titles[0] || '—';
  const tagHtml  = r.tags.slice(0, 3).map(id => {
    const label = tgm.getById(id)?.primaryLabel || id;
    return `<span class="tag-chip-sm">${esc(label)}</span>`;
  }).join('') + (r.tags.length > 3 ? `<span class="tag-more">+${r.tags.length - 3}</span>` : '');
  const rating   = r.rating ? '★'.repeat(r.rating) : '—';
  const patBadge = r.isPatternId ? '<span class="tag-pattern-sm">ID</span>' : '';
  return `<tr data-id="${esc(r.id)}" title="Click to edit">
    <td><div class="id-cell"><span class="id-text">${esc(r.id)}</span>${patBadge}</div></td>
    <td class="title-cell" title="${esc(title)}">${esc(title)}</td>
    <td><div class="tags-cell">${tagHtml}</div></td>
    <td class="rating-cell" style="text-align:center">${esc(rating)}</td>
    <td class="urls-count">${r.urls.length}</td>
    <td><div class="row-actions">
      <button class="btn btn-secondary btn-sm btn-row-incognito" data-id="${esc(r.id)}" title="Open in incognito">🕵</button>
      <button class="btn btn-danger btn-sm btn-row-delete" data-id="${esc(r.id)}" title="Delete">✕</button>
    </div></td>
  </tr>`;
}

// ─── Pagination ───────────────────────────────────────────────────────────────
function renderPagination() {
  const total = Math.ceil(state.filtered.length / state.pageSize);
  const el    = document.getElementById('pagination');
  if (total <= 1) { el.innerHTML = ''; return; }
  let html = `<button class="page-btn" data-page="${state.page - 1}" ${state.page === 1 ? 'disabled' : ''}>‹ Prev</button>`;
  const s = Math.max(1, state.page - 2), e2 = Math.min(total, state.page + 2);
  if (s > 1) html += `<button class="page-btn" data-page="1">1</button>${s > 2 ? '<span class="page-info">…</span>' : ''}`;
  for (let i = s; i <= e2; i++) html += `<button class="page-btn${i === state.page ? ' active' : ''}" data-page="${i}">${i}</button>`;
  if (e2 < total) html += `${e2 < total - 1 ? '<span class="page-info">…</span>' : ''}<button class="page-btn" data-page="${total}">${total}</button>`;
  html += `<button class="page-btn" data-page="${state.page + 1}" ${state.page === total ? 'disabled' : ''}>Next ›</button>`;
  el.innerHTML = html;
  el.querySelectorAll('.page-btn:not(:disabled)').forEach(btn =>
    btn.addEventListener('click', () => { state.page = +btn.dataset.page; renderTable(); renderPagination(); }));
}

// ─── Stats ────────────────────────────────────────────────────────────────────
function renderStats() {
  const totalUrls = state.all.reduce((s, r) => s + r.urls.length, 0);
  document.getElementById('stats-total').innerHTML  = `<strong>${state.all.length}</strong> total resources`;
  document.getElementById('stats-shown').innerHTML  = `<strong>${state.filtered.length}</strong> matching`;
  document.getElementById('stats-urls').innerHTML   = `<strong>${totalUrls}</strong> total URLs`;
}
function renderResultsCount() {
  document.getElementById('results-count').textContent =
    `${state.filtered.length} resource${state.filtered.length !== 1 ? 's' : ''}`;
}

// ─── Tag datalist + filter chips ──────────────────────────────────────────────
function updateTagDatalist() {
  const opts = new Set();
  tgm.getAll().forEach(tg => { opts.add(tg.primaryLabel); tg.aliases.forEach(a => opts.add(a)); });
  const dl = document.getElementById('tag-datalist');
  if (dl) dl.innerHTML = [...opts].map(o => `<option value="${esc(o)}"></option>`).join('');
  const mdl = document.getElementById('merge-target-datalist');
  if (mdl) mdl.innerHTML = state.all.map(r => `<option value="${esc(r.id)}"></option>`).join('');
}

function renderFilterChips() {
  _renderChips('filter-tags-list',         state.filters.tags,        false);
  _renderChips('filter-exclude-tags-list', state.filters.excludeTags, true);
}
function _renderChips(containerId, tagIds, isExclude) {
  const el = document.getElementById(containerId);
  el.innerHTML = tagIds.map(id => {
    const label = tgm.getById(id)?.primaryLabel || id;
    return `<span class="filter-chip${isExclude ? ' filter-chip-ex' : ''}" data-tagid="${esc(id)}">
      ${esc(label)}<span class="filter-chip-x">✕</span></span>`;
  }).join('');
  el.querySelectorAll('.filter-chip').forEach(chip =>
    chip.addEventListener('click', () => {
      const id = chip.dataset.tagid;
      if (isExclude) state.filters.excludeTags = state.filters.excludeTags.filter(x => x !== id);
      else           state.filters.tags        = state.filters.tags.filter(x => x !== id);
      renderFilterChips(); applyAndRender();
    }));
}

// ─── Resource Edit Modal ──────────────────────────────────────────────────────
function openResourceModal(resource) {
  state.editingResource = resource;
  location.hash = encodeURIComponent(resource.id);
  document.getElementById('res-modal-id-badge').textContent = resource.id;
  document.getElementById('res-modal-pattern-tag').classList.toggle('hidden', !resource.isPatternId);
  document.getElementById('res-id-input').value = resource.id;
  renderModalUrls(resource.urls);
  renderModalTitles(resource.titles);
  renderModalTags(resource.tags);
  renderStarInput('res-rating-input', resource.rating || 0);
  const fmt = ts => ts ? new Date(ts).toLocaleString() : '—';
  document.getElementById('res-meta-created').textContent = `Created: ${fmt(resource.createdAt)}`;
  document.getElementById('res-meta-updated').textContent = `Modified: ${fmt(resource.updatedAt)}`;
  openModal('modal-resource');
}

function renderModalUrls(urls) {
  const list = document.getElementById('res-urls-list');
  list.innerHTML = urls.map(url =>
    `<li class="url-item"><a href="${esc(url)}" target="_blank">${esc(url)}</a>
     <button data-url="${esc(url)}" class="url-remove">✕</button></li>`).join('');
  list.querySelectorAll('.url-remove').forEach(btn =>
    btn.addEventListener('click', () => {
      state.editingResource.urls = state.editingResource.urls.filter(u => u !== btn.dataset.url);
      renderModalUrls(state.editingResource.urls);
    }));
}

function renderModalTitles(titles) {
  const list = document.getElementById('res-titles-list');
  list.innerHTML = titles.map(t =>
    `<li class="title-item"><span>${esc(t)}</span>
     <button data-title="${esc(t)}" class="title-remove">✕</button></li>`).join('');
  list.querySelectorAll('.title-remove').forEach(btn =>
    btn.addEventListener('click', () => {
      state.editingResource.titles = state.editingResource.titles.filter(t => t !== btn.dataset.title);
      renderModalTitles(state.editingResource.titles);
    }));
}

function renderModalTags(tagIds) {
  const el = document.getElementById('res-tags-editor');
  el.innerHTML = tagIds.map(id => {
    const label = tgm.getById(id)?.primaryLabel || id;
    return `<span class="tag-edit-chip">${esc(label)}
      <button data-tagid="${esc(id)}" class="tag-remove">✕</button></span>`;
  }).join('');
  el.querySelectorAll('.tag-remove').forEach(btn =>
    btn.addEventListener('click', () => {
      state.editingResource.tags = state.editingResource.tags.filter(t => t !== btn.dataset.tagid);
      renderModalTags(state.editingResource.tags);
    }));
}

// ─── Save / delete ────────────────────────────────────────────────────────────
async function saveResource() {
  const res = state.editingResource;
  if (!res) return;
  const newId = document.getElementById('res-id-input').value.trim();
  if (!newId) { showToast('ID cannot be empty', 'error'); return; }
  try {
    const updated = await rm.updateResource(res.id, {
      id: newId, urls: res.urls, titles: res.titles,
      tags: res.tags, rating: getStarValue('res-rating-input'),
    });
    state.editingResource = updated;
    closeModal('modal-resource');
    showToast('Saved ✓', 'success');
    loadAll();
  } catch (e) { showToast(e.message, 'error'); }
}

async function confirmDeleteResource(id) {
  if (!confirm(`Delete resource "${id}"?\nThis cannot be undone.`)) return;
  await rm.deleteResource(id);
  closeModal('modal-resource');
  showToast('Deleted', 'warn');
  loadAll();
}

// ─── Merge Modal ──────────────────────────────────────────────────────────────
function openMergeModal(sourceId) {
  state.mergeSourceId = sourceId;
  document.getElementById('merge-source-label').textContent = sourceId;
  document.getElementById('merge-target-input').value = '';
  document.getElementById('merge-final-id').value = '';
  document.getElementById('merge-preview').classList.add('hidden');
  document.getElementById('merge-btn-confirm').disabled = true;
  const dl = document.getElementById('merge-target-datalist');
  if (dl) dl.innerHTML = state.all.filter(r => r.id !== sourceId)
    .map(r => `<option value="${esc(r.id)}"></option>`).join('');
  closeModal('modal-resource');
  openModal('modal-merge');
}

function previewMerge() {
  const targetId = document.getElementById('merge-target-input').value.trim();
  if (!targetId) { showToast('Enter target ID', 'error'); return; }
  const src = rm.getResourceById(state.mergeSourceId);
  const tgt = rm.getResourceById(targetId);
  if (!src || !tgt) { showToast('Resource not found', 'error'); return; }
  const preview = document.getElementById('merge-preview');
  preview.classList.remove('hidden');
  preview.innerHTML = `
    <strong style="font-size:12px;color:var(--text)">Merge preview</strong>
    <div class="mt-8"><span class="muted small">Combined URLs:</span> ${[...new Set([...src.urls,...tgt.urls])].length}</div>
    <div><span class="muted small">Combined titles:</span> ${[...new Set([...src.titles,...tgt.titles])].length}</div>
    <div><span class="muted small">Combined tags:</span> ${[...new Set([...src.tags,...tgt.tags])].map(id => tgm.getById(id)?.primaryLabel || id).join(', ') || '—'}</div>
    <div><span class="muted small">Rating:</span> ${tgt.rating ?? src.rating ?? '—'}</div>`;
  document.getElementById('merge-btn-confirm').disabled = false;
}

async function executeMerge() {
  const targetId   = document.getElementById('merge-target-input').value.trim();
  const resolvedId = document.getElementById('merge-final-id').value.trim() || null;
  try {
    await rm.mergeResources(state.mergeSourceId, targetId, resolvedId);
    closeModal('modal-merge'); showToast('Merged ✓', 'success'); loadAll();
  } catch (e) { showToast(e.message, 'error'); }
}

// ─── Import Modal ─────────────────────────────────────────────────────────────
async function runBookmarkPreview() {
  const info = document.getElementById('import-preview-info');
  info.classList.remove('hidden'); info.textContent = 'Scanning bookmarks…';
  try {
    const items  = await im.preview();
    const withId = items.filter(i => i.detectedId).length;
    info.innerHTML = `Found <strong>${items.length}</strong> bookmarks — <strong>${withId}</strong> with auto-detected IDs.`;
    document.getElementById('import-step-2').classList.remove('hidden');
    document.getElementById('btn-import-confirm').classList.remove('hidden');
    document.getElementById('import-summary').innerHTML = `<strong>${items.length}</strong> bookmarks ready.`;
  } catch (e) { info.innerHTML = `<span class="text-danger">Error: ${esc(e.message)}</span>`; }
}

async function runImport() {
  const progressWrap = document.getElementById('import-progress');
  const progressFill = document.getElementById('import-progress-fill');
  const progressText = document.getElementById('import-progress-text');
  const confirmBtn   = document.getElementById('btn-import-confirm');
  progressWrap.classList.remove('hidden'); confirmBtn.disabled = true;
  const result = await im.importAll({ onProgress(done, total) {
    progressFill.style.width = Math.round(done/total*100) + '%';
    progressText.textContent = `${done} / ${total}`;
  }});
  progressText.textContent = `Done! Added: ${result.imported}, Merged: ${result.merged}, Skipped: ${result.skipped}`;
  showToast(`Import: ${result.imported} added, ${result.merged} merged`, 'success');
  loadAll();
}

// ─── Tag Group Management Modal ───────────────────────────────────────────────
function openTagsModal() {
  renderTagGroupList('');
  openModal('modal-tags');
}

function renderTagGroupList(filter) {
  const list = document.getElementById('tg-list');
  const groups = tgm.getAll().filter(tg =>
    !filter || tg.primaryLabel.toLowerCase().includes(filter.toLowerCase()) ||
    tg.aliases.some(a => a.toLowerCase().includes(filter.toLowerCase()))
  );
  if (!groups.length) { list.innerHTML = '<div style="padding:20px;color:var(--text-mute);text-align:center">No tag groups found.</div>'; return; }
  list.innerHTML = groups.map(tg => `
    <div class="tg-row" data-tgid="${esc(tg.id)}">
      <div class="tg-row-header">
        <span class="tg-primary-label">${esc(tg.primaryLabel)}</span>
        <div class="tg-actions">
          <button class="btn btn-secondary btn-sm tg-btn-edit">Edit</button>
          <button class="btn btn-danger btn-sm tg-btn-delete">Delete</button>
        </div>
      </div>
      <div class="tg-alias-list">
        ${tg.aliases.map(a => `<span class="tg-alias-chip">${esc(a)}
          ${tg.aliases.length > 1 ? `<button class="tg-alias-remove" data-alias="${esc(a)}" title="Remove alias">✕</button>` : ''}
        </span>`).join('')}
      </div>
      <div class="tg-expand-panel hidden">
        <div class="tg-expand-row">
          <label>Rename</label>
          <input class="form-input tg-rename-input" value="${esc(tg.primaryLabel)}" />
          <button class="btn btn-secondary btn-sm tg-btn-rename">OK</button>
        </div>
        <div class="tg-expand-row">
          <label>Add alias</label>
          <input class="form-input tg-alias-input" placeholder="New alias…" />
          <button class="btn btn-secondary btn-sm tg-btn-add-alias">Add</button>
        </div>
        <div class="tg-expand-row">
          <label>Merge into</label>
          <input class="form-input tg-merge-input" placeholder="Target group ID or label…" list="tg-merge-datalist" />
          <datalist id="tg-merge-datalist">
            ${tgm.getAll().filter(g => g.id !== tg.id).map(g => `<option value="${esc(g.id)}">${esc(g.primaryLabel)}</option>`).join('')}
          </datalist>
          <button class="btn btn-secondary btn-sm tg-btn-merge">Merge</button>
        </div>
      </div>
    </div>`).join('');

  // Wire events
  list.querySelectorAll('.tg-btn-edit').forEach(btn => {
    btn.addEventListener('click', () => {
      const panel = btn.closest('.tg-row').querySelector('.tg-expand-panel');
      panel.classList.toggle('hidden');
    });
  });

  list.querySelectorAll('.tg-alias-remove').forEach(btn => {
    btn.addEventListener('click', async () => {
      const tgId  = btn.closest('.tg-row').dataset.tgid;
      try { await tgm.removeAlias(tgId, btn.dataset.alias); renderTagGroupList(document.getElementById('tg-search').value); loadAll(); }
      catch (e) { showToast(e.message, 'error'); }
    });
  });

  list.querySelectorAll('.tg-btn-rename').forEach(btn => {
    btn.addEventListener('click', async () => {
      const row   = btn.closest('.tg-row');
      const tgId  = row.dataset.tgid;
      const label = row.querySelector('.tg-rename-input').value.trim();
      try { await tgm.renamePrimaryLabel(tgId, label); renderTagGroupList(document.getElementById('tg-search').value); loadAll(); }
      catch (e) { showToast(e.message, 'error'); }
    });
  });

  list.querySelectorAll('.tg-btn-add-alias').forEach(btn => {
    btn.addEventListener('click', async () => {
      const row   = btn.closest('.tg-row');
      const tgId  = row.dataset.tgid;
      const alias = row.querySelector('.tg-alias-input').value.trim();
      try { await tgm.addAlias(tgId, alias); renderTagGroupList(document.getElementById('tg-search').value); loadAll(); }
      catch (e) { showToast(e.message, 'error'); }
    });
  });

  list.querySelectorAll('.tg-btn-merge').forEach(btn => {
    btn.addEventListener('click', async () => {
      const row      = btn.closest('.tg-row');
      const sourceId = row.dataset.tgid;
      const rawTarget = row.querySelector('.tg-merge-input').value.trim();
      const targetTg  = tgm.findByAlias(rawTarget) || tgm.getById(rawTarget);
      if (!targetTg) { showToast('Target tag group not found', 'error'); return; }
      if (!confirm(`Merge "${tgm.getById(sourceId)?.primaryLabel}" into "${targetTg.primaryLabel}"?`)) return;
      try {
        await tgm.merge(sourceId, targetTg.id, rm.resources);
        await rm.save();
        showToast('Tag groups merged ✓', 'success');
        renderTagGroupList(document.getElementById('tg-search').value);
        loadAll();
      } catch (e) { showToast(e.message, 'error'); }
    });
  });

  list.querySelectorAll('.tg-btn-delete').forEach(btn => {
    btn.addEventListener('click', async () => {
      const tgId  = btn.closest('.tg-row').dataset.tgid;
      const label = tgm.getById(tgId)?.primaryLabel || tgId;
      if (!confirm(`Delete tag group "${label}"?\nIt will be removed from all resources.`)) return;
      try { await tgm.delete(tgId, rm.resources); await rm.save(); showToast('Deleted', 'warn'); renderTagGroupList(document.getElementById('tg-search').value); loadAll(); }
      catch (e) { showToast(e.message, 'error'); }
    });
  });
}

// ─── Migration Wizard ─────────────────────────────────────────────────────────
const MW = { step: 0, sourcePattern: '', targetTemplate: '', previewItems: [], sampleResults: [], successRate: 0 };

function openMigrationWizard() { MW.step = 1; renderMigrationStep(); openModal('modal-migration'); }

function renderMigrationStep() {
  updateStepsIndicator(MW.step, 4);
  const body   = document.getElementById('migration-body');
  const footer = document.getElementById('migration-footer');
  switch (MW.step) {
    case 1: renderMigrationStep1(body, footer); break;
    case 2: renderMigrationStep2(body, footer); break;
    case 3: renderMigrationStep3(body, footer); break;
    case 4: renderMigrationStep4(body, footer); break;
  }
}

function renderMigrationStep1(body, footer) {
  body.innerHTML = `<div class="migration-step">
    <label>Source URL Pattern — use <code>{ID}</code> as placeholder</label>
    <input id="mig-source" class="form-input" placeholder="https://old.example.com/browse/{ID}" value="${esc(MW.sourcePattern)}" />
    <label>Target URL Template — use <code>{ID}</code> as placeholder</label>
    <input id="mig-target" class="form-input" placeholder="https://new.example.com/browse/{ID}" value="${esc(MW.targetTemplate)}" />
    <div id="mig-pattern-count" class="muted small"></div>
  </div>`;
  footer.innerHTML = `
    <button id="mig-btn-preview" class="btn btn-secondary">Preview Matches</button>
    <button id="mig-btn-next"    class="btn btn-primary" disabled>Next →</button>
    <button class="btn btn-secondary modal-close" data-modal="modal-migration">Cancel</button>`;
  document.getElementById('mig-btn-preview').addEventListener('click', () => {
    MW.sourcePattern  = document.getElementById('mig-source').value.trim();
    MW.targetTemplate = document.getElementById('mig-target').value.trim();
    if (!MW.sourcePattern || !MW.targetTemplate) { showToast('Fill in both fields', 'error'); return; }
    MW.previewItems = migm.preview(MW.sourcePattern, MW.targetTemplate);
    document.getElementById('mig-pattern-count').textContent = `${MW.previewItems.length} resource(s) affected.`;
    document.getElementById('mig-btn-next').disabled = !MW.previewItems.length;
  });
  document.getElementById('mig-btn-next').addEventListener('click', () => { MW.step = 2; renderMigrationStep(); });
}

function renderMigrationStep2(body, footer) {
  const rows = MW.previewItems.slice(0, 20).map(p =>
    `<tr><td>${esc(p.resource.id)}</td>
     <td class="muted small" style="word-break:break-all">${esc(p.matchedUrl)}</td>
     <td style="word-break:break-all;color:var(--success)">${esc(p.generatedUrl)}</td>
     <td>${p.alreadyPresent ? '<span style="color:var(--warn)">Exists</span>' : '<span style="color:var(--success)">New</span>'}</td></tr>`
  ).join('');
  body.innerHTML = `<div class="migration-step">
    <p class="muted small"><strong>${MW.previewItems.length}</strong> resource(s) matched (first 20 shown):</p>
    <div style="overflow-x:auto"><table style="width:100%;font-size:11px;border-collapse:collapse">
      <thead><tr><th style="text-align:left;padding:4px 6px;color:var(--text-mute)">ID</th>
      <th style="text-align:left;padding:4px 6px;color:var(--text-mute)">Old URL</th>
      <th style="text-align:left;padding:4px 6px;color:var(--text-mute)">New URL</th>
      <th style="text-align:left;padding:4px 6px;color:var(--text-mute)">Status</th></tr></thead>
      <tbody>${rows}</tbody></table>
    ${MW.previewItems.length > 20 ? `<p class="muted small">…and ${MW.previewItems.length - 20} more.</p>` : ''}</div>
  </div>`;
  footer.innerHTML = `
    <button id="mig-btn-validate"  class="btn btn-secondary">Validate Sample</button>
    <button id="mig-btn-skip-val"  class="btn btn-primary">Skip Validation →</button>
    <button id="mig-btn-back2"     class="btn btn-secondary">← Back</button>`;
  document.getElementById('mig-btn-back2').addEventListener('click', () => { MW.step = 1; renderMigrationStep(); });
  document.getElementById('mig-btn-skip-val').addEventListener('click', () => { MW.successRate = null; MW.step = 4; renderMigrationStep(); });
  document.getElementById('mig-btn-validate').addEventListener('click', () => { MW.step = 3; renderMigrationStep(); });
}

function renderMigrationStep3(body, footer) {
  const newUrls = MW.previewItems.filter(p => !p.alreadyPresent).map(p => p.generatedUrl);
  body.innerHTML = `<div class="migration-step">
    <p class="muted small">Testing ${Math.min(10, newUrls.length)} of ${newUrls.length} URLs…</p>
    <div class="progress-wrap"><div class="progress-bar"><div id="mig-prog-fill" class="progress-fill"></div></div>
    <span id="mig-prog-text" class="muted small">0 / ${Math.min(10, newUrls.length)}</span></div>
    <div id="mig-val-results" class="muted small mt-8"></div>
  </div>`;
  footer.innerHTML = `<button id="mig-btn-back3" class="btn btn-secondary">← Back</button>`;
  document.getElementById('mig-btn-back3').addEventListener('click', () => { MW.step = 2; renderMigrationStep(); });
  (async () => {
    MW.sampleResults = await migm.validateSample(newUrls, 10, (done, total) => {
      document.getElementById('mig-prog-fill').style.width = `${Math.round(done/total*100)}%`;
      document.getElementById('mig-prog-text').textContent = `${done} / ${total}`;
    });
    const ok = MW.sampleResults.filter(r => r.ok).length;
    MW.successRate = MW.sampleResults.length > 0 ? Math.round(ok / MW.sampleResults.length * 100) : 100;
    document.getElementById('mig-val-results').innerHTML =
      `Success rate: <strong style="color:${MW.successRate>=80?'var(--success)':'var(--danger)'}">${MW.successRate}%</strong> (${ok}/${MW.sampleResults.length})`;
    document.getElementById('migration-footer').innerHTML +=
      `<button id="mig-btn-to4" class="btn btn-primary">Review Results →</button>`;
    document.getElementById('mig-btn-to4').addEventListener('click', () => { MW.step = 4; renderMigrationStep(); });
  })();
}

function renderMigrationStep4(body, footer) {
  const newCount = MW.previewItems.filter(p => !p.alreadyPresent).length;
  const rate     = MW.successRate;
  body.innerHTML = `<div class="migration-step">
    <p><strong>${newCount}</strong> new URLs will be added (non-destructive).</p>
    <p class="muted small mt-8">${rate !== null ? `Validation: <strong style="color:${rate>=80?'var(--success)':'var(--danger)'}">${rate}%</strong> success rate.` : 'Validation skipped.'}</p>
    ${rate !== null && rate < 80 ? '<div class="info-box info-box--warn mt-8">⚠️ Low success rate — consider aborting.</div>' : ''}
  </div>`;
  footer.innerHTML = `
    <button id="mig-btn-apply" class="btn btn-primary" ${rate !== null && rate < 50 ? 'disabled' : ''}>Apply Migration</button>
    <button id="mig-btn-abort" class="btn btn-secondary">Abort</button>`;
  document.getElementById('mig-btn-abort').addEventListener('click', () => { closeModal('modal-migration'); showToast('Aborted', 'warn'); });
  document.getElementById('mig-btn-apply').addEventListener('click', async () => {
    document.getElementById('mig-btn-apply').disabled = true;
    document.getElementById('mig-btn-apply').textContent = 'Applying…';
    try {
      const r = await migm.execute(MW.sourcePattern, MW.targetTemplate);
      closeModal('modal-migration'); showToast(`Done: ${r.applied} URLs added.`, 'success'); loadAll();
    } catch (e) { showToast(e.message, 'error'); }
  });
}

function updateStepsIndicator(current, total) {
  document.getElementById('migration-steps-indicator').innerHTML =
    Array.from({ length: total }, (_, i) => {
      const n = i + 1;
      return `<div class="step-dot ${n < current ? 'done' : n === current ? 'active' : ''}"></div>`;
    }).join('');
}

// ─── Backup Modal ─────────────────────────────────────────────────────────────
function bindBackupModal() {
  document.getElementById('btn-export-json').addEventListener('click', () => {
    new BackupManager(rm).downloadBackup(); showToast('Backup downloaded ✓', 'success');
  });
  document.getElementById('btn-import-backup').addEventListener('click', async () => {
    const file = document.getElementById('backup-file-input').files[0];
    const mode = document.querySelector('input[name="backup-mode"]:checked')?.value || 'merge';
    if (!file) { showToast('Select a file first', 'error'); return; }
    try {
      const result = await new BackupManager(rm).importFromFile(file, { mode });
      document.getElementById('backup-import-result').textContent =
        `Imported ${result.imported}, merged ${result.merged}.${result.errors.length ? ' Errors: '+result.errors.length : ''}`;
      document.getElementById('backup-import-result').classList.remove('hidden');
      showToast('Import complete', result.errors.length ? 'warn' : 'success');
      loadAll();
    } catch (e) { showToast(e.message, 'error'); }
  });
}

// ─── Add Resource Modal ───────────────────────────────────────────────────────
async function handleAddResource() {
  const idVal  = document.getElementById('add-id').value.trim();
  const urlVal = document.getElementById('add-url').value.trim();
  const tagIds = parseTags(document.getElementById('add-tags').value)
    .map(label => tgm.getOrCreate(label).id);
  const rating = getStarValue('add-rating');
  if (!idVal) { showToast('ID or Name is required', 'error'); return; }
  try {
    if (urlVal) {
      if (!isValidUrl(urlVal)) { showToast('Invalid URL', 'error'); return; }
      await rm.addUrl(urlVal, { name: idVal, tags: tagIds, rating });
    } else {
      await rm._createResource(normalizeId(idVal), null, { tags: tagIds, rating });
    }
    await tgm.save();
    closeModal('modal-add'); showToast('Resource added ✓', 'success'); loadAll();
  } catch (e) { showToast(e.message, 'error'); }
}

// ─── Star helpers ─────────────────────────────────────────────────────────────
function renderStarInput(containerId, value) {
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
function getStarValue(id) { return parseInt(document.getElementById(id)?.dataset.value, 10) || null; }

// ─── Modal helpers ────────────────────────────────────────────────────────────
function openModal(id)  { document.getElementById(id)?.classList.remove('hidden'); }
function closeModal(id) { document.getElementById(id)?.classList.add('hidden'); if (id === 'modal-resource') location.hash = ''; }

// ─── Incognito opener ─────────────────────────────────────────────────────────

/**
 * Open `url` in incognito.
 * Reuses an existing incognito window (new tab) when one is open;
 * otherwise creates a new incognito window.
 * Never opens a regular tab.
 * @param {string} url
 */
async function _openUrlInIncognito(url) {
  const all          = await chrome.windows.getAll({ windowTypes: ['normal'] });
  const incognitoWin = all.find(w => w.incognito);
  if (incognitoWin) {
    await chrome.tabs.create({ windowId: incognitoWin.id, url });
  } else {
    await chrome.windows.create({ url, incognito: true });
  }
}

async function openInIncognito(resourceId) {
  const res = rm.getResourceById(resourceId);
  if (!res || !res.urls.length) { showToast('No URLs available for this resource', 'error'); return; }
  const url = selectUrlByPriority(res.urls, rm.settings.priorityDomains || []);
  if (!url) { showToast('No URL to open', 'error'); return; }
  try {
    await _openUrlInIncognito(url);
  } catch (e) {
    showToast(`Cannot open incognito: ${e.message}`, 'error');
  }
}

// ─── Random unrated resource ──────────────────────────────────────────────────
async function openRandomUnrated() {
  const unrated = rm.getAllResources().filter(r => r.rating === null && r.urls.length > 0);
  if (!unrated.length) { showToast('No unrated resources with URLs', 'warn'); return; }

  // Pick up to 3 random candidates
  const shuffled   = [...unrated].sort(() => Math.random() - 0.5);
  const candidates = shuffled.slice(0, 3);
  // Among the candidates, pick the one with the oldest createdAt
  candidates.sort((a, b) => a.createdAt - b.createdAt);
  const selected = candidates[0];

  const url = selectUrlByPriority(selected.urls, rm.settings.priorityDomains || []);
  try {
    await _openUrlInIncognito(url);
    showToast(`Opening: ${selected.id}`, 'success');
  } catch (e) {
    showToast(`Cannot open incognito: ${e.message}`, 'error');
  }
}

// ─── Settings Modal (Priority Domains) ───────────────────────────────────────

// Local copy of the domains list while the modal is open
let _editingDomains = [];

function openSettingsModal() {
  _editingDomains = [...(rm.settings.priorityDomains || [])];
  _renderPriorityDomains();
  document.getElementById('priority-domain-input').value = '';
  openModal('modal-settings');
}

function _renderPriorityDomains() {
  const list = document.getElementById('priority-domains-list');
  if (!_editingDomains.length) {
    list.innerHTML = '<p class="muted small">No domains defined. Add one below.</p>';
    return;
  }
  list.innerHTML = _editingDomains.map((domain, i) => `
    <div class="priority-item" data-index="${i}">
      <span class="priority-num">${i + 1}.</span>
      <span class="priority-domain">${esc(domain)}</span>
      <button class="pd-up"   data-i="${i}" title="Move up"   ${i === 0 ? 'disabled' : ''}>↑</button>
      <button class="pd-down" data-i="${i}" title="Move down" ${i === _editingDomains.length - 1 ? 'disabled' : ''}>↓</button>
      <button class="pd-del"  data-i="${i}" title="Remove">✕</button>
    </div>`).join('');

  list.querySelectorAll('.pd-up').forEach(btn =>
    btn.addEventListener('click', () => {
      const i = +btn.dataset.i;
      [_editingDomains[i - 1], _editingDomains[i]] = [_editingDomains[i], _editingDomains[i - 1]];
      _renderPriorityDomains();
    }));
  list.querySelectorAll('.pd-down').forEach(btn =>
    btn.addEventListener('click', () => {
      const i = +btn.dataset.i;
      [_editingDomains[i], _editingDomains[i + 1]] = [_editingDomains[i + 1], _editingDomains[i]];
      _renderPriorityDomains();
    }));
  list.querySelectorAll('.pd-del').forEach(btn =>
    btn.addEventListener('click', () => {
      _editingDomains.splice(+btn.dataset.i, 1);
      _renderPriorityDomains();
    }));
}

async function saveSettings() {
  rm.settings.priorityDomains = [..._editingDomains];
  await rm.saveSettings();
  closeModal('modal-settings');
  showToast('Settings saved ✓', 'success');
}

// ─── Bulk URL Removal ─────────────────────────────────────────────────────────

function _parseDomainInput() {
  const raw = document.getElementById('bulk-remove-domains').value;
  return raw.split(/[\n,]/).map(d => d.trim().toLowerCase()).filter(Boolean);
}

async function previewBulkRemoval() {
  const domains = _parseDomainInput();
  const preview = document.getElementById('bulk-remove-preview');
  if (!domains.length) { showToast('Enter at least one domain', 'error'); return; }

  let urlCount = 0, resCount = 0;
  for (const res of rm.getAllResources()) {
    const matches = res.urls.filter(url => {
      try { return domains.includes(new URL(url).hostname.toLowerCase()); } catch { return false; }
    });
    if (matches.length) { urlCount += matches.length; resCount++; }
  }

  preview.classList.remove('hidden');
  preview.innerHTML = `<div class="bulk-preview-box">
    Found <strong>${urlCount}</strong> URL(s) across <strong>${resCount}</strong> resource(s) to remove.
    ${urlCount === 0 ? '<br><span class="muted">Nothing to remove.</span>' : ''}
  </div>`;
  document.getElementById('btn-bulk-remove-confirm').disabled = urlCount === 0;
}

async function executeBulkRemoval() {
  const domains = _parseDomainInput();
  if (!domains.length) return;
  const domainSet = new Set(domains);

  let removed = 0, affected = 0;
  for (const res of Object.values(rm.resources)) {
    const before = res.urls.length;
    const keep   = res.urls.filter(url => {
      try { return !domainSet.has(new URL(url).hostname.toLowerCase()); } catch { return true; }
    });
    if (keep.length < before) {
      // Clean up URL index for removed URLs
      for (const url of res.urls) {
        if (!keep.includes(url)) delete rm.urlIndex[url];
      }
      res.urls      = keep;
      res.updatedAt = Date.now();
      removed += before - keep.length;
      affected++;
    }
  }
  if (removed > 0) await rm.save();

  closeModal('modal-bulk-remove');
  showToast(`Removed ${removed} URL(s) from ${affected} resource(s)`, removed ? 'success' : 'warn');
  loadAll();
}

// ─── Static event bindings ────────────────────────────────────────────────────
function bindStaticEvents() {
  // Search
  let searchDebounce;
  document.getElementById('search-input').addEventListener('input', e => {
    clearTimeout(searchDebounce);
    searchDebounce = setTimeout(() => { state.query = e.target.value; applyAndRender(); }, 250);
  });

  // Sort
  document.getElementById('sort-select').addEventListener('change', e => { state.sort = e.target.value; applyAndRender(); });

  // Rating filter
  document.getElementById('filter-rating').addEventListener('click', e => {
    const btn = e.target.closest('.rating-btn'); if (!btn) return;
    document.querySelectorAll('.rating-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.filters.minRating = parseInt(btn.dataset.val, 10);
    applyAndRender();
  });

  // Pattern only
  document.getElementById('filter-pattern-only').addEventListener('change', e => {
    state.filters.patternOnly = e.target.checked; applyAndRender();
  });

  // Tag filter inputs (resolve label → Tag Group ID)
  document.getElementById('filter-tag-input').addEventListener('keydown', e => {
    if (e.key !== 'Enter') return;
    const val = e.target.value.trim(); if (!val) return;
    const tg  = tgm.findByAlias(val);
    if (!tg) { showToast(`No tag group found for "${val}"`, 'warn'); return; }
    if (!state.filters.tags.includes(tg.id)) {
      state.filters.tags.push(tg.id); e.target.value = '';
      renderFilterChips(); applyAndRender();
    }
  });
  document.getElementById('filter-exclude-input').addEventListener('keydown', e => {
    if (e.key !== 'Enter') return;
    const val = e.target.value.trim(); if (!val) return;
    const tg  = tgm.findByAlias(val);
    if (!tg) { showToast(`No tag group found for "${val}"`, 'warn'); return; }
    if (!state.filters.excludeTags.includes(tg.id)) {
      state.filters.excludeTags.push(tg.id); e.target.value = '';
      renderFilterChips(); applyAndRender();
    }
  });

  // Clear filters
  document.getElementById('btn-clear-filters').addEventListener('click', () => {
    state.filters = { tags: [], excludeTags: [], minRating: 0, patternOnly: false };
    document.getElementById('filter-pattern-only').checked = false;
    document.querySelectorAll('.rating-btn').forEach((b, i) => b.classList.toggle('active', i === 0));
    renderFilterChips(); applyAndRender();
  });

  // Global star clicks
  document.addEventListener('click', e => {
    const star = e.target.closest('.star-input .star'); if (!star) return;
    const cont = star.closest('.star-input');
    const val  = parseInt(star.dataset.val, 10);
    const prev = parseInt(cont.dataset.value, 10) || 0;
    cont.dataset.value = val === prev ? 0 : val;
    renderStarInput(cont.id, cont.dataset.value);
  });

  // Modal close (delegated)
  document.addEventListener('click', e => {
    const cb  = e.target.closest('.modal-close[data-modal]');
    if (cb) closeModal(cb.dataset.modal);
    const ov  = e.target.closest('.modal-overlay');
    if (ov && e.target === ov) closeModal(ov.id);
  });

  // Toolbar buttons
  document.getElementById('btn-add-resource').addEventListener('click', () => {
    ['add-id','add-url','add-tags'].forEach(id => document.getElementById(id).value = '');
    renderStarInput('add-rating', 0); openModal('modal-add');
  });
  document.getElementById('btn-import').addEventListener('click', () => {
    document.getElementById('import-step-2').classList.add('hidden');
    document.getElementById('btn-import-confirm').classList.add('hidden');
    document.getElementById('import-preview-info').classList.add('hidden');
    openModal('modal-import');
  });
  document.getElementById('btn-tags').addEventListener('click', openTagsModal);
  document.getElementById('btn-migration').addEventListener('click', openMigrationWizard);
  document.getElementById('btn-backup').addEventListener('click', () => openModal('modal-backup'));
  document.getElementById('btn-random-unrated').addEventListener('click', openRandomUnrated);
  document.getElementById('btn-settings').addEventListener('click', openSettingsModal);
  document.getElementById('btn-bulk-remove').addEventListener('click', () => {
    document.getElementById('bulk-remove-domains').value = '';
    document.getElementById('bulk-remove-preview').classList.add('hidden');
    document.getElementById('btn-bulk-remove-confirm').disabled = true;
    openModal('modal-bulk-remove');
  });

  // Settings modal
  document.getElementById('btn-add-priority-domain').addEventListener('click', () => {
    const input  = document.getElementById('priority-domain-input');
    const domain = input.value.trim().toLowerCase();
    if (!domain) return;
    if (!_editingDomains.includes(domain)) { _editingDomains.push(domain); _renderPriorityDomains(); }
    input.value = '';
  });
  document.getElementById('priority-domain-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('btn-add-priority-domain').click();
  });
  document.getElementById('btn-save-settings').addEventListener('click', saveSettings);

  // Bulk-remove modal
  document.getElementById('btn-bulk-remove-preview').addEventListener('click', previewBulkRemoval);
  document.getElementById('btn-bulk-remove-confirm').addEventListener('click', executeBulkRemoval);

  // Tags modal search
  document.getElementById('tg-search').addEventListener('input', e => renderTagGroupList(e.target.value));
  document.getElementById('tg-btn-new').addEventListener('click', async () => {
    const label = prompt('Primary label for new Tag Group:')?.trim();
    if (!label) return;
    tgm.getOrCreate(label); await tgm.save();
    renderTagGroupList(document.getElementById('tg-search').value); loadAll();
  });

  // Resource modal actions
  document.getElementById('res-btn-save').addEventListener('click', saveResource);
  document.getElementById('res-btn-delete').addEventListener('click', () => {
    if (state.editingResource) confirmDeleteResource(state.editingResource.id);
  });
  document.getElementById('res-btn-merge').addEventListener('click', () => {
    if (state.editingResource) openMergeModal(state.editingResource.id);
  });

  // URL / title / tag add in resource modal
  document.getElementById('res-btn-add-url').addEventListener('click', () => {
    const input = document.getElementById('res-url-new');
    const url   = input.value.trim();
    if (!url) return;
    if (!isValidUrl(url)) { showToast('Invalid URL', 'error'); return; }
    const nUrl = normalizeUrl(url), res = state.editingResource;
    if (!res.urls.includes(nUrl)) { res.urls.push(nUrl); renderModalUrls(res.urls); }
    input.value = '';
  });
  document.getElementById('res-url-new').addEventListener('keydown', e => { if (e.key === 'Enter') document.getElementById('res-btn-add-url').click(); });

  document.getElementById('res-btn-add-title').addEventListener('click', () => {
    const input = document.getElementById('res-title-new');
    const title = input.value.trim(); if (!title) return;
    const res = state.editingResource;
    if (!res.titles.includes(title)) { res.titles.push(title); renderModalTitles(res.titles); }
    input.value = '';
  });
  document.getElementById('res-title-new').addEventListener('keydown', e => { if (e.key === 'Enter') document.getElementById('res-btn-add-title').click(); });

  document.getElementById('res-btn-add-tag').addEventListener('click', async () => {
    const input    = document.getElementById('res-tag-new');
    const tagLabel = input.value.trim(); if (!tagLabel) return;
    const tg = tgm.getOrCreate(tagLabel);
    await tgm.save();
    const res = state.editingResource;
    if (!res.tags.includes(tg.id)) { res.tags.push(tg.id); renderModalTags(res.tags); }
    input.value = '';
  });
  document.getElementById('res-tag-new').addEventListener('keydown', e => { if (e.key === 'Enter') document.getElementById('res-btn-add-tag').click(); });

  // Merge modal
  document.getElementById('merge-btn-preview').addEventListener('click', previewMerge);
  document.getElementById('merge-btn-confirm').addEventListener('click', executeMerge);

  // Import modal
  document.getElementById('btn-import-preview').addEventListener('click', runBookmarkPreview);
  document.getElementById('btn-import-confirm').addEventListener('click', runImport);

  // Add resource modal
  document.getElementById('add-btn-confirm').addEventListener('click', handleAddResource);

  // Backup modal
  bindBackupModal();
}

// ─── Utilities ────────────────────────────────────────────────────────────────
function esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function parseTags(raw) { return raw.split(',').map(t => t.trim()).filter(Boolean); }

let toastTimer;
function showToast(msg, type = '') {
  const el = document.getElementById('toast');
  el.textContent = msg; el.className = `toast${type ? ' '+type : ''}`;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.add('hidden'), 3000);
}