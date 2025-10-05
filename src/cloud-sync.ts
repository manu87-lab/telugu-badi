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
      if (!getApps().length) {
        console.log('Initializing Firebase app...');
        initializeApp(cfg);
      }
      console.log('Getting Firestore instance...');
      dbClient = getFirestore();
      try {
        console.log('Getting Auth instance...');
        authClient = getAuth();
        if (!authClient) throw new Error('Auth client initialization failed');
      } catch (e) {
        console.error('Auth initialization error:', e);
        authClient = null;
      }
      return dbClient;
    } else {
      throw new Error('Invalid Firebase configuration');
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
    const db = await tryInitDb();
    console.log('DB initialization status:', !!db);
    if (!authClient) {
      console.error('Auth client not initialized');
      throw new Error('Auth not initialized');
    }
    console.log('Attempting sign in for:', email);
    const res = await signInWithEmailAndPassword(authClient, email, password);
    console.log('Sign in successful');
    return res.user;
  } catch (e: any) {
    console.error('Sign-in failed:', e?.code, e?.message);
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


function userPathDoc(db: any, uid: string) {
  // users/{uid}/ttb_sync/main
  return doc(db, 'users', uid, 'ttb_sync', 'main');
}

export async function fetchEncryptedBlob() {
  try {
    const db = await tryInitDb();
    if (!db || !authClient) return null;
    const user = authClient.currentUser;
    if (!user) return null;
    const uid = user.uid;
    const ref = userPathDoc(db, uid);
    const snap = await getDoc(ref);
    if (!snap.exists()) return null;
    const data = snap.data();
    return data?.blob ?? null;
  } catch (e) {
    console.warn('Cloud fetch failed', e);
    return null;
  }
}

export async function uploadEncryptedBlob(encryptedJson: string) {
  try {
    const db = await tryInitDb();
    if (!db || !authClient) return false;
    const user = authClient.currentUser;
    if (!user) return false; // require signed-in user
    const uid = user.uid;
    const ref = userPathDoc(db, uid);
    await setDoc(ref, { blob: String(encryptedJson), updatedAt: serverTimestamp() });
    return true;
  } catch (e) {
    console.warn('Cloud upload failed', e);
    return false;
  }
}
