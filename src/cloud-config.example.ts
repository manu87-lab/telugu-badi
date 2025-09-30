// Copy this file to src/cloud-config.ts and fill the values with your
// Firebase project's configuration. The sync module is optional — if
// src/cloud-config.ts is not present the app will continue to use local
// IndexedDB only.

export const FIREBASE_CONFIG = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT.appspot.com",
  messagingSenderId: "SENDER_ID",
  appId: "APP_ID",
};

// Optional: set the Firestore collection name used to store encrypted blobs
export const FIRESTORE_COLLECTION = 'ttb_encrypted_db_v1';

// Note: The cloud sync module now uses Firebase Authentication to store
// per-user documents under users/{uid}/ttb_sync/{key}. Create test users
// in your Firebase console (Authentication -> Users) or enable self
// sign-up in your project to use the sign-in flow in the app.
