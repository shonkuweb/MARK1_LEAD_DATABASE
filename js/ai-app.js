import { processImageWithGroq } from './ai-groq.js';
import { syncToFirestore, fetchAppSettings, checkLeadExists } from './ai-firebase.js';
import { exportToCsv } from './ai-export.js';

// ─── DOM ─────────────────────────────────────────────────────────────────────
const uploadArea       = document.getElementById('upload-area');
const imageUpload      = document.getElementById('image-upload');
const stagingSection   = document.getElementById('staging-section');
const resultsSection   = document.getElementById('results-section');
const stagingGrid      = document.getElementById('staging-grid');
const resultsGrid      = document.getElementById('results-grid');
const stagedCountEl    = document.getElementById('staged-count');
const analyzedCountEl  = document.getElementById('analyzed-count');
const totalAnalyzeEl   = document.getElementById('total-analyze-count');
const duplicatePill    = document.getElementById('duplicate-pill');
const duplicateCountEl = document.getElementById('duplicate-count');
const checkingPill     = document.getElementById('checking-pill');
const analyzeBtn       = document.getElementById('analyze-btn');
const syncAllBtn       = document.getElementById('sync-all-btn');
const exportCsvBtn     = document.getElementById('export-csv-btn');
const stagingTemplate  = document.getElementById('staging-card-template');
const resultTemplate   = document.getElementById('result-card-template');
const categoryModal    = document.getElementById('category-modal');
const modalSelect      = document.getElementById('modal-category-select');
const modalLeadCount   = document.getElementById('modal-lead-count');

// ─── State ────────────────────────────────────────────────────────────────────
let appSettings  = { categories: [], customFields: [] };
let stagedItems  = [];   // { id, filename, base64 }
let analyzedLeads = [];  // { id, data }
let dupCount     = 0;
let doneCount    = 0;
const RATE_LIMIT = 6000; // 10 req/min
const cardRefs   = new Map();

// ─── Init ─────────────────────────────────────────────────────────────────────
async function init() {
  try {
    appSettings = await fetchAppSettings();
    appSettings.categories?.forEach(cat => {
      const opt = document.createElement('option');
      opt.value = cat; opt.textContent = cat;
      modalSelect?.appendChild(opt);
    });
  } catch (e) { console.warn('Settings unavailable:', e); }

  uploadArea?.addEventListener('click', () => imageUpload?.click());
  uploadArea?.addEventListener('dragover', e => { e.preventDefault(); uploadArea.classList.add('dragover'); });
  uploadArea?.addEventListener('dragleave', () => uploadArea.classList.remove('dragleave'));
  uploadArea?.addEventListener('drop', e => {
    e.preventDefault(); uploadArea.classList.remove('dragover');
    if (e.dataTransfer.files?.length) handleFiles(e.dataTransfer.files);
  });
  imageUpload?.addEventListener('change', e => {
    if (e.target.files?.length) handleFiles(e.target.files);
    imageUpload.value = '';
  });
  exportCsvBtn?.addEventListener('click', () => exportToCsv(analyzedLeads.map(l => l.data)));

  window._nexusAnalyze    = startAnalysis;
  window._nexusSyncAll    = openModal;
  window._nexusCloseModal = closeModal;
  window._nexusConfirmSync= confirmSync;
}

// ─── File Handling ────────────────────────────────────────────────────────────
function handleFiles(fileList) {
  const files = Array.from(fileList).filter(f => f.type === 'image/jpeg' || f.type === 'image/png');
  if (!files.length) { alert('Please upload JPG or PNG images.'); return; }

  stagingSection.classList.remove('hidden');
  checkingPill.classList.remove('hidden');
  analyzeBtn.classList.add('hidden');

  let done = 0;
  files.forEach(file => {
    const id = `${Date.now()}_${Math.floor(Math.random() * 99999)}`;
    const reader = new FileReader();
    reader.onload = e => {
      const item = { id, filename: file.name, base64: e.target.result };
      stagedItems.push(item);
      addStagingCard(item);
      done++;
      if (done === files.length) {
        checkingPill.classList.add('hidden');
        analyzeBtn.classList.remove('hidden');
        updateStagedCount();
      }
    };
    reader.readAsDataURL(file);
  });
}

function addStagingCard(item) {
  const clone = stagingTemplate.content.cloneNode(true);
  const card  = clone.querySelector('.staging-card');
  card.dataset.id = item.id;
  card.querySelector('.staging-filename').textContent = item.filename;
  card.querySelector('.staging-delete-btn').addEventListener('click', () => deleteStagedItem(item.id));
  stagingGrid.appendChild(clone);
  updateStagedCount();
}

function deleteStagedItem(id) {
  stagedItems = stagedItems.filter(i => i.id !== id);
  stagingGrid.querySelector(`.staging-card[data-id="${id}"]`)?.remove();
  updateStagedCount();
  if (!stagedItems.length) {
    stagingSection.classList.add('hidden');
    analyzeBtn.classList.add('hidden');
  }
}

function updateStagedCount() {
  if (stagedCountEl) stagedCountEl.textContent = stagedItems.length;
}

