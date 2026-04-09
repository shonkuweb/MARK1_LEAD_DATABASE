import { db } from './firebase-config.js';
import {
    collection,
    addDoc,
    getDoc,
    getDocs,
    query,
    orderBy,
    onSnapshot,
    serverTimestamp,
    doc,
    updateDoc,
    deleteDoc,
    setDoc
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

const LEADS_COLLECTION = 'leads';
const SETTINGS_DOC = doc(db, 'settings', 'config');

// Default settings (used if Firestore has no config yet)
const DEFAULT_CATEGORIES = ['Jewellery', 'Clothing', 'Footwear', 'Watch'];
const CORE_FIELDS = [
    { key: 'businessName', label: 'Business Name' },
    { key: 'category', label: 'Category' },
    { key: 'contactNumber', label: 'Contact' },
    { key: 'email', label: 'Email' },
    { key: 'remarks', label: 'Remarks' },
    { key: 'date', label: 'Date Added' }
];

let allLeads = [];
let appSettings = { categories: DEFAULT_CATEGORIES, customFields: [] };
let activeFilter = null; // Currently selected category filter

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function loadSettings() {
    try {
        const snap = await getDoc(SETTINGS_DOC);
        if (snap.exists()) {
            const d = snap.data();
            appSettings.categories = d.categories || DEFAULT_CATEGORIES;
            appSettings.customFields = d.customFields || [];
        } else {
            // Seed Firestore with defaults
            await setDoc(SETTINGS_DOC, { categories: DEFAULT_CATEGORIES, customFields: [] });
        }
    } catch (e) {
        console.error('Settings load error:', e);
    }
}

// ─── Dashboard Rendering ─────────────────────────────────────────────────────

const renderStats = (leads, settings) => {
    const totalEl = document.getElementById('totalCount');
    const catStatsEl = document.getElementById('categoryStats');
    if (!totalEl || !catStatsEl) return;

    totalEl.textContent = leads.length;

    // Category breakdown
    const counts = {};
    settings.categories.forEach(c => counts[c] = 0);
    leads.forEach(l => {
        if (l.category) counts[l.category] = (counts[l.category] || 0) + 1;
    });

    catStatsEl.innerHTML = 
        `<div class="stat-chip ${!activeFilter ? 'stat-chip-active' : ''}" data-filter="__all__">
            <span class="stat-chip-label">All</span>
            <span class="stat-chip-count">${leads.length}</span>
        </div>` +
        Object.entries(counts).map(([cat, count]) => `
            <div class="stat-chip ${activeFilter === cat ? 'stat-chip-active' : ''}" data-filter="${cat}">
                <span class="stat-chip-label">${cat}</span>
                <span class="stat-chip-count">${count}</span>
            </div>
        `).join('');

    // Bind chip click handlers
    catStatsEl.querySelectorAll('.stat-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            const filter = chip.getAttribute('data-filter');
            if (filter === '__all__' || activeFilter === filter) {
                activeFilter = null;
            } else {
                activeFilter = filter;
            }
            renderStats(allLeads, appSettings);
            renderLeadsTable(getFilteredLeads(), appSettings);
        });
    });
};

// Get leads filtered by active category
const getFilteredLeads = () => {
    if (!activeFilter) return allLeads;
    return allLeads.filter(l => l.category === activeFilter);
};

const renderTableHeaders = (settings) => {
    const headersRow = document.getElementById('tableHeaders');
    if (!headersRow) return;
    const allCols = [...CORE_FIELDS, ...settings.customFields.map(f => ({ key: f, label: f }))];
    headersRow.innerHTML = allCols.map(f => `<th>${f.label}</th>`).join('') + '<th>Actions</th>';
};

