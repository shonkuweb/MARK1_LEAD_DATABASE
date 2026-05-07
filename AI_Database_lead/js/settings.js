import { db } from './firebase-config.js';
import {
    doc,
    getDoc,
    setDoc,
    updateDoc,
    onSnapshot,
    arrayUnion,
    arrayRemove
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

const SETTINGS_DOC = doc(db, 'settings', 'config');
const DEFAULT_CATEGORIES = ['Jewellery', 'Clothing', 'Footwear', 'Watch'];

let settings = { categories: [], customFields: [] };

// ─── UI Helpers ──────────────────────────────────────────────────────────────

const setBadge = (id, text, color) => {
    const el = document.getElementById(id);
    if (el) { el.textContent = text; el.style.background = color || '#1a1a1a'; }
};

const renderList = (ulId, items, onRemove) => {
    const ul = document.getElementById(ulId);
    if (!ul) return;
    ul.innerHTML = items.length === 0
        ? `<li style="color:var(--muted);">None yet. Add one below.</li>`
        : items.map(item => `
            <li class="settings-list-item">
                <span>${item}</span>
                <button class="remove-btn" data-value="${item}" style="background:transparent;border:1px solid #333;color:#666;padding:0.2rem 0.6rem;font-size:0.7rem;cursor:pointer;">✕</button>
            </li>
        `).join('');

    ul.querySelectorAll('.remove-btn').forEach(btn => {
        btn.onclick = () => onRemove(btn.getAttribute('data-value'));
    });
};

// ─── Firestore Ops ───────────────────────────────────────────────────────────

async function addCategory(name) {
    if (!name.trim()) return;
    setBadge('categorySyncBadge', 'SAVING…', '#2a2a2a');
    try {
        await updateDoc(SETTINGS_DOC, { categories: arrayUnion(name.trim()) });
    } catch (e) { console.error(e); }
}

async function removeCategory(name) {
    setBadge('categorySyncBadge', 'SAVING…', '#2a2a2a');
    try {
        await updateDoc(SETTINGS_DOC, { categories: arrayRemove(name) });
    } catch (e) { console.error(e); }
}

async function addColumn(name) {
    if (!name.trim()) return;
    setBadge('columnSyncBadge', 'SAVING…', '#2a2a2a');
    try {
        await updateDoc(SETTINGS_DOC, { customFields: arrayUnion(name.trim()) });
    } catch (e) { console.error(e); }
}

async function removeColumn(name) {
    setBadge('columnSyncBadge', 'SAVING…', '#2a2a2a');
    try {
        await updateDoc(SETTINGS_DOC, { customFields: arrayRemove(name) });
    } catch (e) { console.error(e); }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
    // Seed default settings if not present
    try {
        const snap = await getDoc(SETTINGS_DOC);
        if (!snap.exists()) {
            await setDoc(SETTINGS_DOC, { categories: DEFAULT_CATEGORIES, customFields: [] });
        }
    } catch (e) { console.error('Settings init error:', e); }

    // Real-time listener for settings
    onSnapshot(SETTINGS_DOC, snap => {
        if (snap.exists()) {
            const data = snap.data();
            settings.categories = data.categories || [];
            settings.customFields = data.customFields || [];

            renderList('categoryList', settings.categories, removeCategory);
            renderList('columnList', settings.customFields, removeColumn);
            setBadge('categorySyncBadge', 'SYNCED');
            setBadge('columnSyncBadge', 'SYNCED');
        }
    }, err => {
        console.error('Settings listener error:', err);
        setBadge('categorySyncBadge', 'ERROR', '#330000');
        setBadge('columnSyncBadge', 'ERROR', '#330000');
    });

    // Add Category
    const addCatBtn = document.getElementById('addCategoryBtn');
    const newCatInput = document.getElementById('newCategory');
    if (addCatBtn && newCatInput) {
        addCatBtn.onclick = async () => {
            await addCategory(newCatInput.value);
            newCatInput.value = '';
        };
        newCatInput.addEventListener('keydown', async e => {
            if (e.key === 'Enter') { await addCategory(newCatInput.value); newCatInput.value = ''; }
        });
    }

    // Add Column
    const addColBtn = document.getElementById('addColumnBtn');
    const newColInput = document.getElementById('newColumn');
    if (addColBtn && newColInput) {
        addColBtn.onclick = async () => {
            await addColumn(newColInput.value);
            newColInput.value = '';
        };
        newColInput.addEventListener('keydown', async e => {
            if (e.key === 'Enter') { await addColumn(newColInput.value); newColInput.value = ''; }
        });
    }
    // Groq Integration management
    const groqKeyInput = document.getElementById('groqApiKey');
    const saveKeyBtn = document.getElementById('saveGroqKeyBtn');
    
    // Load existing key
    if (groqKeyInput) {
        groqKeyInput.value = localStorage.getItem('NEXUS_GROQ_KEY') || '';
    }

    if (saveKeyBtn && groqKeyInput) {
        saveKeyBtn.onclick = () => {
            const key = groqKeyInput.value.trim();
            if (key) {
                localStorage.setItem('NEXUS_GROQ_KEY', key);
                saveKeyBtn.textContent = 'SAVED';
                setTimeout(() => { saveKeyBtn.textContent = 'Save'; }, 2000);
            } else {
                localStorage.removeItem('NEXUS_GROQ_KEY');
                saveKeyBtn.textContent = 'REMOVED';
                setTimeout(() => { saveKeyBtn.textContent = 'Save'; }, 2000);
            }
        };
    }
});
