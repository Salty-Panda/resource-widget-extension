import { ResourceManager }  from '../src/resource-manager.js';
import { ImportManager }    from '../src/import-manager.js';
import { MigrationManager } from '../src/migration-manager.js';
import { BackupManager }    from '../src/backup-manager.js';
import { normalizeId } from '../src/id-extractor.js';
import { isValidUrl, normalizeUrl } from '../src/url-utils.js';

// ─── Managers ────────────────────────────────────────────────────────────────
const rm   = new ResourceManager();
const im   = new ImportManager(rm);
let   migm = null; // init after rm

// ─── State ───────────────────────────────────────────────────────────────────
const state = {
  all:       [],         // all resources from storage
  filtered:  [],         // after search + filters
  page:      1,
  pageSize:  50,
  query:     '',
  sort:      'updatedAt',
  filters: {
    tags:        [],
    excludeTags: [],
    minRating:   0,
    patternOnly: false,
  },
  editingResource: null, // resource currently open in modal
  mergeSourceId:   null,
  allTags:         [],
};

// ─── Init ────────────────────────────────────────────────────────────────────
(async () => {
  await rm.initialize();
  migm = new MigrationManager(rm);
  loadAll();
  bindStaticEvents();
  checkUrlHash();
})();

function loadAll() {
  state.all     = rm.getAllResources();
  state.allTags = rm.getAllTags();
  applyAndRender();
  updateTagDatalist();
  renderSidebarTagOptions();
}

function applyAndRender() {
  state.filtered = rm.searchResources(state.query, state.filters, state.sort);
  state.page = 1;
  renderTable();
  renderPagination();
  renderStats();
  renderResultsCount();
}

// ─── URL hash: auto-open resource ────────────────────────────────────────────
function checkUrlHash() {
  const hash = decodeURIComponent(location.hash.replace('#', ''));
  if (!hash) return;
  const res = rm.getResourceById(hash);
  if (res) openResourceModal(res);
}

// ─── Table rendering ──────────────────────────────────────────────────────────
function renderTable() {
  const tbody = document.getElementById('resource-tbody');
  const empty = document.getElementById('empty-state');
  const start = (state.page - 1) * state.pageSize;
  const items = state.filtered.slice(start, start + state.pageSize);

  if (items.length === 0) {
    tbody.innerHTML = '';
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');

  tbody.innerHTML = items.map(renderRow).join('');

  // Bind row clicks
  tbody.querySelectorAll('tr[data-id]').forEach(row => {
    row.addEventListener('click', e => {
      if (e.target.closest('button')) return;
      const res = rm.getResourceById(row.dataset.id);
      if (res) openResourceModal(res);
    });
  });

  // Delete buttons
  tbody.querySelectorAll('.btn-row-delete').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      confirmDeleteResource(btn.dataset.id);
    });
  });
}

function renderRow(r) {
  const title   = r.titles[0] || '—';
  const tagHtml = r.tags.slice(0, 3).map(t =>
    `<span class="tag-chip-sm">${escHtml(t)}</span>`).join('') +
    (r.tags.length > 3 ? `<span class="tag-more">+${r.tags.length - 3}</span>` : '');
  const rating  = r.rating ? '★'.repeat(r.rating) : '—';
  const patBadge = r.isPatternId ? '<span class="tag-pattern-sm">ID</span>' : '';

  return `<tr data-id="${escAttr(r.id)}" title="Click to edit">
    <td><div class="id-cell">
      <span class="id-text">${escHtml(r.id)}</span>${patBadge}
    </div></td>
    <td class="title-cell" title="${escAttr(title)}">${escHtml(title)}</td>
    <td><div class="tags-cell">${tagHtml}</div></td>
    <td class="rating-cell" style="text-align:center">${escHtml(rating)}</td>
    <td class="urls-count">${r.urls.length}</td>
    <td><div class="row-actions">
      <button class="btn btn-danger btn-sm btn-row-delete" data-id="${escAttr(r.id)}" title="Delete">✕</button>
    </div></td>
  </tr>`;
}