const renderLeadsTable = (leads, settings) => {
    const leadsBody = document.getElementById('leadsBody');
    if (!leadsBody) return;
    leadsBody.innerHTML = '';

    if (leads.length === 0) {
        leadsBody.innerHTML = `<tr><td colspan="10" style="text-align:center;color:var(--muted);padding:3rem;">No leads found. Start by adding one!</td></tr>`;
        // Also clear mobile cards
        const cardsEl = document.getElementById('leadsCards');
        if (cardsEl) cardsEl.innerHTML = `<p style="text-align:center;color:var(--muted);padding:3rem;">No leads found. Start by adding one!</p>`;
        return;
    }

    const allCols = [...CORE_FIELDS, ...settings.customFields.map(f => ({ key: f, label: f }))];

    leads.forEach(lead => {
        const row = document.createElement('tr');
        const cells = allCols.map(col => {
            if (col.key === 'category') return `<td><span class="tag">${lead.category || '-'}</span></td>`;
            if (col.key === 'businessName') return `<td style="font-weight:600;">${lead.businessName || '-'}</td>`;
            if (col.key === 'remarks') {
                const hasRemarks = lead.remarks && lead.remarks.trim();
                return hasRemarks
                    ? `<td><button class="remark-btn" data-remark="${lead.remarks.replace(/"/g, '&quot;')}" data-name="${(lead.businessName || '').replace(/"/g, '&quot;')}" style="background:transparent;border:1px solid var(--border);color:var(--muted);padding:0.3rem 0.7rem;font-size:0.7rem;cursor:pointer;text-transform:uppercase;letter-spacing:0.05em;transition:0.2s;">View</button></td>`
                    : `<td style="color:#333;">—</td>`;
            }
            if (col.key === 'date') return `<td style="color:var(--muted);font-size:0.8rem;">${lead.date || 'Just Added'}</td>`;
            return `<td>${lead[col.key] || '-'}</td>`;
        }).join('');

        row.innerHTML = cells + `
            <td style="display:flex;gap:0.5rem;">
                <button class="edit-btn" data-id="${lead.id}" style="background:var(--fg);border:none;color:var(--bg);padding:0.4rem 0.8rem;font-size:0.7rem;cursor:pointer;font-weight:600;">EDIT</button>
                <button class="delete-btn" data-id="${lead.id}" style="background:transparent;border:1px solid #333;color:#666;padding:0.4rem 0.8rem;font-size:0.7rem;cursor:pointer;">DELETE</button>
            </td>`;
        leadsBody.appendChild(row);
    });

    // ── Render Mobile Cards ──────────────────────────────────────────────
    renderMobileCards(leads, allCols);

    // ── Bind all interactive buttons (works for both table + cards) ──────
    bindLeadActions();
};

// ─── Mobile Card Renderer ────────────────────────────────────────────────────
const renderMobileCards = (leads, allCols) => {
    const cardsEl = document.getElementById('leadsCards');
    if (!cardsEl) return;
    cardsEl.innerHTML = '';

    leads.forEach(lead => {
        const fieldsHTML = allCols
            .filter(col => col.key !== 'businessName') // name shown in header
            .map(col => {
                let value = lead[col.key] || '—';
                if (col.key === 'category' && lead.category) {
                    value = `<span class="tag">${lead.category}</span>`;
                }
                if (col.key === 'remarks') {
                    const hasRemarks = lead.remarks && lead.remarks.trim();
                    value = hasRemarks
                        ? `<button class="remark-btn" data-remark="${lead.remarks.replace(/"/g, '&quot;')}" data-name="${(lead.businessName || '').replace(/"/g, '&quot;')}" style="background:transparent;border:1px solid var(--border);color:var(--muted);padding:0.25rem 0.6rem;font-size:0.7rem;cursor:pointer;text-transform:uppercase;letter-spacing:0.05em;">View</button>`
                        : '—';
                }
                return `
                    <div class="lead-card-field">
                        <span class="lead-card-field-label">${col.label}</span>
                        <span class="lead-card-field-value">${value}</span>
                    </div>`;
            }).join('');

        const card = document.createElement('div');
        card.className = 'lead-card';
        card.innerHTML = `
            <div class="lead-card-header">
                <span class="lead-card-name">${lead.businessName || 'Untitled'}</span>
                <span class="tag">${lead.category || '-'}</span>
            </div>
            <div class="lead-card-fields">
                ${fieldsHTML}
            </div>
            <div class="lead-card-actions">
                <button class="edit-btn btn" data-id="${lead.id}" style="background:var(--fg);color:var(--bg);border:none;font-weight:600;font-size:0.75rem;">EDIT</button>
                <button class="delete-btn btn btn-outline" data-id="${lead.id}" style="font-size:0.75rem;">DELETE</button>
            </div>`;
        cardsEl.appendChild(card);
    });
};

