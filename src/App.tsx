import React, { useEffect, useState, useRef } from "react";

// ---- Types ----
type PhotoSet = { student?: string; father?: string; mother?: string; guardian1?: string; guardian2?: string };
type Student = {
  id: string;
  name: string;
  classSection: string;
  dateOfBirth?: string;
  fatherName?: string;
  motherName?: string;
  guardian1Name?: string;
  guardian2Name?: string;
  contact?: string;
  email?: string;
  address?: string;
  photos?: PhotoSet;
};
type AppDB = { students: Student[]; logs: any[] };

/*
Triangle Telugu Badi - Single-file React app (fixed storage)

This version fixes a `QuotaExceededError` that occurred when storing
large encrypted data (images + JSON) into localStorage.

Fixes applied:
1. Use IndexedDB (preferred) for storing the encrypted database blob. IndexedDB
   has much larger storage quotas than localStorage and is appropriate for
   storing images and encrypted data.
2. Client-side image compression on upload (canvas -> JPEG at reduced quality)
   to dramatically reduce the size of stored images before encryption.
3. Robust fallback: if IndexedDB write fails, attempt localStorage; if that
   also fails due to quota, a clear, actionable error is raised.

Notes:
- This file keeps the same high-level app behavior (enrollment, check-in,
  check-out) but replaces the storage layer and compresses images.
- For production, consider server-side sync and authenticated backups.
*/

// ---------------------------
// Imports & Globals
// ---------------------------
const enc = new TextEncoder();
const dec = new TextDecoder();
const STORAGE_KEY = "ttb:encrypted-db"; // used as key inside IndexedDB 'kv' store

// ---------------------------
// IndexedDB helpers (small wrapper)
// ---------------------------
async function openIndexedDB() {
  if (!('indexedDB' in window)) throw new Error('IndexedDB not supported in this browser');
  return new Promise((resolve, reject) => {
    const req = window.indexedDB.open('ttb-indexeddb', 1);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('IndexedDB open failed'));
  });
}

async function idbPut(key, value) {
  const db = await openIndexedDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('kv', 'readwrite');
    const store = tx.objectStore('kv');
    const r = store.put(value, key);
    r.onsuccess = () => resolve();
    r.onerror = () => reject(r.error || new Error('IDB put failed'));
  });
}

async function idbGet(key) {
  const db = await openIndexedDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('kv', 'readonly');
    const store = tx.objectStore('kv');
    const r = store.get(key);
    r.onsuccess = () => resolve(r.result === undefined ? null : r.result);
    r.onerror = () => reject(r.error || new Error('IDB get failed'));
  });
}

async function idbDelete(key) {
  const db = await openIndexedDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('kv', 'readwrite');
    const store = tx.objectStore('kv');
    const r = store.delete(key);
    r.onsuccess = () => resolve();
    r.onerror = () => reject(r.error || new Error('IDB delete failed'));
  });
}

// ---------------------------
// Crypto helpers (unchanged core logic)
// ---------------------------
async function deriveKeyFromPassphrase(passphrase, salt) {
  const passKey = await window.crypto.subtle.importKey(
    "raw",
    enc.encode(passphrase),
    { name: "PBKDF2" },
    false,
    ["deriveKey"]
  );
  return window.crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt,
      iterations: 200000,
      hash: "SHA-256",
    },
    passKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

async function encryptJSON(obj, passphrase) {
  const salt = window.crypto.getRandomValues(new Uint8Array(16));
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKeyFromPassphrase(passphrase, salt);
  const data = enc.encode(JSON.stringify(obj));
  const cipher = await window.crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, data);
  // store as base64 for portability
  return JSON.stringify({
    salt: arrayBufferToBase64(salt.buffer),
    iv: arrayBufferToBase64(iv.buffer),
    cipher: arrayBufferToBase64(cipher),
  });
}

async function decryptJSON(encryptedStr, passphrase) {
  const parsed = JSON.parse(encryptedStr);
  const salt = base64ToArrayBuffer(parsed.salt);
  const iv = base64ToArrayBuffer(parsed.iv);
  const cipher = base64ToArrayBuffer(parsed.cipher);
  const key = await deriveKeyFromPassphrase(passphrase, new Uint8Array(salt));
  try {
    const plain = await window.crypto.subtle.decrypt({ name: "AES-GCM", iv: new Uint8Array(iv) }, key, cipher);
    return JSON.parse(dec.decode(plain));
  } catch (e) {
    throw new Error("Decryption failed: wrong passphrase or corrupted data.");
  }
}

