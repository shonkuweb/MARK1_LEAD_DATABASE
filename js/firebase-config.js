/**
 * FIREBASE CONFIGURATION
 * 
 * Instructions:
 * 1. Go to Firebase Console (https://console.firebase.google.com/)
 * 2. Project Settings > Your Apps > Web App
 * 3. Copy your firebaseConfig object and replace the one below.
 */

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDTUU3j-FeNuFyjTedWHlZS5CRxTd4udZw",
  authDomain: "mark1internal.firebaseapp.com",
  projectId: "mark1internal",
  storageBucket: "mark1internal.firebasestorage.app",
  messagingSenderId: "269688226462",
  appId: "1:269688226462:web:655e8656d0fdd792fdf18f",
  measurementId: "G-ME7LHS29K1"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

export { db };