// ─── Analysis ─────────────────────────────────────────────────────────────────
async function startAnalysis() {
  if (!stagedItems.length) return;
  const items = [...stagedItems];

  analyzeBtn.disabled = true;
  analyzeBtn.innerHTML = `<span class="spinner-sm"></span> Analyzing…`;
  resultsSection.classList.remove('hidden');
  if (totalAnalyzeEl) totalAnalyzeEl.textContent = items.length;
  doneCount = dupCount = 0;
  analyzedLeads = [];
  cardRefs.clear();

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const { fragment, cardEl } = buildResultCard(item);
    cardRefs.set(item.id, cardEl);
    resultsGrid.prepend(fragment);

    setCardLoading(cardEl, true);

    try {
      const data = await processImageWithGroq(item.base64, appSettings.customFields || []);
      const dupe  = await checkLeadExists(data);

      if (dupe.exists) {
        dupCount++;
        setCardDuplicate(cardEl, data, dupe.field);
        updateDupPill();
      } else {
        fillCard(cardEl, data);
        analyzedLeads.push({ id: item.id, data });
      }
    } catch (err) {
      console.error(`[NexusIQ] ${item.filename}:`, err);
      setCardError(cardEl, err.message);
    }

    doneCount++;
    if (analyzedCountEl) analyzedCountEl.textContent = doneCount;
    if (i < items.length - 1) await sleep(RATE_LIMIT);
  }

  analyzeBtn.disabled = false;
  analyzeBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg> Analyze More`;

  if (analyzedLeads.length) {
    syncAllBtn.classList.remove('hidden');
    exportCsvBtn.classList.remove('hidden');
  }
}

function buildResultCard(item) {
  const clone  = resultTemplate.content.cloneNode(true);
  const cardEl = clone.querySelector('.result-card');
  cardEl.id    = `card-${item.id}`;
  setText(cardEl, '.card-business-name', item.filename.replace(/\.[^/.]+$/, ''), false);
  return { fragment: clone, cardEl };
}

function setCardLoading(cardEl, isLoading) {
  cardEl.classList.toggle('loading', isLoading);
}

function fillCard(cardEl, data) {
  setCardLoading(cardEl, false);
  cardEl.classList.add('populated');

  setText(cardEl, '.card-business-name', data.businessName, true);
  setText(cardEl, '.card-phone',         data.contactNumber, true);
  setText(cardEl, '.card-email',         data.email, true);
  setText(cardEl, '.card-remarks',       data.remarks, true);

  const igEl = cardEl.querySelector('.card-instagram');
  if (igEl) {
    const link = data.instagramLink;
    if (link) {
      igEl.textContent = link;
      igEl.classList.remove('skeleton-box');
    } else {
      igEl.style.display = 'none';
    }
  }

  const body = cardEl.querySelector('.card-body');
  const coreKeys = new Set(['businessName','contactNumber','email','remarks','instagramLink']);
  Object.entries(data).forEach(([k, v]) => {
    if (!coreKeys.has(k) && v) {
      const row = document.createElement('div');
      row.className = 'ai-info-row';
      row.innerHTML = `<span class="ai-label">${k}</span><span class="ai-value">${v}</span>`;
      body?.appendChild(row);
    }
  });
}

function setCardDuplicate(cardEl, data, field) {
  setCardLoading(cardEl, false);
  cardEl.classList.add('duplicate-state');
  fillCard(cardEl, data);
  const badge = document.createElement('div');
  badge.className = 'duplicate-badge';
  badge.innerHTML = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg> Already in database — matched by ${field}`;
  cardEl.querySelector('.card-header')?.prepend(badge);
}

function setCardError(cardEl, msg) {
  setCardLoading(cardEl, false);
  cardEl.classList.add('error-state');
  setText(cardEl, '.card-business-name', 'Extraction Failed', true);
  setText(cardEl, '.card-remarks', msg || 'Unknown error.', true);
  removeAllSkeleton(cardEl);
}

function setText(cardEl, selector, value, removeSkeleton) {
  const el = cardEl.querySelector(selector);
  if (!el) return;
  el.textContent = value?.trim() || '—';
  if (removeSkeleton) el.classList.remove('skeleton-box');
}

function removeAllSkeleton(cardEl) {
  cardEl.querySelectorAll('.skeleton-box').forEach(el => el.classList.remove('skeleton-box'));
}

function updateDupPill() {
  if (!dupCount) return;
  duplicatePill.classList.remove('hidden');
  if (duplicateCountEl) duplicateCountEl.textContent = dupCount;
}

function openModal() {
  if (modalLeadCount) modalLeadCount.textContent = analyzedLeads.length;
  categoryModal.classList.remove('hidden');
  document.body.classList.add('modal-open');
}

function closeModal() {
  categoryModal.classList.add('hidden');
  document.body.classList.remove('modal-open');
}

async function confirmSync() {
  const cat = modalSelect.value;
  if (!cat) { alert('Please select a category.'); return; }
  closeModal();

  syncAllBtn.disabled = true;
  syncAllBtn.innerHTML = `<span class="spinner-sm"></span> Syncing…`;

  let ok = 0;
  for (const lead of analyzedLeads) {
    try {
      const success = await syncToFirestore(lead.data, cat);
      if (success) {
        ok++;
        const el = cardRefs.get(lead.id);
        if (el) el.classList.add('success-state');
      }
    } catch (e) { console.error('Sync error:', e); }
  }

  syncAllBtn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M20 6L9 17l-5-5"/></svg> ${ok} Leads Synced`;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
document.addEventListener('DOMContentLoaded', init);