// ─── Bind Actions (Edit, Delete, Remark) — works for both table + cards ──────
const bindLeadActions = () => {
    // Edit
    document.querySelectorAll('.edit-btn').forEach(btn => {
        btn.onclick = e => { window.location.href = `entry.html?id=${e.target.getAttribute('data-id')}`; };
    });

    // Delete (custom modal)
    document.querySelectorAll('.delete-btn').forEach(btn => {
        btn.onclick = e => {
            const docId = e.target.getAttribute('data-id');
            if (!docId) return;
            const modal = document.getElementById('deleteModal');
            const cancelBtn = document.getElementById('cancelDelete');
            const confirmBtn = document.getElementById('confirmDelete');
            modal.classList.add('active');
            cancelBtn.onclick = () => modal.classList.remove('active');
            confirmBtn.onclick = async () => {
                modal.classList.remove('active');
                e.target.textContent = '...';
                e.target.disabled = true;
                try {
                    await deleteDoc(doc(db, LEADS_COLLECTION, docId));
                } catch (err) {
                    alert(`Delete failed: ${err.message}`);
                    e.target.textContent = 'DELETE';
                    e.target.disabled = false;
                }
            };
        };
    });

    // Remark Popup
    document.querySelectorAll('.remark-btn').forEach(btn => {
        btn.onclick = e => {
            const remark = e.target.getAttribute('data-remark');
            const name = e.target.getAttribute('data-name');
            const modal = document.getElementById('remarkModal');
            const titleEl = document.getElementById('remarkTitle');
            const bodyEl = document.getElementById('remarkBody');
            const closeBtn = document.getElementById('closeRemark');
            if (titleEl) titleEl.textContent = name;
            if (bodyEl) bodyEl.textContent = remark;
            modal.classList.add('active');
            closeBtn.onclick = () => modal.classList.remove('active');
            modal.onclick = ev => { if (ev.target === modal) modal.classList.remove('active'); };
        };
    });
};

// ─── Entry Form Logic ─────────────────────────────────────────────────────────

const buildEntryForm = (settings) => {
    const categorySelect = document.getElementById('category');
    if (categorySelect) {
        categorySelect.innerHTML = `<option value="" disabled selected>Select category</option>` +
            settings.categories.map(c => `<option value="${c}">${c}</option>`).join('');
    }

    // Render custom fields
    const customFieldsContainer = document.getElementById('customFieldsContainer');
    if (customFieldsContainer) {
        customFieldsContainer.innerHTML = settings.customFields.map(field => `
            <div class="form-group">
                <label for="cf_${field}">${field}</label>
                <input type="text" id="cf_${field}" name="${field}" placeholder="${field}...">
            </div>
        `).join('');
    }
};

