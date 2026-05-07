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
let activeStatusFilter = '';
let activeSearchTerm = '';
let activeRemarkLeadId = null;

const STATUS_CONFIG = {
    new: { label: 'New', color: '#5bc0ff' },
    contacted: { label: 'Contacted', color: '#c084fc' },
    interested: { label: 'Interested', color: '#facc15' },
    'not interested': { label: 'Not Interested', color: '#fb7185' },
    success: { label: 'Success', color: '#4ade80' },
    'on follow up': { label: 'On Follow Up', color: '#f97316' }
};
const STATUS_ORDER = ['new', 'contacted', 'interested', 'not interested', 'on follow up', 'success'];

const escapeHtml = (value = '') => String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const normalizeStatus = (status = '') => {
    const key = String(status).trim().toLowerCase();
    return STATUS_CONFIG[key] ? key : 'new';
};

const getStatusBadge = (status) => {
    const key = normalizeStatus(status);
    const cfg = STATUS_CONFIG[key];
    return `<span class="status-badge" style="color:${cfg.color}"><span class="status-dot" style="background:${cfg.color}"></span>${cfg.label}</span>`;
};

const getStatusSelectOptions = (selectedStatus = 'new') => STATUS_ORDER.map(statusKey => {
    const cfg = STATUS_CONFIG[statusKey];
    return `<option value="${statusKey}" ${statusKey === normalizeStatus(selectedStatus) ? 'selected' : ''}>${cfg.label}</option>`;
}).join('');

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
const getFilteredLeads = () => allLeads.filter(lead => {
    const categoryMatch = !activeFilter || lead.category === activeFilter;
    const statusMatch = !activeStatusFilter || normalizeStatus(lead.status) === activeStatusFilter;
    if (!activeSearchTerm) return categoryMatch && statusMatch;

    const query = activeSearchTerm.toLowerCase();
    const name = (lead.businessName || '').toLowerCase();
    const phone = (lead.contactNumber || '').toLowerCase();
    const insta = (lead.instagram || lead.instagramUrl || '').toLowerCase();
    const searchMatch = name.includes(query) || phone.includes(query) || insta.includes(query);
    return categoryMatch && statusMatch && searchMatch;
});

const renderTableHeaders = (settings) => {
    const headersRow = document.getElementById('tableHeaders');
    if (!headersRow) return;
    const allCols = [...CORE_FIELDS, ...settings.customFields.map(f => ({ key: f, label: f }))];
    headersRow.innerHTML = allCols.map(f => `<th>${f.label}</th>`).join('') + '<th>Status</th><th>Actions</th>';
};

