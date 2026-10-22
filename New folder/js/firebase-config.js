/**
 * ELLS Club — Firebase Bootstrap (SDK v10, modular)
 * ---------------------------------------------------------------------------
 * Single source of truth for the Firebase project. Every page that needs a
 * backend imports `auth`, `db` and the SDK helpers from this file so the whole
 * site shares one initialized Firebase app and one pinned SDK version.
 *
 * Modules included:
 *   • firebase-auth      → IT Secretary sign-in for admin.html
 *   • firebase-firestore → `notices` collection (public read, admin write)
 *                          `events`  collection (public read, admin write)
 *
 * SDK delivery
 * ---------------------------------------------------------------------------
 * The official v10 modular bundles are vendored in `js/vendor/firebase/`
 * (identical to the gstatic.com build, only the internal import paths are
 * local). The site therefore loads from its own origin — no third-party
 * script dependency, and it works on any static host.
 *
 * NOTE: the web API key below is not a secret — it only identifies the
 * Firebase project. Access is enforced by Firestore Security Rules
 * (see firestore.rules) and by Firebase Authentication.
 * ---------------------------------------------------------------------------
 */

import { initializeApp } from './vendor/firebase/firebase-app.js';
import { getAuth } from './vendor/firebase/firebase-auth.js';
import { getFirestore } from './vendor/firebase/firebase-firestore.js';

/** Firebase Web App configuration for the ELLS Club project. */
export const firebaseConfig = {
  apiKey: 'AIzaSyC8ueqz6cMiNnSOiUT7ids_YKdIMQMqCcY',
  authDomain: 'ells-club.firebaseapp.com',
  projectId: 'ells-club',
  storageBucket: 'ells-club.firebasestorage.app',
  messagingSenderId: '253554942186',
  appId: '1:253554942186:web:8fdc926c12e769615d3793'
};

/**
 * Accounts allowed to sign in to admin.html, publish and delete notices/events.
 *
 * Both addresses are FULL administrators with identical rights:
 *   1. emdadulhoquex@gmail.com      — IT Secretary
 *   2. ells.dell.iiuc95@gmail.com   — official ELLS club account
 *
 * Matching in admin.js is case-insensitive, so entries are stored lowercase.
 *
 * ⚠️ This is a UI convenience only — the REAL enforcement lives in
 * firestore.rules (`isAdminEmail()` / `isAdmin()`). Update both lists together.
 */
export const ADMIN_EMAILS = [
  'emdadulhoquex@gmail.com',    // IT Secretary
  'ells.dell.iiuc95@gmail.com'  // Official ELLS club account
];

/** Firestore collection that powers the public notice board. */
export const NOTICES_COLLECTION = 'notices';

/** Firestore collection that powers the public events page (events.html). */
export const EVENTS_COLLECTION = 'events';

/* ---------------------------------------------------------------------------
   ImgBB — free image hosting for event posters
   ---------------------------------------------------------------------------
   Posters are uploaded straight from admin.html to ImgBB, and only the
   resulting public URL is written to Firestore. That keeps Storage costs at
   zero and means Firestore documents stay tiny.

   NOTE: as with the Firebase web API key above, this key ships in the client
   bundle — it is a project identifier for the free ImgBB tier, not a secret
   that grants access to your Firebase data. Rotate it from the ImgBB console
   if it is ever abused (Settings → API).
   --------------------------------------------------------------------------- */
export const IMGBB_UPLOAD_ENDPOINT = 'https://api.imgbb.com/1/upload';
export const IMGBB_API_KEY = 'f2035aa391a0f46994eba47c4dc76b99';

/** Largest poster accepted before upload (ImgBB itself allows 32 MB). */
export const POSTER_MAX_BYTES = 8 * 1024 * 1024;

/** MIME types the poster picker accepts. */
export const POSTER_MIME_TYPES = ['image/jpeg', 'image/jpg', 'image/png'];

export const firebaseApp = initializeApp(firebaseConfig);
export const auth = getAuth(firebaseApp);
export const db = getFirestore(firebaseApp);

/* ---------------------------------------------------------------------------
   SDK helpers re-exported from the same pinned bundles.
   --------------------------------------------------------------------------- */

// Authentication
export {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  setPersistence,
  browserLocalPersistence,
  browserSessionPersistence
} from './vendor/firebase/firebase-auth.js';

// Cloud Firestore
export {
  addDoc,
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where
} from './vendor/firebase/firebase-firestore.js';