// ─── Pagination ───────────────────────────────────────────────────────────────
function renderPagination() {
  const total = Math.ceil(state.filtered.length / state.pageSize);
  const el    = document.getElementById('pagination');
  if (total <= 1) { el.innerHTML = ''; return; }

  let html = `<button class="page-btn" data-page="${state.page - 1}" ${state.page === 1 ? 'disabled' : ''}>‹ Prev</button>`;

  const start = Math.max(1, state.page - 2);
  const end   = Math.min(total, state.page + 2);
  if (start > 1)     html += `<button class="page-btn" data-page="1">1</button>${start > 2 ? '<span class="page-info">…</span>' : ''}`;
  for (let i = start; i <= end; i++)
    html += `<button class="page-btn${i === state.page ? ' active' : ''}" data-page="${i}">${i}</button>`;
  if (end < total)   html += `${end < total - 1 ? '<span class="page-info">…</span>' : ''}<button class="page-btn" data-page="${total}">${total}</button>`;

  html += `<button class="page-btn" data-page="${state.page + 1}" ${state.page === total ? 'disabled' : ''}>Next ›</button>`;
  el.innerHTML = html;

  el.querySelectorAll('.page-btn:not(:disabled)').forEach(btn => {
    btn.addEventListener('click', () => {
      state.page = parseInt(btn.dataset.page, 10);
      renderTable();
      renderPagination();
    });
  });
}

// ─── Stats & count ────────────────────────────────────────────────────────────
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

// ─── Sidebar filter rendering ─────────────────────────────────────────────────
function renderSidebarTagOptions() {
  // (tag suggestions populated via datalist elsewhere)
}

function renderFilterChips() {
  renderChipList('filter-tags-list',         state.filters.tags,        false);
  renderChipList('filter-exclude-tags-list', state.filters.excludeTags, true);
}

function renderChipList(containerId, tags, isExclude) {
  const el = document.getElementById(containerId);
  el.innerHTML = tags.map(tag =>
    `<span class="filter-chip${isExclude ? ' filter-chip-ex' : ''}" data-tag="${escAttr(tag)}">
      ${escHtml(tag)}<span class="filter-chip-x">✕</span>
    </span>`
  ).join('');
  el.querySelectorAll('.filter-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const t = chip.dataset.tag;
      if (isExclude) state.filters.excludeTags = state.filters.excludeTags.filter(x => x !== t);
      else           state.filters.tags        = state.filters.tags.filter(x => x !== t);
      renderFilterChips();
      applyAndRender();
    });
  });
}

function updateTagDatalist() {
  const dl   = document.getElementById('tag-datalist');
  dl.innerHTML = state.allTags.map(t => `<option value="${escAttr(t)}"></option>`).join('');

  const mdl = document.getElementById('merge-target-datalist');
  if (mdl) {
    mdl.innerHTML = state.all.map(r => `<option value="${escAttr(r.id)}"></option>`).join('');
  }
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
  list.innerHTML = urls.map((url, i) =>
    `<li class="url-item" data-index="${i}">
      <a href="${escAttr(url)}" target="_blank" title="${escAttr(url)}">${escHtml(url)}</a>
      <button data-url="${escAttr(url)}" class="url-remove" title="Remove URL">✕</button>
    </li>`
  ).join('');
  list.querySelectorAll('.url-remove').forEach(btn => {
    btn.addEventListener('click', () => {
      const res = state.editingResource;
      res.urls  = res.urls.filter(u => u !== btn.dataset.url);
      renderModalUrls(res.urls);
    });
  });
}

function renderModalTitles(titles) {
  const list = document.getElementById('res-titles-list');
  list.innerHTML = titles.map((t, i) =>
    `<li class="title-item" data-index="${i}">
      <span>${escHtml(t)}</span>
      <button data-title="${escAttr(t)}" class="title-remove" title="Remove">✕</button>
    </li>`
  ).join('');
  list.querySelectorAll('.title-remove').forEach(btn => {
    btn.addEventListener('click', () => {
      const res   = state.editingResource;
      res.titles  = res.titles.filter(t => t !== btn.dataset.title);
      renderModalTitles(res.titles);
    });
  });
}

