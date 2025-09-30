// Lightweight optional cloud sync using Firebase Firestore.
// This module is intentionally defensive: if Firebase config is missing or
// network errors occur, it fails silently and returns useful booleans.

import { getApps, initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { getAuth, signInWithEmailAndPassword, signOut as fbSignOut, onAuthStateChanged } from 'firebase/auth';

let dbClient: any = null;
let authClient: any = null;

async function tryInitDb() {
  if (dbClient) return dbClient;
  try {
    // dynamic import of optional config
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    // @ts-ignore
    const cfgModule = await import('./cloud-config');
    const cfg = cfgModule?.FIREBASE_CONFIG;
    if (cfg && Object.keys(cfg).length) {
      if (!getApps().length) initializeApp(cfg);
      dbClient = getFirestore();
      try { authClient = getAuth(); } catch (e) { authClient = null; }
      return dbClient;
    }
  } catch (e) {
    // missing config or failed to import
    dbClient = null;
  }
  return null;
}

async function passphraseKey(passphrase: string) {
  const enc = new TextEncoder();
  const data = enc.encode(passphrase);
  const hashBuf = await crypto.subtle.digest('SHA-256', data);
  // convert to hex
  const hashArray = Array.from(new Uint8Array(hashBuf));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}


export async function signIn(email: string, password: string) {
  try {
    await tryInitDb();
    if (!authClient) throw new Error('Auth not initialized');
    const res = await signInWithEmailAndPassword(authClient, email, password);
    return res.user;
  } catch (e) {
    console.warn('Sign-in failed', e);
    throw e;
  }
}

export async function signOut() {
  try {
    if (!authClient) return;
    await fbSignOut(authClient);
  } catch (e) {
    console.warn('Sign-out failed', e);
  }
}

export function onAuthChanged(cb: (uid: string | null) => void) {
  try {
    if (!authClient) return;
    onAuthStateChanged(authClient, (u) => cb(u ? u.uid : null));
  } catch (e) { /* ignore */ }
}

async function userPathDoc(db: any, uid: string, key: string) {
  // users/{uid}/ttb_sync/{key}
  return doc(db, 'users', uid, 'ttb_sync', key);
}

export async function fetchEncryptedBlob(passphrase: string) {
  try {
    const db = await tryInitDb();
    if (!db || !authClient) return null;
    const user = authClient.currentUser;
    if (!user) return null;
    const uid = user.uid;
    const key = await passphraseKey(passphrase);
    const ref = await userPathDoc(db, uid, key);
    const snap = await getDoc(ref);
    if (!snap.exists()) return null;
    const data = snap.data();
    return data?.blob ?? null;
  } catch (e) {
    console.warn('Cloud fetch failed', e);
    return null;
  }
}

export async function uploadEncryptedBlob(passphrase: string, encryptedJson: string) {
  try {
    const db = await tryInitDb();
    if (!db || !authClient) return false;
    const user = authClient.currentUser;
    if (!user) return false; // require signed-in user
    const uid = user.uid;
    const key = await passphraseKey(passphrase);
    const ref = await userPathDoc(db, uid, key);
    await setDoc(ref, { blob: String(encryptedJson), updatedAt: serverTimestamp() });
    return true;
  } catch (e) {
    console.warn('Cloud upload failed', e);
    return false;
  }
}
