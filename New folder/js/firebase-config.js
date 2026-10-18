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

/** Firestore collection that powers the public notice board. */
export const NOTICES_COLLECTION = 'notices';

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
  onSnapshot,
  query,
  orderBy,
  serverTimestamp
} from './vendor/firebase/firebase-firestore.js';