function renderModalTags(tags) {
  const el = document.getElementById('res-tags-editor');
  el.innerHTML = tags.map(tag =>
    `<span class="tag-edit-chip">
      ${escHtml(tag)}
      <button data-tag="${escAttr(tag)}" class="tag-remove" title="Remove tag">✕</button>
    </span>`
  ).join('');
  el.querySelectorAll('.tag-remove').forEach(btn => {
    btn.addEventListener('click', () => {
      const res = state.editingResource;
      res.tags  = res.tags.filter(t => t !== btn.dataset.tag);
      renderModalTags(res.tags);
    });
  });
}

// ─── Modal save / delete ──────────────────────────────────────────────────────
async function saveResource() {
  const res = state.editingResource;
  if (!res) return;

  const newId = document.getElementById('res-id-input').value.trim();
  if (!newId) { showToast('ID cannot be empty', 'error'); return; }

  try {
    const updates = {
      id:     newId,
      urls:   res.urls,
      titles: res.titles,
      tags:   res.tags,
      rating: getStarValue('res-rating-input'),
    };
    const updated = await rm.updateResource(res.id, updates);
    state.editingResource = updated;
    closeModal('modal-resource');
    showToast('Saved ✓', 'success');
    loadAll();
  } catch (e) {
    showToast(e.message, 'error');
  }
}

async function confirmDeleteResource(id) {
  if (!confirm(`Delete resource "${id}"?\nThis cannot be undone.`)) return;
  await rm.deleteResource(id);
  closeModal('modal-resource');
  showToast('Deleted', 'warn');
  loadAll();
}

// ─── Merge Modal ─────────────────────────────────────────────────────────────
function openMergeModal(sourceId) {
  state.mergeSourceId = sourceId;
  document.getElementById('merge-source-label').textContent = sourceId;
  document.getElementById('merge-target-input').value = '';
  document.getElementById('merge-final-id').value = '';
  document.getElementById('merge-preview').classList.add('hidden');
  document.getElementById('merge-btn-confirm').disabled = true;

  // Populate datalist with all IDs except source
  const dl = document.getElementById('merge-target-datalist');
  dl.innerHTML = state.all
    .filter(r => r.id !== sourceId)
    .map(r => `<option value="${escAttr(r.id)}"></option>`).join('');

  closeModal('modal-resource');
  openModal('modal-merge');
}

function previewMerge() {
  const targetId = document.getElementById('merge-target-input').value.trim();
  if (!targetId) { showToast('Enter target ID', 'error'); return; }

  const src = rm.getResourceById(state.mergeSourceId);
  const tgt = rm.getResourceById(targetId);
  if (!src) { showToast('Source not found', 'error'); return; }
  if (!tgt) { showToast('Target not found', 'error'); return; }

  const preview = document.getElementById('merge-preview');
  preview.classList.remove('hidden');
  preview.innerHTML = `
    <strong style="font-size:12px;color:var(--text)">Merge preview</strong>
    <div class="mt-8">
      <span class="muted small">Combined URLs:</span> ${src.urls.length + tgt.urls.length} 
      <span class="muted">(${[...new Set([...src.urls, ...tgt.urls])].length} unique)</span>
    </div>
    <div><span class="muted small">Combined titles:</span> ${[...new Set([...src.titles,...tgt.titles])].length}</div>
    <div><span class="muted small">Combined tags:</span> ${[...new Set([...src.tags,...tgt.tags])].join(', ') || '—'}</div>
    <div><span class="muted small">Rating:</span> ${tgt.rating ?? src.rating ?? '—'}</div>
  `;
  document.getElementById('merge-btn-confirm').disabled = false;
}

async function executeMerge() {
  const targetId  = document.getElementById('merge-target-input').value.trim();
  const resolvedId = document.getElementById('merge-final-id').value.trim() || null;
  try {
    await rm.mergeResources(state.mergeSourceId, targetId, resolvedId);
    closeModal('modal-merge');
    showToast('Merged ✓', 'success');
    loadAll();
  } catch (e) {
    showToast(e.message, 'error');
  }
}