const renderStatusLegend = () => {
    const legend = document.getElementById('statusLegend');
    if (!legend) return;
    legend.innerHTML = STATUS_ORDER.map(key => {
        const cfg = STATUS_CONFIG[key];
        return `<span class="status-legend-chip" style="color:${cfg.color}"><span class="status-dot" style="background:${cfg.color}"></span>${cfg.label}</span>`;
    }).join('');
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

    const grouped = STATUS_ORDER.map(key => ({
        key,
        title: STATUS_CONFIG[key].label,
        color: STATUS_CONFIG[key].color,
        leads: leads.filter(lead => normalizeStatus(lead.status) === key)
    })).filter(group => group.leads.length > 0);

    grouped.forEach(group => {
        const sectionRow = document.createElement('tr');
        sectionRow.className = 'section-row';
        sectionRow.innerHTML = `<td colspan="${allCols.length + 2}">
            <div class="status-section-title"><span class="status-dot" style="background:${group.color}"></span>${group.title} (${group.leads.length})</div>
        </td>`;
        leadsBody.appendChild(sectionRow);

        group.leads.forEach(lead => {
        const row = document.createElement('tr');
        const cells = allCols.map(col => {
            if (col.key === 'category') return `<td><span class="tag">${lead.category || '-'}</span></td>`;
            if (col.key === 'businessName') return `<td style="font-weight:600;">${lead.businessName || '-'}</td>`;
            if (col.key === 'remarks') {
                return `<td><button class="remark-btn" data-id="${lead.id}" data-remark="${(lead.remarks || '').replace(/"/g, '&quot;')}" data-name="${(lead.businessName || '').replace(/"/g, '&quot;')}" style="background:transparent;border:1px solid var(--border);color:var(--muted);padding:0.3rem 0.7rem;font-size:0.7rem;cursor:pointer;text-transform:uppercase;letter-spacing:0.05em;transition:0.2s;">View / Edit</button></td>`;
            }
            if (col.key === 'date') return `<td style="color:var(--muted);font-size:0.8rem;">${lead.date || 'Just Added'}</td>`;
            return `<td>${lead[col.key] || '-'}</td>`;
        }).join('');

        row.innerHTML = cells + `
            <td>
                <select class="status-select" data-id="${lead.id}" style="border-color:${STATUS_CONFIG[normalizeStatus(lead.status)].color};color:${STATUS_CONFIG[normalizeStatus(lead.status)].color};">${getStatusSelectOptions(lead.status)}</select>
            </td>
            <td style="display:flex;gap:0.5rem;align-items:flex-start;flex-direction:column;">
                <button class="edit-btn" data-id="${lead.id}" style="background:var(--fg);border:none;color:var(--bg);padding:0.4rem 0.8rem;font-size:0.7rem;cursor:pointer;font-weight:600;">EDIT</button>
                <button class="delete-btn" data-id="${lead.id}" style="background:transparent;border:1px solid #333;color:#666;padding:0.4rem 0.8rem;font-size:0.7rem;cursor:pointer;">DELETE</button>
            </td>`;
        leadsBody.appendChild(row);
        });
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

    const grouped = STATUS_ORDER.map(key => ({
        key,
        title: STATUS_CONFIG[key].label,
        color: STATUS_CONFIG[key].color,
        leads: leads.filter(lead => normalizeStatus(lead.status) === key)
    })).filter(group => group.leads.length > 0);

    grouped.forEach(group => {
        const section = document.createElement('section');
        section.className = 'lead-card-section';
        section.innerHTML = `<div class="lead-card-section-title"><span class="status-dot" style="background:${group.color}"></span>${group.title} (${group.leads.length})</div>`;

        group.leads.forEach(lead => {
        const fieldsHTML = allCols
            .filter(col => col.key !== 'businessName') // name shown in header
            .map(col => {
                let value = lead[col.key] || '—';
                if (col.key === 'category' && lead.category) {
                    value = `<span class="tag">${lead.category}</span>`;
                }
                if (col.key === 'remarks') {
                    value = `<button class="remark-btn" data-id="${lead.id}" data-remark="${(lead.remarks || '').replace(/"/g, '&quot;')}" data-name="${(lead.businessName || '').replace(/"/g, '&quot;')}" style="background:transparent;border:1px solid var(--border);color:var(--muted);padding:0.25rem 0.6rem;font-size:0.7rem;cursor:pointer;text-transform:uppercase;letter-spacing:0.05em;">View / Edit</button>`;
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
                ${getStatusBadge(lead.status)}
            </div>
            <div class="lead-card-fields">
                <div class="lead-card-field">
                    <span class="lead-card-field-label">Status</span>
                    <span class="lead-card-field-value">
                        <select class="status-select" data-id="${lead.id}" style="border-color:${STATUS_CONFIG[normalizeStatus(lead.status)].color};color:${STATUS_CONFIG[normalizeStatus(lead.status)].color};">${getStatusSelectOptions(lead.status)}</select>
                    </span>
                </div>
                ${fieldsHTML}
            </div>
            <div class="lead-card-actions">
                <button class="edit-btn btn" data-id="${lead.id}" style="background:var(--fg);color:var(--bg);border:none;font-weight:600;font-size:0.75rem;">EDIT</button>
                <button class="delete-btn btn btn-outline" data-id="${lead.id}" style="font-size:0.75rem;">DELETE</button>
            </div>`;
        section.appendChild(card);
        });
        cardsEl.appendChild(section);
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
            const docId = e.target.getAttribute('data-id');
            const remark = e.target.getAttribute('data-remark');
            const name = e.target.getAttribute('data-name');
            const modal = document.getElementById('remarkModal');
            const titleEl = document.getElementById('remarkTitle');
            const inputEl = document.getElementById('remarkInput');
            const saveBtn = document.getElementById('saveRemark');
            const closeBtn = document.getElementById('closeRemark');
            activeRemarkLeadId = docId;
            if (titleEl) titleEl.textContent = name;
            if (inputEl) inputEl.value = remark || '';
            modal.classList.add('active');
            closeBtn.onclick = () => modal.classList.remove('active');
            modal.onclick = ev => { if (ev.target === modal) modal.classList.remove('active'); };
            if (saveBtn) {
                saveBtn.onclick = async () => {
                    if (!activeRemarkLeadId || !inputEl) return;
                    const original = saveBtn.textContent;
                    saveBtn.textContent = 'Saving...';
                    saveBtn.disabled = true;
                    try {
                        const nextRemark = inputEl.value.trim();
                        await updateDoc(doc(db, LEADS_COLLECTION, activeRemarkLeadId), { remarks: nextRemark, updatedAt: serverTimestamp() });
                        modal.classList.remove('active');
                    } catch (err) {
                        alert(`Remark update failed: ${err.message}`);
                    } finally {
                        saveBtn.textContent = original;
                        saveBtn.disabled = false;
                    }
                };
            }
        };
    });

    // Status updates
    document.querySelectorAll('.status-select').forEach(select => {
        select.onchange = async e => {
            const docId = e.target.getAttribute('data-id');
            const nextStatus = normalizeStatus(e.target.value);
            if (!docId) return;
            const previous = allLeads.find(l => l.id === docId)?.status || 'new';
            const cfg = STATUS_CONFIG[nextStatus];
            e.target.style.borderColor = cfg.color;
            e.target.style.color = cfg.color;
            allLeads = allLeads.map(lead => lead.id === docId ? { ...lead, status: nextStatus } : lead);
            renderLeadsTable(getFilteredLeads(), appSettings);
            try {
                await updateDoc(doc(db, LEADS_COLLECTION, docId), { status: nextStatus, updatedAt: serverTimestamp() });
            } catch (err) {
                allLeads = allLeads.map(lead => lead.id === docId ? { ...lead, status: previous } : lead);
                renderLeadsTable(getFilteredLeads(), appSettings);
                alert(`Status update failed: ${err.message}`);
            }
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
        const statusFilterEl = document.getElementById('statusFilter');
        const searchEl = document.getElementById('leadSearch');
        const clearFiltersBtn = document.getElementById('clearFilters');

        if (statusFilterEl) {
            statusFilterEl.innerHTML = `<option value="">All Statuses</option>` +
                STATUS_ORDER.map(key => `<option value="${key}">${STATUS_CONFIG[key].label}</option>`).join('');
            statusFilterEl.addEventListener('change', () => {
                activeStatusFilter = statusFilterEl.value;
                renderLeadsTable(getFilteredLeads(), appSettings);
            });
        }

        if (searchEl) {
            searchEl.addEventListener('input', () => {
                activeSearchTerm = searchEl.value.trim();
                renderLeadsTable(getFilteredLeads(), appSettings);
            });
        }

        if (clearFiltersBtn) {
            clearFiltersBtn.addEventListener('click', () => {
                activeFilter = null;
                activeStatusFilter = '';
                activeSearchTerm = '';
                if (searchEl) searchEl.value = '';
                if (statusFilterEl) statusFilterEl.value = '';
                renderStats(allLeads, appSettings);
                renderLeadsTable(getFilteredLeads(), appSettings);
            });
        }

        renderTableHeaders(appSettings);
        renderStatusLegend();

        onSnapshot(collection(db, LEADS_COLLECTION), (snapshot) => {
            allLeads = [];
            snapshot.forEach(d => allLeads.push({ id: d.id, ...d.data() }));
            allLeads.sort((a, b) => (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0));
            allLeads = allLeads.map(lead => ({ ...lead, status: normalizeStatus(lead.status) }));
            allLeads.forEach(lead => {
                if (!lead.status || !STATUS_CONFIG[String(lead.status).toLowerCase()]) {
                    updateDoc(doc(db, LEADS_COLLECTION, lead.id), { status: 'new', updatedAt: serverTimestamp() }).catch(() => {});
                }
            });
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
                    await addDoc(collection(db, LEADS_COLLECTION), { ...data, status: 'new', date: displayDate, createdAt: serverTimestamp() });
                }
                window.location.href = 'index.html';
            } catch (err) {
                alert(`Operation failed: ${err.message}`);
                if (submitBtn) { submitBtn.textContent = editModeId ? 'Update Lead' : 'Save Lead'; submitBtn.disabled = false; }
            }
        });
    }
});