// ─── Main ─────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
    const leadForm = document.getElementById('leadForm');
    const leadsBody = document.getElementById('leadsBody');
    const pageTitle = document.querySelector('h1');
    const submitBtn = document.querySelector('button[type="submit"]');
    const editModeId = new URLSearchParams(window.location.search).get('id');

    // Load settings from Firestore first
    await loadSettings();

    // ─── Dashboard mode ──────────────────────────────────────────────────
    if (leadsBody) {
        renderTableHeaders(appSettings);

        onSnapshot(collection(db, LEADS_COLLECTION), (snapshot) => {
            allLeads = [];
            snapshot.forEach(d => allLeads.push({ id: d.id, ...d.data() }));
            allLeads.sort((a, b) => (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0));
            renderStats(allLeads, appSettings);
            renderLeadsTable(getFilteredLeads(), appSettings);
        }, err => {
            console.error('Snapshot error:', err);
            leadsBody.innerHTML = `<tr><td colspan="10" style="text-align:center;color:var(--muted);padding:2rem;">Could not connect to database. Check Firestore rules.</td></tr>`;
        });

        // Also listen for settings changes so stats/headers update live
        onSnapshot(SETTINGS_DOC, snap => {
            if (snap.exists()) {
                const d = snap.data();
                appSettings.categories = d.categories || DEFAULT_CATEGORIES;
                appSettings.customFields = d.customFields || [];
                renderTableHeaders(appSettings);
                renderStats(allLeads, appSettings);
                renderLeadsTable(getFilteredLeads(), appSettings);
            }
        });
    }

    // ─── Entry Form mode ──────────────────────────────────────────────────
    if (leadForm) {
        buildEntryForm(appSettings);

        // Edit mode: pre-fill
        if (editModeId) {
            if (pageTitle) pageTitle.textContent = 'Edit Lead';
            if (submitBtn) submitBtn.textContent = 'Update Lead';
            try {
                const snap = await getDoc(doc(db, LEADS_COLLECTION, editModeId));
                if (snap.exists()) {
                    const data = snap.data();
                    Object.keys(data).forEach(key => {
                        const input = leadForm.querySelector(`[name="${key}"]`);
                        if (input) input.value = data[key];
                    });
                }
            } catch (e) { console.error('Prefill error:', e); }
        }

        // Duplicate check listeners
        ['businessName', 'contactNumber', 'email'].forEach(id => {
            const input = document.getElementById(id);
            if (!input) return;
            input.addEventListener('input', e => {
                const value = e.target.value.trim().toLowerCase();
                const fieldName = id === 'businessName' ? 'Business Name' : id === 'contactNumber' ? 'Contact' : 'Email';
                const warn = input.parentNode.querySelector('.warning-msg');
                if (warn) warn.remove();
                input.classList.remove('has-error');
                if (value.length < 2) return;
                const isDupe = allLeads.some(lead => {
                    if (editModeId && lead.id === editModeId) return false;
                    return (lead[id] || '').toString().toLowerCase() === value;
                });
                if (isDupe) {
                    input.classList.add('has-error');
                    const span = document.createElement('span');
                    span.className = 'warning-msg';
                    span.textContent = `This ${fieldName} already exists.`;
                    input.parentNode.appendChild(span);
                }
            });
        });

        // Prefetch leads for duplicate check on entry page
        try {
            const snap = await getDocs(collection(db, LEADS_COLLECTION));
            snap.forEach(d => allLeads.push({ id: d.id, ...d.data() }));
        } catch (e) { console.error('Prefetch error:', e); }

        leadForm.addEventListener('submit', async e => {
            e.preventDefault();
            if (leadForm.querySelector('.has-error')) { alert('Resolve duplicates first.'); return; }

            const formData = new FormData(leadForm);
            const data = Object.fromEntries(formData.entries());
            if (submitBtn) { submitBtn.textContent = editModeId ? 'Updating...' : 'Syncing...'; submitBtn.disabled = true; }

            try {
                if (editModeId) {
                    await updateDoc(doc(db, LEADS_COLLECTION, editModeId), { ...data, updatedAt: serverTimestamp() });
                } else {
                    const displayDate = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                    await addDoc(collection(db, LEADS_COLLECTION), { ...data, date: displayDate, createdAt: serverTimestamp() });
                }
                window.location.href = 'index.html';
            } catch (err) {
                alert(`Operation failed: ${err.message}`);
                if (submitBtn) { submitBtn.textContent = editModeId ? 'Update Lead' : 'Save Lead'; submitBtn.disabled = false; }
            }
        });
    }
});
