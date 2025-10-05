import React, { useState, useEffect } from "react";
import { getApps, initializeApp } from "firebase/app";
import { getFirestore, doc, getDoc, setDoc } from "firebase/firestore";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import { FIREBASE_CONFIG } from "./cloud-config";

// --- Check Student Page Component (with autocomplete) ---
function CheckStudentPage({ db, logs }: { db: AppDB, logs: any[] }) {
  const [search, setSearch] = React.useState("");
  const [suggestions, setSuggestions] = React.useState<Student[]>([]);
  const [selected, setSelected] = React.useState<Student | null>(null);
  const [studentLogs, setStudentLogs] = React.useState<any[]>([]);
  React.useEffect(() => {
      if (search.trim() === "") {
        setSuggestions([]);
        return;
      }
      const studentsArr = Array.isArray(db.students) ? db.students : [];
      const s = studentsArr.filter((stu: Student) =>
        stu.name.toLowerCase().includes(search.toLowerCase()) ||
        stu.id.toLowerCase().includes(search.toLowerCase())
      );
      setSuggestions(s.slice(0, 10));
    }, [search, db.students]);
  const handleSelect = (stu: Student) => {
  setSelected(stu);
  setSuggestions([]);
  setSearch(stu.name);
  const logsArr = Array.isArray(logs) ? logs : [];
  const logsForStudent = logsArr.filter(l => l.studentId === stu.id).slice(-10).reverse();
  setStudentLogs(logsForStudent);
  };
  return (
    <div>
      <h3 className="font-semibold mb-2">Check on Student</h3>
      <div className="mb-4 relative">
        <input
          type="text"
          value={search}
          onChange={e => { setSearch(e.target.value); setSelected(null); setStudentLogs([]); }}
          placeholder="Enter student name or ID..."
          className="p-2 border rounded w-64"
        />
        {suggestions.length > 0 && (
          <div className="absolute bg-white border rounded shadow w-64 z-10">
            {suggestions.map(stu => (
              <div
                key={stu.id}
                className="p-2 hover:bg-blue-100 cursor-pointer"
                onClick={() => handleSelect(stu)}
              >
                {stu.name} <span className="text-xs text-gray-500">({stu.id})</span>
              </div>
            ))}
          </div>
        )}
      </div>
      {selected ? (
        <div className="mb-6 p-4 border rounded bg-white">
          <div className="font-semibold text-lg mb-2">{selected.name}</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
            <div><span className="font-semibold">Student ID:</span> {selected.id}</div>
            <div><span className="font-semibold">Father Name:</span> {selected.fatherName || '-'}</div>
            <div><span className="font-semibold">Mother Name:</span> {selected.motherName || '-'}</div>
            <div><span className="font-semibold">Guardian Name:</span> {selected.guardian1Name || '-'}</div>
            <div><span className="font-semibold">Date of Birth:</span> {selected.dateOfBirth || '-'}</div>
            <div><span className="font-semibold">Contact:</span> {selected.contact || '-'}</div>
            <div><span className="font-semibold">Email:</span> {selected.email || '-'}</div>
            <div><span className="font-semibold">Address:</span> {selected.address || '-'}</div>
          </div>
        </div>
      ) : (
        <div className="mb-6 text-gray-500">Type student name or ID and select from the list.</div>
      )}
      {selected && (
        <div>
          <h3 className="font-semibold mb-2">Last 10 Check-in/Check-out Logs</h3>
          <div className="grid gap-2">
            {studentLogs.length === 0 && <div className="text-gray-500">No logs found.</div>}
            {studentLogs.map((log: any) => (
              <div key={log.id} className="p-2 border rounded bg-white text-sm">
                <span className="font-semibold">{log.type === 'checkin' ? '📥 Check In' : '📤 Check Out'}</span>
                {log.guardian && <span className="ml-2">Guardian: {log.guardian}</span>}
                <span className="ml-2 text-gray-500">{new Date(log.timestamp).toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// --- UpdateStudentPage Component ---
function UpdateStudentPage({ db, setDb, classOptions }: { db: AppDB, setDb: any, classOptions: string[] }) {
  const [search, setSearch] = useState("");
  const [suggestions, setSuggestions] = useState<Student[]>([]);
  const [selected, setSelected] = useState<Student | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [editForm, setEditForm] = useState<any>({});
  const [message, setMessage] = useState("");
  // classOptions is passed for props typing, not used directly in this component
  useEffect(() => {
    if (search.trim() === "") {
      setSuggestions([]);
      return;
    }
    const studentsArr = Array.isArray(db.students) ? db.students : [];
    const s = studentsArr.filter((stu: Student) =>
      stu.name.toLowerCase().includes(search.toLowerCase()) ||
      stu.id.toLowerCase().includes(search.toLowerCase())
    );
    setSuggestions(s.slice(0, 10));
  }, [search, db.students]);
  const handleSelect = (stu: Student) => {
    setSelected(stu);
    setEditMode(false);
    setEditForm({ ...stu });
    setMessage("");
    setSuggestions([]);
    setSearch(stu.name);
  };
  const handleDelete = () => {
    if (!selected) return;
    setDb((prev: AppDB) => ({
      ...prev,
      students: (Array.isArray(prev.students) ? prev.students : []).filter((s: Student) => s.id !== selected.id)
    }));
    setMessage(`Student ${selected.name}, ${selected.id} deleted successfully.`);
    setSelected(null);
    setEditMode(false);
    setEditForm({});
  };
  const handleEdit = () => {
    setEditMode(true);
    setEditForm({ ...selected });
    setMessage("");
  };
  const handleSave = () => {
    if (!selected) return;
    setDb((prev: AppDB) => ({
      ...prev,
      students: (Array.isArray(prev.students) ? prev.students : []).map((s: Student) =>
        s.id === selected.id ? { ...s, ...editForm, id: selected.id, name: selected.name } : s
      )
    }));
    setMessage("Student updated successfully.");
    setEditMode(false);
    setSelected({ ...selected, ...editForm });
  };
  return (
    <div className="mb-8">
      <h3 className="font-semibold mb-2">Update or Delete Student</h3>
      <input
        type="text"
        value={search}
        onChange={e => { setSearch(e.target.value); setSelected(null); setEditMode(false); setMessage(""); }}
        placeholder="Search by name or ID..."
        className="p-2 border rounded w-64 mb-2"
      />
      {suggestions.length > 0 && (
        <div className="bg-white border rounded shadow w-64 z-10">
          {suggestions.map(stu => (
            <div
              key={stu.id}
              className="p-2 hover:bg-blue-100 cursor-pointer"
              onClick={() => handleSelect(stu)}
            >
              {stu.name} <span className="text-xs text-gray-500">({stu.id})</span>
            </div>
          ))}
        </div>
      )}
      {selected && !editMode && (
        <div className="p-4 border rounded bg-white mt-4">
          <div className="font-semibold text-lg mb-2">{selected.name}</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
            <div><span className="font-semibold">Student ID:</span> {selected.id}</div>
            <div><span className="font-semibold">Father Name:</span> {selected.fatherName || '-'}</div>
            <div><span className="font-semibold">Mother Name:</span> {selected.motherName || '-'}</div>
            <div><span className="font-semibold">Guardian Name:</span> {selected.guardian1Name || '-'}</div>
            <div><span className="font-semibold">Date of Birth:</span> {selected.dateOfBirth || '-'}</div>
            <div><span className="font-semibold">Contact:</span> {selected.contact || '-'}</div>
            <div><span className="font-semibold">Email:</span> {selected.email || '-'}</div>
            <div><span className="font-semibold">Address:</span> {selected.address || '-'}</div>
          </div>
          <div className="mt-4 flex gap-2">
            <button className="px-4 py-2 bg-yellow-500 text-white rounded" onClick={handleEdit}>Edit</button>
            <button className="px-4 py-2 bg-red-600 text-white rounded" onClick={handleDelete}>Delete</button>
          </div>
          {message && <div className="mt-2 text-green-700">{message}</div>}
        </div>
      )}
      {selected && editMode && (
        <div className="p-4 border rounded bg-white mt-4">
          <div className="font-semibold text-lg mb-2">{selected.name}</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
            {/* Only allow editing fields except name and id */}
            <input
              className="p-2 border rounded"
              placeholder="Father Name"
              value={editForm.fatherName || ""}
              onChange={e => setEditForm((f: any) => ({ ...f, fatherName: e.target.value }))}
            />
            <input
              className="p-2 border rounded"
              placeholder="Mother Name"
              value={editForm.motherName || ""}
              onChange={e => setEditForm((f: any) => ({ ...f, motherName: e.target.value }))}
            />
            <input
              className="p-2 border rounded"
              placeholder="Guardian Name"
              value={editForm.guardian1Name || ""}
              onChange={e => setEditForm((f: any) => ({ ...f, guardian1Name: e.target.value }))}
            />
            <input
              className="p-2 border rounded"
              placeholder="Date of Birth"
              value={editForm.dateOfBirth || ""}
              onChange={e => setEditForm((f: any) => ({ ...f, dateOfBirth: e.target.value }))}
            />
            <input
              className="p-2 border rounded"
              placeholder="Contact"
              value={editForm.contact || ""}
              onChange={e => setEditForm((f: any) => ({ ...f, contact: e.target.value }))}
            />
            <input
              className="p-2 border rounded"
              placeholder="Email"
              value={editForm.email || ""}
              onChange={e => setEditForm((f: any) => ({ ...f, email: e.target.value }))}
            />
            <input
              className="p-2 border rounded md:col-span-2"
              placeholder="Address"
              value={editForm.address || ""}
              onChange={e => setEditForm((f: any) => ({ ...f, address: e.target.value }))}
            />
          </div>
          <div className="mt-4 flex gap-2">
            <button className="px-4 py-2 bg-blue-600 text-white rounded" onClick={handleSave}>Save</button>
            <button className="px-4 py-2 bg-gray-400 text-white rounded" onClick={() => setEditMode(false)}>Cancel</button>
          </div>
          {message && <div className="mt-2 text-green-700">{message}</div>}
        </div>
      )}
    </div>
  );
}

// --- Types ---
type Student = {
  id: string;
  name: string;
  classSection: string;
  dateOfBirth?: string;
  fatherName?: string;
  motherName?: string;
  guardian1Name?: string;
  contact?: string;
  email?: string;
  address?: string;
};
type AppDB = { students: Student[]; logs: any[] };

// Helper to calculate age from date of birth
function calculateAge(dateOfBirth: string) {
  if (!dateOfBirth) return "-";
  const today = new Date();
  const dob = new Date(dateOfBirth);
  let age = today.getFullYear() - dob.getFullYear();
  const m = today.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) {
    age--;
  }
  return age;
}

// ---------------------------
// Main React App
// ---------------------------

export default function App() {
  const [checkoutStatus, setCheckoutStatus] = useState<{[id: string]: boolean}>({});
  const [checkoutMessage, setCheckoutMessage] = useState<string>("");
  const [checkedIn, setCheckedIn] = useState<{[id: string]: boolean}>({});
  const [checkedOut, setCheckedOut] = useState<{[id: string]: boolean}>({});
  // ...existing state...
  const [adminTab, setAdminTab] = useState<'enroll' | 'updatestudent' | 'checkstudent'>('enroll');
  const [db, setDb] = useState<AppDB>({ students: [], logs: [] });
  // Firestore setup
  const TEST_UID = 'testuser_shared';
  const [firestoreReady, setFirestoreReady] = useState(false);
  let firestore: any = null;
  function getFirestoreClient() {
    if (!getApps().length) initializeApp(FIREBASE_CONFIG);
    return getFirestore();
  }
  // View: 'checkin', 'checkout', 'admin', 'enroll', 'checkstudent'
  const [view, setView] = useState<string>("checkin");
  // Removed unused checkoutGuardian state
  // Enrollment form state
  const [enrollForm, setEnrollForm] = useState({
    studentFullName: "",
    classSection: "Pravesham",
    dateOfBirth: "",
    fatherFullName: "",
    motherFullName: "",
    guardianName: "",
    contact: "",
    altContact: "",
    email: "",
    address: "",
  });
  const [enrollError, setEnrollError] = useState<string>("");
  const [enrollSuccess, setEnrollSuccess] = useState<boolean>(false);
  // Class options for selection
  const classOptions = ["Pravesham", "Pravalam", "Pradhanam", "Pravardham", "Praaveenyam"];
  const [checkinClass, setCheckinClass] = useState(classOptions[0]);
  const [checkinQuery, setCheckinQuery] = useState("");
  const [checkoutClass, setCheckoutClassState] = useState(classOptions[0]);
  const [checkoutQuery, setCheckoutQuery] = useState("");

  // Track checked-in and checked-out students
  // Removed unused checkedIn and checkedOut state
  const [selectedGuardian, setSelectedGuardian] = useState<{[id: string]: string}>({});

  // For Check on Student view
  // Removed unused studentSearch, studentResult, studentLogs state

  // Bulk enrollment state and handlers
  const [bulkFile, setBulkFile] = useState<File|null>(null);
  const [bulkUploadMessage, setBulkUploadMessage] = useState<string>("");
  const [bulkUploadError, setBulkUploadError] = useState<string>("");

  function handleBulkFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    setBulkUploadMessage("");
    setBulkUploadError("");
    if (e.target.files && e.target.files[0]) {
      setBulkFile(e.target.files[0]);
    } else {
      setBulkFile(null);
    }
  }

  async function handleBulkUpload(e: React.MouseEvent<HTMLButtonElement>) {
    e.preventDefault();
    setBulkUploadMessage("");
    setBulkUploadError("");
    if (!bulkFile) return;
    try {
      let students: any[] = [];
      if (bulkFile.name.endsWith('.csv')) {
        const text = await bulkFile.text();
        const result = Papa.parse(text, { header: true });
        students = result.data;
      } else if (bulkFile.name.endsWith('.xlsx') || bulkFile.name.endsWith('.xls')) {
        const data = await bulkFile.arrayBuffer();
        const workbook = XLSX.read(data, { type: 'array' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        students = XLSX.utils.sheet_to_json(sheet);
      } else {
        setBulkUploadError('Unsupported file type. Please upload a CSV or Excel file.');
        return;
      }
      // Required fields: student name, date of birth, class allocated, father name, mother name, guardian name, contact number, email address, address
      let added = 0, skipped = 0;
  // required fields list removed (was unused)
      const newStudents = students.map((row: any) => ({
        name: row['student name'] || row['Student Name'] || row['Name'] || '',
        dateOfBirth: row['date of birth'] || row['Date of Birth'] || '',
        classSection: row['class allocated'] || row['Class Allocated'] || '',
        fatherName: row['father name'] || row['Father Name'] || '',
        motherName: row['mother name'] || row['Mother Name'] || '',
        guardian1Name: row['guardian name'] || row['Guardian Name'] || '',
        contact: row['contact number'] || row['Contact Number'] || '',
        email: row['email address'] || row['Email Address'] || '',
        address: row['address'] || row['Address'] || '',
      }));
      const filtered = newStudents.filter(s => s.name && s.dateOfBirth && s.classSection);
      setDb(prev => {
        let studentsArr = [...prev.students];
        filtered.forEach(s => {
          const exists = studentsArr.some(stu =>
            stu.name.trim().toUpperCase() === s.name.trim().toUpperCase() &&
            stu.dateOfBirth === s.dateOfBirth &&
            (stu.contact?.trim().toUpperCase() === (s.contact || '').trim().toUpperCase())
          );
          if (!exists) {
            studentsArr.push({
              id: `TATB-${Date.now()}-${Math.floor(Math.random()*10000)}`,
              ...s,
            });
            added++;
          } else {
            skipped++;
          }
        });
        return { ...prev, students: studentsArr };
      });
      setBulkUploadMessage(`Bulk upload complete. Added: ${added}, Skipped (duplicates): ${skipped}`);
      setBulkFile(null);
    } catch (err: any) {
      setBulkUploadError('Failed to process file: ' + (err?.message || err));
    }
  }

  // Load initial data from Firestore
  useEffect(() => {
    const loadFromFirestore = async () => {
      try {
        firestore = getFirestoreClient();
        setFirestoreReady(true);
        const ref = doc(firestore, 'users', TEST_UID, 'ttb_sync', 'main');
        const snap = await getDoc(ref);
        if (snap.exists()) {
          const data = snap.data();
          if (data && data.blob) {
            setDb(JSON.parse(data.blob));
          }
        }
      } catch (e) {
        console.error('Failed to load from Firestore:', e);
      }
    };
    loadFromFirestore();
    // eslint-disable-next-line
  }, []);

  // Save data changes to Firestore
  useEffect(() => {
    if (!firestoreReady) return;
    const uploadToFirestore = async () => {
      try {
        firestore = getFirestoreClient();
        const ref = doc(firestore, 'users', TEST_UID, 'ttb_sync', 'main');
        await setDoc(ref, { blob: JSON.stringify(db), updatedAt: new Date().toISOString() });
      } catch (e) {
        console.error('Failed to upload to Firestore:', e);
      }
    };
    uploadToFirestore();
    // eslint-disable-next-line
  }, [db]);

  // Filter students by class and query1
  const filterStudents = (students: Student[], classSection: string, query: string) => {
    const arr = Array.isArray(students) ? students : [];
    return arr.filter(s => 
      s.classSection === classSection &&
      (s.name.toLowerCase().includes(query.toLowerCase()) ||
       s.id.toLowerCase().includes(query.toLowerCase()))
    );
  };

  // Handle check-in
  const handleCheckin = (student: Student) => {
    setCheckedIn(prev => ({ ...prev, [student.id]: true }));
    setCheckedOut(prev => ({ ...prev, [student.id]: false }));
    const newLog = {
      id: `log_${Date.now()}`,
      type: 'checkin',
      studentId: student.id,
      timestamp: new Date().toISOString(),
    };
    setDb(prev => ({
      ...prev,
      logs: [...prev.logs, newLog]
    }));
  };

  // Handle check-out
  const handleCheckout = (student: Student) => {
    setCheckedOut(prev => ({ ...prev, [student.id]: true }));
    setCheckedIn(prev => ({ ...prev, [student.id]: false }));
    const newLog = {
      id: `log_${Date.now()}`,
      type: 'checkout',
      studentId: student.id,
      guardian: selectedGuardian[student.id] || '',
      timestamp: new Date().toISOString(),
    };
    setDb(prev => ({
      ...prev,
      logs: [...prev.logs, newLog]
    }));
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-sky-50 to-white p-4">
      <div className="max-w-4xl mx-auto">
        <header className="mb-8">
          <h1 className="text-2xl font-bold">TATA తెలుగు బడి</h1>
          <div className="mt-4 flex gap-4">
            <button 
              onClick={() => setView("checkin")}
              className={`px-4 py-2 rounded ${view === "checkin" ? "bg-blue-500 text-white" : "bg-gray-100"}`}
            >
              Check In
            </button>
            <button 
              onClick={() => setView("checkout")}
              className={`px-4 py-2 rounded ${view === "checkout" ? "bg-blue-500 text-white" : "bg-gray-100"}`}
            >
              Check Out
            </button>
            <button 
              onClick={() => setView("admin")}
              className={`px-4 py-2 rounded ${view === "admin" ? "bg-blue-500 text-white" : "bg-gray-100"}`}
            >
              Admin
            </button>
          </div>
        </header>

        <main>
          {/* Admin Page: Tabs for Enroll and Check on Student */}
          {view === "admin" && (
            <div>
              <div className="flex gap-2 mb-6">
                <button
                  className={`px-4 py-2 rounded-t ${adminTab === "enroll" ? "bg-blue-500 text-white" : "bg-gray-100"}`}
                  onClick={() => setAdminTab("enroll")}
                >
                  Enroll New Student
                </button>
                <button
                  className={`px-4 py-2 rounded-t ${adminTab === "updatestudent" ? "bg-blue-500 text-white" : "bg-gray-100"}`}
                  onClick={() => setAdminTab("updatestudent")}
                >
                  Update Student
                </button>
                <button
                  className={`px-4 py-2 rounded-t ${adminTab === "checkstudent" ? "bg-blue-500 text-white" : "bg-gray-100"}`}
                  onClick={() => setAdminTab("checkstudent")}
                >
                  Check on Student
                </button>
              </div>
              {adminTab === "updatestudent" && (
                <UpdateStudentPage db={db} setDb={setDb} classOptions={classOptions} />
              )}
              {adminTab === "enroll" && (
                <div className="mb-8">
                  {/* Only the enrollment form, no extra headings. */}
                  <form
                    onSubmit={e => {
                      e.preventDefault();
                      setEnrollError("");
                      setEnrollSuccess(false);
                      if (!enrollForm.studentFullName.trim()) {
                        setEnrollError("Student Full Name is required");
                        return;
                      }
                      // Composite primary key: UPPER(name), dob, UPPER(contact)
                      const exists = db.students.some(s =>
                        (s.name?.trim().toUpperCase() === enrollForm.studentFullName.trim().toUpperCase()) &&
                        (s.dateOfBirth === enrollForm.dateOfBirth) &&
                        (s.contact?.trim().toUpperCase() === enrollForm.contact.trim().toUpperCase())
                      );
                      if (exists) {
                        setEnrollError("Duplicate record: A student with the same name, date of birth, and contact number already exists.");
                        return;
                      }
                      // Generate a simple unique ID
                      const id = `TATB-${Date.now()}`;
                      setDb(prev => ({
                        ...prev,
                        students: [
                          ...prev.students,
                          {
                            id,
                            name: enrollForm.studentFullName,
                            classSection: enrollForm.classSection,
                            dateOfBirth: enrollForm.dateOfBirth,
                            fatherName: enrollForm.fatherFullName,
                            motherName: enrollForm.motherFullName,
                            guardian1Name: enrollForm.guardianName,
                            contact: enrollForm.contact,
                            altContact: enrollForm.altContact,
                            email: enrollForm.email,
                            address: enrollForm.address,
                          },
                        ],
                      }));
                      setEnrollForm({
                        studentFullName: "",
                        classSection: "Pravesham",
                        dateOfBirth: "",
                        fatherFullName: "",
                        motherFullName: "",
                        guardianName: "",
                        contact: "",
                        altContact: "",
                        email: "",
                        address: "",
                      });
                      setEnrollSuccess(true);
                    }}
                    className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 border rounded bg-white"
                  >
                    <input
                      className="p-2 border rounded"
                      placeholder="Student Full Name"
                      value={enrollForm.studentFullName}
                      onChange={e => setEnrollForm(f => ({ ...f, studentFullName: e.target.value }))}
                    />
                    <select
                      className="p-2 border rounded"
                      value={enrollForm.classSection}
                      onChange={e => setEnrollForm(f => ({ ...f, classSection: e.target.value }))}
                    >
                      {classOptions.map(opt => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>
                    <div className="flex gap-2 items-center">
                      <input
                        className="p-2 border rounded w-full"
                        type="date"
                        placeholder="Date of Birth"
                        value={enrollForm.dateOfBirth}
                        onChange={e => setEnrollForm(f => ({ ...f, dateOfBirth: e.target.value }))}
                      />
                      <span className="ml-2">Age: {enrollForm.dateOfBirth ? calculateAge(enrollForm.dateOfBirth) : "-"}</span>
                    </div>
                    <input
                      className="p-2 border rounded"
                      placeholder="Father Full Name"
                      value={enrollForm.fatherFullName}
                      onChange={e => setEnrollForm(f => ({ ...f, fatherFullName: e.target.value }))}
                    />
                    <input
                      className="p-2 border rounded"
                      placeholder="Mother Full Name"
                      value={enrollForm.motherFullName}
                      onChange={e => setEnrollForm(f => ({ ...f, motherFullName: e.target.value }))}
                    />
                    <input
                      className="p-2 border rounded"
                      placeholder="Guardian Name"
                      value={enrollForm.guardianName}
                      onChange={e => setEnrollForm(f => ({ ...f, guardianName: e.target.value }))}
                    />
                    <input
                      className="p-2 border rounded"
                      placeholder="Contact Number"
                      value={enrollForm.contact}
                      onChange={e => setEnrollForm(f => ({ ...f, contact: e.target.value }))}
                    />
                    <input
                      className="p-2 border rounded"
                      placeholder="Alternate Contact Number"
                      value={enrollForm.altContact}
                      onChange={e => setEnrollForm(f => ({ ...f, altContact: e.target.value }))}
                    />
                    <input
                      className="p-2 border rounded"
                      placeholder="Email Address"
                      value={enrollForm.email}
                      onChange={e => setEnrollForm(f => ({ ...f, email: e.target.value }))}
                    />
                    <input
                      className="p-2 border rounded md:col-span-2"
                      placeholder="Address"
                      value={enrollForm.address}
                      onChange={e => setEnrollForm(f => ({ ...f, address: e.target.value }))}
                    />
                    <button
                      type="submit"
                      className="p-2 bg-blue-600 text-white rounded md:col-span-2"
                    >
                      Enroll Student
                    </button>
                    {enrollError && <div className="text-red-600 md:col-span-2">{enrollError}</div>}
                    {enrollSuccess && <div className="text-green-600 md:col-span-2">Enrollment successful</div>}
                  </form>

                  {/* Bulk Enrollment Section */}
                  <div className="mt-8 p-4 border rounded bg-gray-50">
                    <h3 className="font-semibold mb-2">Bulk Enrollment of Students</h3>
                    <input
                      type="file"
                      accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel"
                      onChange={handleBulkFileChange}
                      className="mb-2"
                    />
                    <button
                      className="px-4 py-2 bg-blue-600 text-white rounded"
                      onClick={handleBulkUpload}
                      disabled={!bulkFile}
                    >
                      Upload
                    </button>
                    {bulkUploadMessage && <div className="mt-2 text-green-700">{bulkUploadMessage}</div>}
                    {bulkUploadError && <div className="mt-2 text-red-600">{bulkUploadError}</div>}
                  </div>
                </div>
              )}
              {adminTab === "checkstudent" && (
                <CheckStudentPage db={db} logs={db.logs} />
              )}
            </div>
          )}
          {view === "checkin" && (
            <div>
              <h2 className="text-xl font-semibold mb-4">Check In</h2>
              <div className="mb-4">
                <select 
                  value={checkinClass}
                  onChange={(e) => setCheckinClass(e.target.value)}
                  className="mr-4 p-2 border rounded"
                >
                  {classOptions.map(opt => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
                <input
                  type="text"
                  value={checkinQuery}
                  onChange={e => setCheckinQuery(e.target.value)}
                  placeholder="Search by name or ID..."
                  className="p-2 border rounded w-64"
                />
              </div>
              <div className="flex flex-col gap-4 pb-2">
                {(() => {
                  const studentsArr = Array.isArray(db.students) ? db.students : [];
                  const students = filterStudents(studentsArr, checkinClass, checkinQuery);
                  // Move checked-in students to the end
                  const notCheckedIn = students.filter(s => !checkedIn[s.id]);
                  const checkedInList = students.filter(s => checkedIn[s.id]);
                  const ordered = [...notCheckedIn, ...checkedInList];
                  return ordered.map(student => {
                    const isCheckedIn = checkedIn[student.id];
                    return (
                      <div key={student.id} className="w-full max-w-2xl p-4 border rounded bg-white shadow">
                        <div className="font-semibold">{student.name}</div>
                        <div className="text-sm text-gray-500 mb-2">
                          ID: {student.id} | Class: {student.classSection}
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => !isCheckedIn && handleCheckin(student)}
                            className={`flex-1 px-4 py-2 rounded text-white ${isCheckedIn ? 'bg-green-600' : 'bg-orange-500'}`}
                            disabled={isCheckedIn}
                          >
                            {isCheckedIn ? 'Checked In' : 'Check In'}
                          </button>
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>
            </div>
          )}
          {view === "checkout" && (
            <div>
              <h2 className="text-xl font-semibold mb-4">Check Out</h2>
              <div className="mb-4">
                <select 
                  value={checkoutClass}
                  onChange={(e) => setCheckoutClassState(e.target.value)}
                  className="mr-4 p-2 border rounded"
                >
                  {classOptions.map(opt => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
                <input
                  type="text"
                  value={checkoutQuery}
                  onChange={e => setCheckoutQuery(e.target.value)}
                  placeholder="Search by name or ID..."
                  className="p-2 border rounded w-64"
                />
              </div>
              <div className="flex flex-col gap-4 pb-2">
                {(Array.isArray(db.students) ? filterStudents(db.students, checkoutClass, checkoutQuery) : [])
                  .filter(student => checkedIn[student.id])
                  .map(student => {
                    const isCheckedOut = checkoutStatus[student.id];
                    const guardianOptions = [];
                    if (student.fatherName) guardianOptions.push({ label: student.fatherName, value: student.fatherName });
                    if (student.motherName) guardianOptions.push({ label: student.motherName, value: student.motherName });
                    if (student.guardian1Name) guardianOptions.push({ label: student.guardian1Name, value: student.guardian1Name });
                    const selected = selectedGuardian[student.id] || (guardianOptions[0]?.value || '');
                    return (
                      <div key={student.id} className="w-full max-w-2xl p-4 border rounded bg-white shadow">
                        <div className="font-semibold">{student.name}</div>
                        <div className="text-sm text-gray-500 mb-2">
                          ID: {student.id} | Class: {student.classSection}
                        </div>
                        <div className="mb-2 flex gap-4 items-center">
                          {guardianOptions.map(opt => (
                            <label key={opt.label} className="flex items-center gap-1">
                              <input
                                type="radio"
                                name={`guardian-${student.id}`}
                                value={opt.value}
                                checked={selected === opt.value}
                                onChange={() => setSelectedGuardian(g => ({ ...g, [student.id]: opt.value }))}
                                disabled={isCheckedOut}
                              />
                              <span>{opt.label}</span>
                            </label>
                          ))}
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => {
                              if (!isCheckedOut) {
                                handleCheckout(student);
                                setCheckoutStatus(s => ({ ...s, [student.id]: true }));
                                setCheckoutMessage(`Student ${student.name} checked out successfully.`);
                                setTimeout(() => setCheckoutMessage(""), 5000);
                              }
                            }}
                            className={`flex-1 px-4 py-2 rounded text-white ${isCheckedOut ? 'bg-green-600' : 'bg-red-600'}`}
                            disabled={isCheckedOut}
                          >
                            {isCheckedOut ? 'Checked Out' : 'Check Out'}
                          </button>
                        </div>
                      </div>
                    );
                  })}
              {checkoutMessage && (
                <div className="mt-4 text-green-700 font-semibold text-center">{checkoutMessage}</div>
              )}
              </div>
            </div>
          )}
          {/* ...other views and UI... */}
        </main>
      </div>
    </div>
  );
}