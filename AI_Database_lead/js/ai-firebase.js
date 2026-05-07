import { collection, addDoc, getDoc, getDocs, query, where, doc, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import { db } from './firebase-config.js';

/**
 * Checks if a lead with the same name, contact, or email already exists.
 * @param {Object} data 
 * @returns {Promise<Object>} Object containing boolean result and field found
 */
export async function checkLeadExists(data) {
  const leadsRef = collection(db, "leads");
  
  // Prepare checks
  const checks = [
    { field: 'businessName', value: data.businessName },
    { field: 'contactNumber', value: data.contactNumber },
    { field: 'email', value: data.email }
  ].filter(c => c.value && c.value.trim().length > 1);

  for (const check of checks) {
    const q = query(leadsRef, where(check.field, "==", check.value));
    const snap = await getDocs(q);
    if (!snap.empty) {
      return { exists: true, field: check.field };
    }
  }

  return { exists: false };
}

/**
 * Fetches application settings (categories and custom fields).
 */
export async function fetchAppSettings() {
  const settingsDoc = doc(db, 'settings', 'config');
  const snap = await getDoc(settingsDoc);
  if (snap.exists()) {
    return snap.data();
  }
  return { categories: [], customFields: [] };
}

/**
 * Saves extracted data to Firestore if configured.
 * @param {Object} parsedData Data from the LLM
 * @param {string} selectedCategory Selected category from UI
 * @returns {Promise<boolean>} True if sync successful, false otherwise
 */
export async function syncToFirestore(parsedData, selectedCategory) {
  try {
    const displayDate = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    
    await addDoc(collection(db, "leads"), {
      ...parsedData,
      category: selectedCategory,
      date: displayDate,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    return true;
  } catch (error) {
    console.error("Failed to sync to Firestore:", error);
    return false;
  }
}