// ─── Import Modal ─────────────────────────────────────────────────────────────
async function runBookmarkPreview() {
  const info = document.getElementById('import-preview-info');
  info.classList.remove('hidden');
  info.textContent = 'Scanning bookmarks…';
  try {
    const items = await im.preview();
    const withId = items.filter(i => i.detectedId).length;
    info.innerHTML = `Found <strong>${items.length}</strong> bookmarks — 
      <strong>${withId}</strong> with auto-detected IDs. 
      Folder names will become tags.`;
    document.getElementById('import-step-2').classList.remove('hidden');
    document.getElementById('btn-import-confirm').classList.remove('hidden');
    const summary = document.getElementById('import-summary');
    summary.innerHTML = `<strong>${items.length}</strong> bookmarks ready to import.`;
  } catch (e) {
    info.innerHTML = `<span class="text-danger">Error: ${escHtml(e.message)}</span>`;
  }
}

async function runImport() {
  const progressWrap = document.getElementById('import-progress');
  const progressFill = document.getElementById('import-progress-fill');
  const progressText = document.getElementById('import-progress-text');
  const confirmBtn   = document.getElementById('btn-import-confirm');

  progressWrap.classList.remove('hidden');
  confirmBtn.disabled = true;

  const result = await im.importAll({
    onProgress(done, total) {
      const pct = Math.round((done / total) * 100);
      progressFill.style.width = pct + '%';
      progressText.textContent = `${done} / ${total}`;
    }
  });

  progressText.textContent = `Done! Added: ${result.imported}, Merged: ${result.merged}, Skipped: ${result.skipped}`;
  showToast(`Import complete: ${result.imported} added, ${result.merged} merged`, 'success');
  loadAll();
}

// ─── Migration Wizard ─────────────────────────────────────────────────────────
const MW = {
  step: 0,
  sourcePattern:  '',
  targetTemplate: '',
  previewItems:   [],
  sampleResults:  [],
  successRate:    0,
};