function arrayBufferToBase64(buffer) {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

function base64ToArrayBuffer(base64) {
  const binary = window.atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

// ---------------------------
// Storage layer (use IndexedDB first, fallback to localStorage)
// ---------------------------
async function loadDB(passphrase) {
  // Try IndexedDB first
  try {
    const blob = await idbGet(STORAGE_KEY);
    if (blob) return decryptJSON(blob, passphrase);
  } catch (e) {
    // IndexedDB failure — continue to fallback
    console.warn('IndexedDB load failed, falling back to localStorage', e);
  }
  // Fallback for older data stored in localStorage
  const ls = localStorage.getItem(STORAGE_KEY);
  if (!ls) return { students: [], logs: [] };
  // Migrate to IndexedDB if possible (best-effort)
  try {
    await idbPut(STORAGE_KEY, ls);
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) { /* ignore */ }
  } catch (e) {
    // Ignore migration errors
  }
  return decryptJSON(ls, passphrase);
}

async function saveDB(dbObj: AppDB, passphrase: string) {
  const encStr = await encryptJSON(dbObj, passphrase);
  // Prefer IndexedDB
  try {
    await idbPut(STORAGE_KEY, encStr);
    return;
  } catch (e) {
    console.warn('IndexedDB write failed, attempting localStorage', e);
  }
  // Fallback to localStorage (may throw QuotaExceededError)
  try {
    localStorage.setItem(STORAGE_KEY, encStr);
    return;
  } catch (e) {
    // Provide a helpful error for quota problems
    if (e && (e.name === 'QuotaExceededError' || e.code === 22 || e.number === -2147024882)) {
      throw new Error('Storage quota exceeded: cannot save data. Try removing large photos, clear storage, or use a device with more available storage.');
    }
    throw e;
  }
}

// ---------------------------
// Helpers
// ---------------------------
function uid(prefix = "id") {
  return prefix + "_" + Math.random().toString(36).slice(2, 9);
}

// Generate student ID in the format:
// TATATB-<YY><YY+1><classCode><seq>
// Example: enrollment in 2025, class Pravesham (01), first student -> TATATB-2526010001
function generateStudentId(classSection: string, enrollmentYear?: number, existingStudents?: Student[]) {
  const classMap: Record<string, string> = {
    Pravesham: '01',
    Pravalam: '02',
    Pradhanam: '03',
    Pravardham: '04',
    Praaveenyam: '05',
  };
  const year = enrollmentYear || new Date().getFullYear();
  const yyStart = String(year).slice(-2);
  const yyEnd = String(year + 1).slice(-2);
  const yearPart = `${yyStart}${yyEnd}`; // e.g. '2526'
  const classCode = classMap[classSection] || '00';
  const prefix = `TATATB-${yearPart}${classCode}`;

  // Count existing students that match this prefix to determine the next sequence
  const list = existingStudents || [];
  const regex = new RegExp(`^${prefix}(\\d{4})$`);
  let maxSeq = 0;
  for (const s of list) {
    const m = s.id.match(regex);
    if (m) {
      const seq = parseInt(m[1], 10);
      if (!isNaN(seq) && seq > maxSeq) maxSeq = seq;
    }
  }
  const nextSeq = (maxSeq + 1).toString().padStart(4, '0');
  return `${prefix}${nextSeq}`;
}

function nowISO() {
  return new Date().toISOString();
}

function humanTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString();
}

// Add this new function
function calculateAge(dateOfBirth) {
  if (!dateOfBirth) return "";
  const today = new Date();
  const birthDate = new Date(dateOfBirth);
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  
  return age;
}

// Compress image file via canvas -> JPEG (reduces size dramatically)
function fileToDataUrl(file: File | null, maxDim = 900, quality = 0.75) {
  return new Promise<string | null>((res, rej) => {
    if (!file) return res(null);
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img as HTMLImageElement;
        const max = maxDim;
        if (width > max || height > max) {
          const ratio = Math.min(max / width, max / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return rej(new Error('Canvas 2D context unavailable'));
  ctx.drawImage(img, 0, 0, width, height);
        // Convert to JPEG to reduce size (even for PNG originals)
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        res(dataUrl);
      };
      img.onerror = () => rej(new Error('Image load failed'));
      img.src = String(reader.result);
    };
    reader.onerror = (err) => rej(err);
    reader.readAsDataURL(file);
  });
}

