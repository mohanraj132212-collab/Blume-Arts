// ============================================================
// BLUME ARTS — Firebase configuration
// ------------------------------------------------------------
// Uses Firebase Authentication & Firebase Firestore ONLY.
// No Firebase Cloud Storage is initialized or used.
// ============================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";

export const firebaseConfig = {
  apiKey: "AIzaSyDSB6g3My6ZpOx2XnCr3GlOSoWuivxa5Bk",
  authDomain: "blume-arts.firebaseapp.com",
  projectId: "blume-arts",
  messagingSenderId: "928442118943",
  appId: "1:928442118943:web:52801da1ffb314205eb62a",
};

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);

// Fallback settings used until settings/business loads from Firestore
export const DEFAULT_SETTINGS = {
  businessName: "Blume Arts",
  phone: "07397 536 605",
  whatsapp: "447397536605", // country code + number, digits only
  email: "sumithasenthil777@gmail.com",
  instagram: "@blume_arts07",
  instagramUrl: "https://instagram.com/blume_arts07",
  address: "",
  description: "Handmade pipe cleaner flowers, crafted with love.",
  deliveryInfo: "Delivery details shared after order confirmation on WhatsApp.",
  footerText: "Handmade With Love",
};