function openMigrationWizard() {
  MW.step = 1;
  renderMigrationStep();
  openModal('modal-migration');
}

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
  body.innerHTML = `
    <div class="migration-step">
      <label>Source URL Pattern — use <code>{ID}</code> as placeholder</label>
      <input id="mig-source" class="form-input" placeholder="https://oldjira.example.com/browse/{ID}" value="${escAttr(MW.sourcePattern)}" />
      <label>Target URL Template — use <code>{ID}</code> as placeholder</label>
      <input id="mig-target" class="form-input" placeholder="https://newjira.example.com/browse/{ID}" value="${escAttr(MW.targetTemplate)}" />
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
    const count = document.getElementById('mig-pattern-count');
    count.textContent = `${MW.previewItems.length} resource(s) would be affected.`;
    document.getElementById('mig-btn-next').disabled = MW.previewItems.length === 0;
  });

  document.getElementById('mig-btn-next').addEventListener('click', () => {
    MW.step = 2; renderMigrationStep();
  });
}

function renderMigrationStep2(body, footer) {
  const rows = MW.previewItems.slice(0, 20).map(p =>
    `<tr>
      <td>${escHtml(p.resource.id)}</td>
      <td class="muted small" style="word-break:break-all">${escHtml(p.matchedUrl)}</td>
      <td style="word-break:break-all;color:var(--success)">${escHtml(p.generatedUrl)}</td>
      <td>${p.alreadyPresent ? '<span style="color:var(--warn)">Already exists</span>' : '<span style="color:var(--success)">New</span>'}</td>
    </tr>`
  ).join('');
  const more = MW.previewItems.length > 20 ? `<p class="muted small">…and ${MW.previewItems.length - 20} more.</p>` : '';

  body.innerHTML = `
    <div class="migration-step">
      <p class="muted small"><strong>${MW.previewItems.length}</strong> resource(s) matched. Preview (first 20):</p>
      <div style="overflow-x:auto">
        <table style="width:100%;font-size:11px;border-collapse:collapse">
          <thead><tr>
            <th style="text-align:left;padding:4px 6px;color:var(--text-mute)">ID</th>
            <th style="text-align:left;padding:4px 6px;color:var(--text-mute)">Old URL</th>
            <th style="text-align:left;padding:4px 6px;color:var(--text-mute)">New URL</th>
            <th style="text-align:left;padding:4px 6px;color:var(--text-mute)">Status</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
        ${more}
      </div>
    </div>`;
  footer.innerHTML = `
    <button id="mig-btn-validate" class="btn btn-secondary">Validate Sample (HEAD requests)</button>
    <button id="mig-btn-skip-val" class="btn btn-primary">Skip Validation →</button>
    <button id="mig-btn-back" class="btn btn-secondary">← Back</button>`;

  document.getElementById('mig-btn-back').addEventListener('click', () => { MW.step = 1; renderMigrationStep(); });
  document.getElementById('mig-btn-skip-val').addEventListener('click', () => {
    MW.successRate   = null; // unknown
    MW.sampleResults = [];
    MW.step = 4; renderMigrationStep();
  });
  document.getElementById('mig-btn-validate').addEventListener('click', () => { MW.step = 3; renderMigrationStep(); });
}

function renderMigrationStep3(body, footer) {
  const newUrls = MW.previewItems.filter(p => !p.alreadyPresent).map(p => p.generatedUrl);
  body.innerHTML = `
    <div class="migration-step">
      <p class="muted small">Testing ${Math.min(10, newUrls.length)} of ${newUrls.length} generated URL(s) with HEAD requests…</p>
      <div class="progress-wrap">
        <div class="progress-bar"><div id="mig-prog-fill" class="progress-fill"></div></div>
        <span id="mig-prog-text" class="muted small">0 / ${Math.min(10, newUrls.length)}</span>
      </div>
      <div id="mig-val-results" class="muted small mt-8"></div>
    </div>`;
  footer.innerHTML = `<button id="mig-btn-back3" class="btn btn-secondary">← Back</button>`;
  document.getElementById('mig-btn-back3').addEventListener('click', () => { MW.step = 2; renderMigrationStep(); });

  (async () => {
    MW.sampleResults = await migm.validateSample(newUrls, 10, (done, total) => {
      document.getElementById('mig-prog-fill').style.width = `${Math.round(done/total*100)}%`;
      document.getElementById('mig-prog-text').textContent = `${done} / ${total}`;
    });

    const ok    = MW.sampleResults.filter(r => r.ok).length;
    const total = MW.sampleResults.length;
    MW.successRate = total > 0 ? Math.round(ok / total * 100) : 100;

    document.getElementById('mig-val-results').innerHTML =
      `Success rate: <strong style="color:${MW.successRate>=80?'var(--success)':'var(--danger)'}">${MW.successRate}%</strong>
       (${ok}/${total} accessible)`;

    // Add Next button
    document.getElementById('migration-footer').innerHTML += `<button id="mig-btn-to4" class="btn btn-primary">Review Results →</button>`;
    document.getElementById('mig-btn-to4').addEventListener('click', () => { MW.step = 4; renderMigrationStep(); });
  })();
}

function renderMigrationStep4(body, footer) {
  const newCount   = MW.previewItems.filter(p => !p.alreadyPresent).length;
  const rate       = MW.successRate;
  const rateHtml   = rate !== null
    ? `Validation: <strong style="color:${rate>=80?'var(--success)':'var(--danger)'}">${rate}%</strong> success rate.`
    : 'Validation skipped.';
  const warn       = rate !== null && rate < 80
    ? `<div class="info-box info-box--warn mt-8">⚠️ Low success rate — consider aborting.</div>` : '';

  body.innerHTML = `
    <div class="migration-step">
      <p><strong>${newCount}</strong> new URLs will be added (non-destructive, old URLs preserved).</p>
      <p class="muted small mt-8">${rateHtml}</p>
      ${warn}
    </div>`;
  footer.innerHTML = `
    <button id="mig-btn-apply" class="btn btn-primary" ${rate !== null && rate < 50 ? 'disabled' : ''}>Apply Migration</button>
    <button id="mig-btn-abort" class="btn btn-secondary">Abort</button>`;

  document.getElementById('mig-btn-abort').addEventListener('click', () => {
    closeModal('modal-migration');
    showToast('Migration aborted', 'warn');
  });
  document.getElementById('mig-btn-apply').addEventListener('click', async () => {
    document.getElementById('mig-btn-apply').disabled = true;
    document.getElementById('mig-btn-apply').textContent = 'Applying…';
    try {
      const result = await migm.execute(MW.sourcePattern, MW.targetTemplate);
      closeModal('modal-migration');
      showToast(`Migration done: ${result.applied} URLs added, ${result.skipped} skipped.`, 'success');
      loadAll();
    } catch (e) {
      showToast(e.message, 'error');
    }
  });
}

function updateStepsIndicator(current, total) {
  const el = document.getElementById('migration-steps-indicator');
  el.innerHTML = Array.from({ length: total }, (_, i) => {
    const n = i + 1;
    const cls = n < current ? 'done' : n === current ? 'active' : '';
    return `<div class="step-dot ${cls}" title="Step ${n}"></div>`;
  }).join('');
}

// ─── Backup Modal ─────────────────────────────────────────────────────────────
function bindBackupModal() {
  document.getElementById('btn-export-json').addEventListener('click', () => {
    const bm = new BackupManager(rm);
    bm.downloadBackup();
    showToast('Backup downloaded ✓', 'success');
  });

  document.getElementById('btn-import-backup').addEventListener('click', async () => {
    const fileInput = document.getElementById('backup-file-input');
    const mode = document.querySelector('input[name="backup-mode"]:checked')?.value || 'merge';
    if (!fileInput.files[0]) { showToast('Select a file first', 'error'); return; }
    try {
      const bm = new BackupManager(rm);
      const result = await bm.importFromFile(fileInput.files[0], { mode });
      const msg = `Imported ${result.imported}, merged ${result.merged}.${result.errors.length ? ' Errors: '+result.errors.length : ''}`;
      document.getElementById('backup-import-result').textContent = msg;
      document.getElementById('backup-import-result').classList.remove('hidden');
      showToast(msg, result.errors.length ? 'warn' : 'success');
      loadAll();
    } catch (e) {
      showToast(e.message, 'error');
    }
  });
}

// ─── Add Resource Modal ────────────────────────────────────────────────────────
async function handleAddResource() {
  const idVal  = document.getElementById('add-id').value.trim();
  const urlVal = document.getElementById('add-url').value.trim();
  const tags   = parseTags(document.getElementById('add-tags').value);
  const rating = getStarValue('add-rating');

  if (!idVal) { showToast('ID or Name is required', 'error'); return; }

  try {
    if (urlVal) {
      if (!isValidUrl(urlVal)) { showToast('Invalid URL', 'error'); return; }
      await rm.addUrl(urlVal, { name: idVal, tags, rating });
    } else {
      // Create resource without URL
      await rm._createResource(normalizeId(idVal), null, { tags, rating });
    }
    closeModal('modal-add');
    showToast('Resource added ✓', 'success');
    loadAll();
  } catch (e) {
    showToast(e.message, 'error');
  }
}

// ─── Star rendering (modal) ───────────────────────────────────────────────────
function renderStarInput(containerId, value) {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = '';
  el.dataset.value = value;
  for (let i = 1; i <= 5; i++) {
    const s = document.createElement('span');
    s.className    = 'star' + (i <= value ? ' active' : '');
    s.textContent  = '★';
    s.dataset.val  = i;
    el.appendChild(s);
  }
}

function getStarValue(containerId) {
  const el = document.getElementById(containerId);
  return el ? (parseInt(el.dataset.value, 10) || null) : null;
}

// ─── Modal helpers ────────────────────────────────────────────────────────────
function openModal(id) {
  document.getElementById(id)?.classList.remove('hidden');
}
function closeModal(id) {
  document.getElementById(id)?.classList.add('hidden');
  if (id === 'modal-resource') location.hash = '';
}

// ─── Static event bindings ────────────────────────────────────────────────────
function bindStaticEvents() {
  // Search
  let searchDebounce;
  document.getElementById('search-input').addEventListener('input', e => {
    clearTimeout(searchDebounce);
    searchDebounce = setTimeout(() => {
      state.query = e.target.value;
      applyAndRender();
    }, 250);
  });

  // Sort
  document.getElementById('sort-select').addEventListener('change', e => {
    state.sort = e.target.value;
    applyAndRender();
  });

  // Rating filter
  document.getElementById('filter-rating').addEventListener('click', e => {
    const btn = e.target.closest('.rating-btn');
    if (!btn) return;
    document.querySelectorAll('.rating-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.filters.minRating = parseInt(btn.dataset.val, 10);
    applyAndRender();
  });

  // Pattern only
  document.getElementById('filter-pattern-only').addEventListener('change', e => {
    state.filters.patternOnly = e.target.checked;
    applyAndRender();
  });

  // Filter tag inputs
  document.getElementById('filter-tag-input').addEventListener('keydown', e => {
    if (e.key !== 'Enter') return;
    const val = e.target.value.trim();
    if (val && !state.filters.tags.includes(val)) {
      state.filters.tags.push(val);
      e.target.value = '';
      renderFilterChips();
      applyAndRender();
    }
  });

  document.getElementById('filter-exclude-input').addEventListener('keydown', e => {
    if (e.key !== 'Enter') return;
    const val = e.target.value.trim();
    if (val && !state.filters.excludeTags.includes(val)) {
      state.filters.excludeTags.push(val);
      e.target.value = '';
      renderFilterChips();
      applyAndRender();
    }
  });

  // Clear filters
  document.getElementById('btn-clear-filters').addEventListener('click', () => {
    state.filters = { tags: [], excludeTags: [], minRating: 0, patternOnly: false };
    document.getElementById('filter-pattern-only').checked = false;
    document.querySelectorAll('.rating-btn').forEach((b, i) => b.classList.toggle('active', i === 0));
    renderFilterChips();
    applyAndRender();
  });

  // Global star click handler (delegated)
  document.addEventListener('click', e => {
    const star = e.target.closest('.star-input .star');
    if (!star) return;
    const container = star.closest('.star-input');
    const val  = parseInt(star.dataset.val, 10);
    const prev = parseInt(container.dataset.value, 10) || 0;
    const next = val === prev ? 0 : val;
    container.dataset.value = next;
    renderStarInput(container.id, next);
  });

  // Modal close buttons (delegated)
  document.addEventListener('click', e => {
    const closeBtn = e.target.closest('.modal-close[data-modal]');
    if (closeBtn) closeModal(closeBtn.dataset.modal);

    const overlay = e.target.closest('.modal-overlay');
    if (overlay && e.target === overlay) closeModal(overlay.id);
  });

  // Toolbar buttons
  document.getElementById('btn-add-resource').addEventListener('click', () => {
    document.getElementById('add-id').value  = '';
    document.getElementById('add-url').value = '';
    document.getElementById('add-tags').value = '';
    renderStarInput('add-rating', 0);
    openModal('modal-add');
  });

  document.getElementById('btn-import').addEventListener('click', () => {
    document.getElementById('import-step-2').classList.add('hidden');
    document.getElementById('btn-import-confirm').classList.add('hidden');
    document.getElementById('import-preview-info').classList.add('hidden');
    openModal('modal-import');
  });

  document.getElementById('btn-migration').addEventListener('click', openMigrationWizard);
  document.getElementById('btn-backup').addEventListener('click', () => openModal('modal-backup'));

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
    const nUrl = normalizeUrl(url);
    const res  = state.editingResource;
    if (!res.urls.includes(nUrl)) { res.urls.push(nUrl); renderModalUrls(res.urls); }
    input.value = '';
  });

  document.getElementById('res-url-new').addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('res-btn-add-url').click();
  });

  document.getElementById('res-btn-add-title').addEventListener('click', () => {
    const input = document.getElementById('res-title-new');
    const title = input.value.trim();
    if (!title) return;
    const res = state.editingResource;
    if (!res.titles.includes(title)) { res.titles.push(title); renderModalTitles(res.titles); }
    input.value = '';
  });

  document.getElementById('res-title-new').addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('res-btn-add-title').click();
  });

  document.getElementById('res-btn-add-tag').addEventListener('click', () => {
    const input = document.getElementById('res-tag-new');
    const tag   = input.value.trim();
    if (!tag) return;
    const res = state.editingResource;
    if (!res.tags.includes(tag)) { res.tags.push(tag); renderModalTags(res.tags); }
    input.value = '';
  });

  document.getElementById('res-tag-new').addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('res-btn-add-tag').click();
  });

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

// ─── Utility ─────────────────────────────────────────────────────────────────
function escHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
function escAttr(str) { return escHtml(str); }
function parseTags(raw) { return raw.split(',').map(t => t.trim()).filter(Boolean); }

let toastTimer = null;
function showToast(msg, type = '') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className   = `toast${type ? ' ' + type : ''}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('hidden'), 3000);
}