// ---------------------------
// Main React App
// ---------------------------
export default function App() {
  const [passphrase, setPassphrase] = useState<string>("");
  const [db, setDb] = useState<AppDB>({ students: [], logs: [] });
  const [unlocked, setUnlocked] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [view, setView] = useState<string>("checkin"); // checkin | checkout | admin

  const emptyForm = {
    id: "",
    name: "",
    classSection: "Pravesham",
    dateOfBirth: "",
    fatherName: "",
    motherName: "",
    guardian1Name: "",
    guardian2Name: "",
    contact: "",
    email: "",
    address: "",
    photos: { student: "", father: "", mother: "", guardian1: "", guardian2: "" },
  };
  const [form, setForm] = useState<any>(emptyForm);
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [checkoutGuardian, setCheckoutGuardian] = useState<string>("");
  // New states for class-based selection + autocomplete
  const classOptions = ["Pravesham", "Pravalam", "Pradhanam", "Pravardham", "Praaveenyam"];
  const [checkinClass, setCheckinClass] = useState(classOptions[0]);
  const [checkinQuery, setCheckinQuery] = useState("");
  const [checkoutClass, setCheckoutClassState] = useState(classOptions[0]);
  const [checkoutQuery, setCheckoutQuery] = useState("");

  async function handleUnlock() {
    setLoading(true);
    try {
      const loaded = await loadDB(passphrase);
      setDb(loaded);
      setUnlocked(true);
    } catch (e) {
      alert(e.message || String(e));
      setUnlocked(false);
    } finally {
      setLoading(false);
    }
  }

  // Admin: Add student (compress photos before saving)
  async function handleAddStudent(e) {
    e.preventDefault();
    try {
      // Ensure required photo keys exist (they may already be dataURLs)
      const photos = { ...form.photos };
      // If any of the photos are File objects (they aren't in our current code), handle here.
      // In this UI we already convert to data URLs on upload, so assume strings.

  const id = generateStudentId(form.classSection || 'Pravesham', new Date().getFullYear(), db.students);
  const newStudent: Student = { ...form, id, photos } as Student;
      const newDb = { ...db, students: [newStudent, ...db.students] };
      setDb(newDb);
      await saveDB(newDb, passphrase);
      setForm(emptyForm);
      alert("Student enrolled — saved securely.");
    } catch (err) {
      alert('Failed to save student: ' + (err.message || err));
    }
  }

  function findMatches(term) {
    if (!term) return db.students.slice(0, 50);
    const t = term.trim().toLowerCase();
    return db.students.filter((s) => {
      return (
        (s.name || '').toLowerCase().includes(t) ||
        (s.id || '').toLowerCase().includes(t) ||
        (s.classSection || '').toLowerCase().includes(t)
      );
    });
  }

  async function handleCheckIn(student: Student) {
    try {
      const log = { id: uid("L"), studentId: student.id, studentName: student.name, classSection: student.classSection, type: "checkin", timestamp: nowISO() };
      const newDb = { ...db, logs: [log, ...db.logs] };
      setDb(newDb);
      await saveDB(newDb, passphrase);
      alert(`${student.name} checked in at ${humanTime(log.timestamp)}`);
    } catch (e) {
      alert('Failed to record check-in: ' + (e.message || e));
    }
  }

  async function handleCheckOut(student, guardianKey) {
    if (!guardianKey) return alert("Please select the guardian/person collecting the child.");
    try {
      const guardianName = guardianKey === "father" ? student.fatherName : guardianKey === "mother" ? student.motherName : guardianKey === "guardian1" ? student.guardian1Name : student.guardian2Name;
      const log = { id: uid("L"), studentId: student.id, studentName: student.name, classSection: student.classSection, type: "checkout", timestamp: nowISO(), collectedBy: guardianName || guardianKey };
      const newDb = { ...db, logs: [log, ...db.logs] };
      setDb(newDb);
      await saveDB(newDb, passphrase);
      alert(`${student.name} checked out at ${humanTime(log.timestamp)} — collected by ${log.collectedBy}`);
    } catch (e) {
      alert('Failed to record check-out: ' + (e.message || e));
    }
  }

  // Delete a single student by id (with confirmation)
  async function handleDeleteStudent(id: string) {
    if (!confirm('Delete this student? This action cannot be undone.')) return;
    try {
      const newStudents = db.students.filter((s) => s.id !== id);
      const newDb = { ...db, students: newStudents };
      setDb(newDb);
      if (selectedStudent && selectedStudent.id === id) setSelectedStudent(null);
      await saveDB(newDb, passphrase);
      alert('Student deleted.');
    } catch (err) {
      alert('Failed to delete student: ' + (err instanceof Error ? err.message : String(err)));
    }
  }

  // Clear all enrollments (students) with confirmation. Keeps logs intact.
  async function handleClearAllEnrollments() {
    if (!confirm('Clear ALL enrollments? This will remove every student record but will keep check-in/out logs. This cannot be undone.')) return;
    try {
      const newDb = { ...db, students: [] };
      setDb(newDb);
      setSelectedStudent(null);
      await saveDB(newDb, passphrase);
      alert('All enrollments cleared.');
    } catch (err) {
      alert('Failed to clear enrollments: ' + (err instanceof Error ? err.message : String(err)));
    }
  }

  // When a photo input changes, compress and store dataURL in the form
  async function handlePhotoChange(e, key) {
    const f = e.target.files[0];
    if (!f) return;
    if (!f.type.startsWith("image/")) return alert("Please upload an image file.");
    try {
      const dataUrl = await fileToDataUrl(f, 900, 0.75);
      setForm((s) => ({ ...s, photos: { ...s.photos, [key]: dataUrl } }));
    } catch (err) {
      alert('Image processing failed: ' + (err.message || err));
    }
  }

  function selectStudentById(id: string) {
    const s = db.students.find((x) => x.id === id);
    setSelectedStudent(s || null);
    // reset checkout guardian selection when opening a new record
    setCheckoutGuardian("");
  }

  function studentsForClass(cls: string) {
    if (!cls) return [] as Student[];
    return db.students.filter((s) => (s.classSection || "") === cls);
  }

  function handleSelectFromQuery(query: string) {
    if (!query) return;
    // If user typed a value like "Name | ID", try match by id first
  const byIdExact = db.students.find((s) => s.id === query);
    if (byIdExact) return selectStudentById(byIdExact.id);
    // Try to parse pattern 'Name | ID'
    const parts = query.split('|').map(p => p.trim());
    if (parts.length === 2) {
      const maybeId = parts[1];
      const byId = db.students.find((s) => s.id === maybeId);
      if (byId) return selectStudentById(byId.id);
    }
    // Fallback: match by name (exact or contains)
  const byNameExact = db.students.find((s) => s.name && s.name.toLowerCase() === query.toLowerCase());
    if (byNameExact) return selectStudentById(byNameExact.id);
    const byNamePartial = db.students.find((s) => s.name && s.name.toLowerCase().includes(query.toLowerCase()));
    if (byNamePartial) return selectStudentById(byNamePartial.id);
    // nothing matched: clear selection
    setSelectedStudent(null);
  }

  const ClassDropdown = ({ value, onChange }) => (
    <select value={value} onChange={(e) => onChange(e.target.value)} required className="w-full p-3 rounded border focus:outline-none">
      <option>Pravesham</option>
      <option>Pravalam</option>
      <option>Pradhanam</option>
      <option>Pravardham</option>
      <option>Praaveenyam</option>
    </select>
  );

  function StudentCard({ student, onCheckIn, onSelect }: { student: Student; onCheckIn: (s: Student) => void; onSelect: (id: string) => void }) {
    return (
      <div className="flex gap-3 items-center p-3 rounded-lg border shadow-sm bg-white">
          <img src={student.photos?.student || ""} alt="student" className="w-20 h-20 object-cover rounded-md border" />
        <div className="flex-1">
          <div className="text-lg font-semibold">{student.name}</div>
          <div className="text-sm">{student.classSection} • {student.id}</div>
          <div className="mt-2 flex gap-2">
            <button onClick={() => onCheckIn(student)} className="flex-1 py-2 rounded-lg text-white font-semibold bg-emerald-600 touch-manipulation">Check In</button>
            <button onClick={() => onSelect(student.id)} className="py-2 px-3 rounded-lg border">Verify</button>
          </div>
        </div>
      </div>
    );
  }

  // Very small nav / unlock screen
  if (!unlocked) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-sky-50 to-white p-4 safe-area-inset">
        <div className="max-w-xl mx-auto">
          <h1 className="text-2xl font-bold mb-2">Triangle Telugu Badi — Attendance (iOS)</h1>
          <p className="mb-4 text-sm">Enter a session passphrase to unlock the encrypted attendance database. This passphrase will be used to encrypt/decrypt the stored records. It is NOT saved.</p>
          <input type="password" placeholder="Enter passphrase" value={passphrase} onChange={(e) => setPassphrase(e.target.value)} className="w-full p-3 rounded border mb-3" />
          <div className="flex gap-2">
            <button onClick={handleUnlock} className="flex-1 py-3 rounded-lg bg-blue-600 text-white font-semibold">Unlock</button>
            <button onClick={async () => {
              const v = prompt('Create a passphrase for initial encryption (remember it well):');
              if (!v) return alert('Passphrase is required to create a new encrypted database.');
              try {
                setPassphrase(v);
                // initialize empty DB and persist it
                const initial: AppDB = { students: [], logs: [] };
                await saveDB(initial, v);
                setDb(initial);
                setUnlocked(true);
                alert('New encrypted database created and unlocked. Remember your passphrase to access it later.');
              } catch (err) {
                alert('Failed to create initial database: ' + (err instanceof Error ? err.message : String(err)));
              }
            }} className="py-3 px-4 rounded-lg border">Create</button>
          </div>
          <div className="mt-4 text-xs text-gray-600">
            <strong>Security note:</strong> If you lose the passphrase, data cannot be recovered. For multi-device use, integrate a secure server-side sync.
            <br />This version stores data in <strong>IndexedDB</strong> (preferred) and compresses images to reduce storage use.
          </div>
          {loading && <div className="mt-3">Loading…</div>}
        </div>
      </div>
    );
  }

  // Main unlocked UI
  return (
    <div className="min-h-screen bg-gradient-to-b from-sky-50 to-white p-4 safe-area-inset">
      <div className="max-w-xl mx-auto">
        <header className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold">Triangle Telugu Badi</h1>
            <div className="text-sm text-gray-600">Sunday Attendance — Check-In / Check-Out</div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setView("checkin")} className={`px-3 py-2 rounded ${view==='checkin'?'bg-blue-600 text-white':'border'}`}>Check In</button>
            <button onClick={() => setView("checkout")} className={`px-3 py-2 rounded ${view==='checkout'?'bg-blue-600 text-white':'border'}`}>Check Out</button>
            <button onClick={() => setView("admin")} className={`px-3 py-2 rounded ${view==='admin'?'bg-blue-600 text-white':'border'}`}>Enrollment</button>
          </div>
        </header>

        {view === "admin" && (
          <main className="space-y-4">
            <form onSubmit={handleAddStudent} className="space-y-3 bg-white p-4 rounded-lg shadow-sm">
              <h2 className="text-lg font-semibold">Enroll New Student</h2>
              <label className="block text-sm">Student Name <input required className="w-full p-3 rounded border mt-1" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
              <label className="block text-sm">Class Section <div className="mt-1"><ClassDropdown value={form.classSection} onChange={(v) => setForm({ ...form, classSection: v })} /></div></label>
              
              <div className="grid grid-cols-2 gap-2">
                <label className="block text-sm">Date of Birth 
                  <input 
                    type="date" 
                    required 
                    className="w-full p-3 rounded border mt-1" 
                    value={form.dateOfBirth} 
                    onChange={(e) => setForm({ ...form, dateOfBirth: e.target.value })} 
                  />
                </label>
                <label className="block text-sm">Age 
                  <input 
                    type="text" 
                    readOnly 
                    className="w-full p-3 rounded border mt-1 bg-gray-100" 
                    value={form.dateOfBirth ? `${calculateAge(form.dateOfBirth)} years` : ""} 
                    placeholder="Auto-calculated"
                  />
                </label>
              </div>
              <label className="block text-sm">Father's Name <input className="w-full p-3 rounded border mt-1" value={form.fatherName} onChange={(e) => setForm({ ...form, fatherName: e.target.value })} /></label>
              <label className="block text-sm">Mother's Name <input className="w-full p-3 rounded border mt-1" value={form.motherName} onChange={(e) => setForm({ ...form, motherName: e.target.value })} /></label>
              <label className="block text-sm">Guardian-1 Name <input className="w-full p-3 rounded border mt-1" value={form.guardian1Name} onChange={(e) => setForm({ ...form, guardian1Name: e.target.value })} /></label>
              <label className="block text-sm">Guardian-2 Name <input className="w-full p-3 rounded border mt-1" value={form.guardian2Name} onChange={(e) => setForm({ ...form, guardian2Name: e.target.value })} /></label>
              <label className="block text-sm">Contact <input className="w-full p-3 rounded border mt-1" value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value })} /></label>
              <label className="block text-sm">Email <input type="email" className="w-full p-3 rounded border mt-1" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
              <label className="block text-sm">Address <textarea className="w-full p-3 rounded border mt-1" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })}></textarea></label>
              
              <div className="space-y-2">
                <div className="text-sm font-semibold">Upload Passport Photos (recommended)</div>
                <div className="grid grid-cols-2 gap-2">
                  <label className="block text-xs text-center py-2 border rounded">
                    Student Photo
                    <input accept="image/*" onChange={(e) => handlePhotoChange(e, "student")} className="mt-2 block w-full" type="file" />
                    {form.photos.student && <img src={form.photos.student} alt="stu" className="mx-auto mt-2 w-24 h-24 object-cover rounded" />}
                  </label>
                  <label className="block text-xs text-center py-2 border rounded">
                    Father's Photo
                    <input accept="image/*" onChange={(e) => handlePhotoChange(e, "father")} className="mt-2 block w-full" type="file" />
                    {form.photos.father && <img src={form.photos.father} alt="father" className="mx-auto mt-2 w-24 h-24 object-cover rounded" />}
                  </label>
                  <label className="block text-xs text-center py-2 border rounded">
                    Mother's Photo
                    <input accept="image/*" onChange={(e) => handlePhotoChange(e, "mother")} className="mt-2 block w-full" type="file" />
                    {form.photos.mother && <img src={form.photos.mother} alt="mother" className="mx-auto mt-2 w-24 h-24 object-cover rounded" />}
                  </label>
                  <label className="block text-xs text-center py-2 border rounded">
                    Guardian-1 Photo
                    <input accept="image/*" onChange={(e) => handlePhotoChange(e, "guardian1")} className="mt-2 block w-full" type="file" />
                    {form.photos.guardian1 && <img src={form.photos.guardian1} alt="g1" className="mx-auto mt-2 w-24 h-24 object-cover rounded" />}
                  </label>
                  <label className="block text-xs text-center py-2 border rounded col-span-2">
                    Guardian-2 Photo
                    <input accept="image/*" onChange={(e) => handlePhotoChange(e, "guardian2")} className="mt-2 block w-full" type="file" />
                    {form.photos.guardian2 && <img src={form.photos.guardian2} alt="g2" className="mx-auto mt-2 w-24 h-24 object-cover rounded" />}
                  </label>
                </div>
                <div className="text-xs text-gray-500">Photos are automatically resized & compressed to reduce storage use.</div>
              </div>

              <div className="flex gap-2">
                <button type="submit" className="flex-1 py-3 rounded-lg bg-emerald-600 text-white font-semibold">Save Student</button>
                <button type="button" onClick={() => setForm(emptyForm)} className="py-3 px-4 rounded-lg border">Reset</button>
              </div>
            </form>

          <section className="bg-white p-3 rounded shadow-sm">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">Enrolled Students</h3>
              <div>
                <button onClick={handleClearAllEnrollments} disabled={db.students.length===0} className="px-3 py-1 rounded border text-sm">Clear All Enrollments</button>
              </div>
            </div>
            <div className="mt-2 space-y-2">
              {db.students.length === 0 && <div className="text-sm text-gray-500">No students yet.</div>}
              {db.students.map((s) => (
                <div key={s.id} className="flex items-center gap-3 p-2 border rounded">
                  <img src={s.photos.student || ""} alt="stu" className="w-12 h-12 object-cover rounded" />
                  <div className="flex-1">
                    <div className="font-medium">{s.name}</div>
                    <div className="text-xs text-gray-600">
                      {s.classSection} • {s.id}
                      {s.dateOfBirth && ` • Age: ${calculateAge(s.dateOfBirth)}`}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => { navigator.clipboard?.writeText(s.id); alert('Student ID copied'); }} className="px-3 py-1 rounded border">Copy ID</button>
                    <button onClick={() => handleDeleteStudent(s.id)} className="px-3 py-1 rounded border text-red-600">Delete</button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </main>
      )}

      {view === "checkin" && (
        <main className="space-y-4">
          <div className="bg-white p-3 rounded shadow-sm">
            <label className="block text-sm">Select Class</label>
            <select value={checkinClass} onChange={(e) => { setCheckinClass(e.target.value); setCheckinQuery(''); setSelectedStudent(null); }} className="w-full p-3 rounded border mt-2">
              {classOptions.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>

            <label className="block text-sm mt-3">Student (type name or pick)</label>
            <input
              list="checkin-students"
              value={checkinQuery}
              onChange={(e) => {
                const v = e.target.value;
                setCheckinQuery(v);
                // if the value exactly matches an option, select immediately
                const match = studentsForClass(checkinClass).find(s => `${s.name} | ${s.id}` === v || s.id === v || s.name === v);
                if (match) handleSelectFromQuery(v);
              }}
              onBlur={() => handleSelectFromQuery(checkinQuery)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleSelectFromQuery(checkinQuery); } }}
              placeholder="Type name or select a student"
              className="w-full p-3 rounded border mt-2"
            />
            <datalist id="checkin-students">
              {studentsForClass(checkinClass).map((s) => (
                <option key={s.id} value={`${s.name} | ${s.id}`} />
              ))}
            </datalist>
          </div>

          <div className="space-y-2">
              {findMatches(searchTerm).slice(0, 50).map((s) => (
                <StudentCard key={s.id} student={s} onCheckIn={handleCheckIn} onSelect={(id: string) => selectStudentById(id)} />
              ))}
            {findMatches(searchTerm).length === 0 && <div className="text-sm text-gray-500">No matches.</div>}
          </div>

          {selectedStudent && (
            <section className="bg-white p-3 rounded shadow-sm">
              <div className="flex gap-3 items-center">
                  <img src={selectedStudent?.photos?.student || ""} alt="stu" className="w-28 h-28 object-cover rounded border" />
                <div>
                  <div className="text-lg font-semibold">{selectedStudent.name}</div>
                  <div className="text-sm text-gray-600">{selectedStudent.classSection} • {selectedStudent.id}</div>
                  <div className="mt-2">
                    <button onClick={() => handleCheckIn(selectedStudent)} className="py-3 px-6 rounded-lg bg-emerald-600 text-white font-semibold">Confirm Check In</button>
                  </div>
                </div>
              </div>
            </section>
          )}
        </main>
      )}

      {view === "checkout" && (
        <main className="space-y-4">
          <div className="bg-white p-3 rounded shadow-sm">
            <label className="block text-sm">Select Class</label>
            <select value={checkoutClass} onChange={(e) => { setCheckoutClassState(e.target.value); setCheckoutQuery(''); setSelectedStudent(null); }} className="w-full p-3 rounded border mt-2">
              {classOptions.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>

            <label className="block text-sm mt-3">Student (type name or pick)</label>
            <input
              list="checkout-students"
              value={checkoutQuery}
              onChange={(e) => {
                const v = e.target.value;
                setCheckoutQuery(v);
                const match = studentsForClass(checkoutClass).find(s => `${s.name} | ${s.id}` === v || s.id === v || s.name === v);
                if (match) handleSelectFromQuery(v);
              }}
              onBlur={() => handleSelectFromQuery(checkoutQuery)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleSelectFromQuery(checkoutQuery); } }}
              placeholder="Type name or select a student"
              className="w-full p-3 rounded border mt-2"
            />
            <datalist id="checkout-students">
              {studentsForClass(checkoutClass).map((s) => (
                <option key={s.id} value={`${s.name} | ${s.id}`} />
              ))}
            </datalist>
          </div>

          <div className="space-y-2">
            {findMatches(searchTerm).slice(0, 50).map((s) => (
              <div key={s.id} className="p-2 bg-white rounded border flex items-center gap-3">
                <img src={s.photos?.student || ""} alt="stu" className="w-16 h-16 object-cover rounded" />
                <div className="flex-1">
                  <div className="font-medium">{s.name}</div>
                  <div className="text-xs text-gray-600">{s.classSection} • {s.id}</div>
                </div>
                <button onClick={() => selectStudentById(s.id)} className="px-3 py-2 rounded border">Open</button>
              </div>
            ))}
          </div>

          {selectedStudent && (
            <section className="bg-white p-3 rounded shadow-sm">
              <div className="text-lg font-semibold mb-2">Verify & Check Out</div>
              <div className="grid grid-cols-1 gap-3">
                <div className="flex gap-3 items-center">
                  <div className="text-xs text-gray-600">Student</div>
                  <img src={selectedStudent?.photos?.student || ""} alt="stu" className="w-24 h-24 object-cover rounded border" />
                  <div className="ml-3">
                    <div className="font-medium">{selectedStudent.name}</div>
                    <div className="text-sm text-gray-500">{selectedStudent.classSection}</div>
                  </div>
                </div>

                <div className="text-sm font-semibold">Authorized Collectors (photos shown simultaneously)</div>
                <div className="grid grid-cols-2 gap-2">
                  <label className="p-2 border rounded flex items-center gap-2">
                    <input type="radio" name="collector" onChange={() => setCheckoutGuardian('father')} />
                    <img src={selectedStudent?.photos?.father || ''} alt="father" className="w-16 h-16 object-cover rounded" />
                    <div>
                      <div className="font-medium">{selectedStudent.fatherName || 'Father'}</div>
                      <div className="text-xs text-gray-500">{selectedStudent.contact}</div>
                    </div>
                  </label>
                  <label className="p-2 border rounded flex items-center gap-2">
                    <input type="radio" name="collector" onChange={() => setCheckoutGuardian('mother')} />
                    <img src={selectedStudent?.photos?.mother || ''} alt="mother" className="w-16 h-16 object-cover rounded" />
                    <div>
                      <div className="font-medium">{selectedStudent.motherName || 'Mother'}</div>
                      <div className="text-xs text-gray-500">{selectedStudent.contact}</div>
                    </div>
                  </label>
                  <label className="p-2 border rounded flex items-center gap-2">
                    <input type="radio" name="collector" onChange={() => setCheckoutGuardian('guardian1')} />
                    <img src={selectedStudent?.photos?.guardian1 || ''} alt="g1" className="w-16 h-16 object-cover rounded" />
                    <div>
                      <div className="font-medium">{selectedStudent.guardian1Name || 'Guardian 1'}</div>
                      <div className="text-xs text-gray-500">{selectedStudent.contact}</div>
                    </div>
                  </label>
                  <label className="p-2 border rounded flex items-center gap-2">
                    <input type="radio" name="collector" onChange={() => setCheckoutGuardian('guardian2')} />
                    <img src={selectedStudent?.photos?.guardian2 || ''} alt="g2" className="w-16 h-16 object-cover rounded" />
                    <div>
                      <div className="font-medium">{selectedStudent.guardian2Name || 'Guardian 2'}</div>
                      <div className="text-xs text-gray-500">{selectedStudent.contact}</div>
                    </div>
                  </label>
                </div>

                <div className="mt-3">
                  <button onClick={() => handleCheckOut(selectedStudent, checkoutGuardian)} className="w-full py-3 rounded-lg bg-red-600 text-white font-semibold">Confirm Check Out</button>
                </div>
              </div>
            </section>
          )}

          <section className="bg-white p-3 rounded shadow-sm">
            <h3 className="font-semibold">Recent Logs</h3>
            <div className="mt-2 space-y-2 text-sm">
              {db.logs.slice(0, 20).map((l) => (
                <div key={l.id} className="flex justify-between">
                  <div>{l.studentName} — {l.type === 'checkin' ? 'In' : 'Out'} • {humanTime(l.timestamp)}</div>
                  <div className="text-gray-500">{l.collectedBy || ''}</div>
                </div>
              ))}
              {db.logs.length === 0 && <div className="text-gray-500">No logs yet.</div>}
            </div>
          </section>
        </main>
      )}

      <footer className="mt-6 text-xs text-gray-500 text-center">
        Built for iPhone & iPad — large tap targets, high contrast, thumb-friendly layout. Data encrypted locally per session (now stored in IndexedDB).
      </footer>
    </div>
  </div>
  );
}
