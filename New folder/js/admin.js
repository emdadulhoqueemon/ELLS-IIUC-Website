/**
 * ELLS Club — IT Secretary Admin Console
 * ---------------------------------------------------------------------------
 * Firebase Authentication (email + password) protects the dashboard, and every
 * notice is written to the Cloud Firestore `notices` collection.
 *
 *   • Login      → signInWithEmailAndPassword()
 *   • Session    → onAuthStateChanged() keeps the UI in sync across reloads
 *   • Publish    → addDoc(collection(db, 'notices'), {...})
 *   • Live list  → onSnapshot() mirrors what the public homepage shows
 *   • Logout     → signOut()
 *
 * Security is enforced in the Firebase console (Authentication → Users) and by
 * Firestore Security Rules (firestore.rules in the project root).
 * ---------------------------------------------------------------------------
 */

import {
  auth,
  db,
  NOTICES_COLLECTION,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  setPersistence,
  browserLocalPersistence,
  browserSessionPersistence,
  addDoc,
  collection,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp
} from './firebase-config.js';

document.addEventListener('DOMContentLoaded', initAdminConsole);

function initAdminConsole() {
  const bootSplash = document.getElementById('adminBoot');
  const loginView = document.getElementById('adminLoginView');
  const dashboard = document.getElementById('adminDashboard');
  const loginForm = document.getElementById('adminLoginForm');

  if (!loginView || !dashboard || !loginForm) return;

  /* ------------------------------ Elements ------------------------------ */
  const loginError = document.getElementById('adminLoginError');
  const loginBtn = document.getElementById('adminLoginBtn');
  const loginBtnLabel = loginBtn ? loginBtn.querySelector('.admin-submit__label') : null;
  const emailInput = document.getElementById('adminEmail');
  const passwordInput = document.getElementById('adminPassword');
  const passwordToggle = document.getElementById('passwordToggle');
  const rememberInput = document.getElementById('rememberSession');
  const logoutBtn = document.getElementById('adminLogoutBtn');
  const userEmailEl = document.getElementById('adminUserEmail');
  const userInitialsEl = document.getElementById('adminUserInitials');

  const noticeForm = document.getElementById('addNoticeForm');
  const titleInput = document.getElementById('noticeTitle');
  const dateInput = document.getElementById('noticeDate');
  const descriptionInput = document.getElementById('noticeDescription');
  const descCount = document.getElementById('noticeDescCount');
  const publishBtn = document.getElementById('publishNoticeBtn');
  const formStatus = document.getElementById('noticeFormStatus');
  const previewTitle = document.getElementById('previewTitle');
  const previewDate = document.getElementById('previewDate');
  const previewDescription = document.getElementById('previewDescription');
  const publishedList = document.getElementById('publishedNoticeList');
  const publishedEmpty = document.getElementById('publishedEmpty');
  const publishedCount = document.getElementById('publishedCount');
  const adminToday = document.getElementById('adminToday');

  let unsubscribeNotices = null;
  let currentUser = null;
  let isPublishing = false;

  /* ======================================================================
     Authentication
     ====================================================================== */

  onAuthStateChanged(
    auth,
    (user) => {
      currentUser = user;

      if (user) {
        openDashboard(user);
      } else {
        teardownDashboard();
        openLogin();
      }

      if (bootSplash) bootSplash.hidden = true;
    },
    (error) => {
      console.error('[ELLS] Auth state listener failed:', error);
      if (bootSplash) bootSplash.hidden = true;
      openLogin();
      showLoginError('Could not verify your session. Please sign in again.');
    }
  );

  loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearLoginError();

    const email = (emailInput ? emailInput.value : '').trim();
    const password = passwordInput ? passwordInput.value : '';

    if (!email || !password) {
      showLoginError('Please enter both your email address and password.');
      (email ? passwordInput : emailInput).focus();
      return;
    }

    if (!isValidEmail(email)) {
      showLoginError('Please enter a valid email address.');
      emailInput.focus();
      return;
    }

    setLoginLoading(true);

    try {
      // "Keep me signed in" chooses where Firebase persists the session.
      const persistence = rememberInput && rememberInput.checked
        ? browserLocalPersistence
        : browserSessionPersistence;

      await setPersistence(auth, persistence);
      await signInWithEmailAndPassword(auth, email, password);
      // onAuthStateChanged() takes over from here.
    } catch (error) {
      console.error('[ELLS] Sign-in failed:', error);
      showLoginError(describeAuthError(error));
      if (passwordInput) {
        passwordInput.value = '';
        passwordInput.focus();
      }
    } finally {
      setLoginLoading(false);
    }
  });

  const credentialInputs = [emailInput, passwordInput];
  credentialInputs.forEach((input) => {
    if (input) input.addEventListener('input', clearLoginError);
  });

  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      logoutBtn.disabled = true;
      try {
        await signOut(auth);
      } catch (error) {
        console.error('[ELLS] Sign-out failed:', error);
        showFormStatus('Could not sign out. Please try again.', true);
      } finally {
        logoutBtn.disabled = false;
      }
    });
  }

  /* ======================================================================
     Dashboard lifecycle
     ====================================================================== */

  function openDashboard(user) {
    if (bootSplash) bootSplash.hidden = true;
    loginView.hidden = true;
    dashboard.hidden = false;
    document.title = 'IT Secretary Console | ELLS Club';
    updateSkipLinkTarget();

    if (userEmailEl) userEmailEl.textContent = user.email || 'Signed in';
    if (userInitialsEl) userInitialsEl.textContent = initialsFromEmail(user.email);

    const today = todayISO();
    if (adminToday) adminToday.textContent = formatDate(today);
    if (dateInput && !dateInput.value) dateInput.value = today;

    updatePreview();
    subscribeToNotices();
  }

  function teardownDashboard() {
    dashboard.hidden = true;

    if (unsubscribeNotices) {
      unsubscribeNotices();
      unsubscribeNotices = null;
    }

    notices = [];
    renderNotices();
  }

  function openLogin() {
    dashboard.hidden = true;
    loginView.hidden = false;
    document.title = 'IT Secretary Console | ELLS Club';
    updateSkipLinkTarget();

    loginForm.reset();
    clearLoginError();
    resetPasswordVisibility();
    if (emailInput) emailInput.focus();
  }

  function updateSkipLinkTarget() {
    const skipLink = document.querySelector('.skip-link');
    if (!skipLink) return;
    skipLink.setAttribute('href', dashboard.hidden ? '#adminMain' : '#adminDashboardMain');
  }

  /* ======================================================================
     Firestore — real-time notice feed
     ====================================================================== */

  let notices = [];

  function subscribeToNotices() {
    if (unsubscribeNotices) unsubscribeNotices();

    renderNotices('loading');

    const noticesQuery = query(
      collection(db, NOTICES_COLLECTION),
      orderBy('date', 'desc')
    );

    unsubscribeNotices = onSnapshot(
      noticesQuery,
      (snapshot) => {
        notices = snapshot.docs.map((docSnap) => {
          const data = docSnap.data() || {};
          return {
            id: docSnap.id,
            title: typeof data.title === 'string' ? data.title.trim() : '',
            description: typeof data.description === 'string' ? data.description.trim() : '',
            date: parseNoticeDate(data.date)
          };
        });

        renderNotices();
      },
      (error) => {
        console.error('[ELLS] Notice feed failed:', error);
        renderNotices('error');
      }
    );
  }

  /* ======================================================================
     Notice form
     ====================================================================== */

  if (noticeForm) {
    noticeForm.addEventListener('input', (event) => {
      if (event.target === titleInput) clearFieldError(titleInput, 'noticeTitleError');
      if (event.target === dateInput) clearFieldError(dateInput, 'noticeDateError');
      if (event.target === descriptionInput) {
        clearFieldError(descriptionInput, 'noticeDescriptionError');
        updateCounter();
      }
      updatePreview();
    });

    noticeForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (isPublishing) return;

      const title = titleInput ? titleInput.value.trim() : '';
      const date = dateInput ? dateInput.value : '';
      const description = descriptionInput ? descriptionInput.value.trim() : '';
      let isValid = true;

      if (!title) {
        setFieldError(titleInput, 'noticeTitleError', 'Please enter a notice title.');
        isValid = false;
      } else if (title.length < 4) {
        setFieldError(titleInput, 'noticeTitleError', 'The title should be at least 4 characters long.');
        isValid = false;
      }

      if (!date) {
        setFieldError(dateInput, 'noticeDateError', 'Please choose the date this notice applies to.');
        isValid = false;
      }

      if (!description) {
        setFieldError(descriptionInput, 'noticeDescriptionError', 'Please write a short description for the notice.');
        isValid = false;
      } else if (description.length < 10) {
        setFieldError(descriptionInput, 'noticeDescriptionError', 'Please add a little more detail (at least 10 characters).');
        isValid = false;
      }

      if (!isValid) {
        const firstInvalid = noticeForm.querySelector('.has-error .form-control');
        if (firstInvalid) firstInvalid.focus();
        showFormStatus('Please complete the highlighted fields before publishing.', true);
        return;
      }

      if (!currentUser) {
        showFormStatus('Your session has expired. Please sign in again.', true);
        return;
      }

      isPublishing = true;
      setPublishing(true);

      try {
        await addDoc(collection(db, NOTICES_COLLECTION), {
          title,
          date,
          description,
          createdAt: serverTimestamp(),
          authorEmail: currentUser.email || null,
          authorUid: currentUser.uid
        });

        // The live onSnapshot() subscription refreshes the list automatically.
        resetNoticeForm();
        showFormStatus('Notice published — it is now live on the public notice board.', false);
      } catch (error) {
        console.error('[ELLS] Publishing notice failed:', error);
        showFormStatus(describeFirestoreError(error), true);
      } finally {
        isPublishing = false;
        setPublishing(false);
      }
    });

    noticeForm.addEventListener('reset', () => {
      window.setTimeout(() => {
        if (dateInput) dateInput.value = todayISO();
        updateCounter();
        updatePreview();
        clearFieldError(titleInput, 'noticeTitleError');
        clearFieldError(dateInput, 'noticeDateError');
        clearFieldError(descriptionInput, 'noticeDescriptionError');
        if (formStatus) {
          formStatus.classList.remove('is-visible', 'is-error');
          formStatus.textContent = '';
        }
      }, 0);
    });
  }

  function resetNoticeForm() {
    if (titleInput) titleInput.value = '';
    if (descriptionInput) descriptionInput.value = '';
    if (dateInput) dateInput.value = todayISO();
    updateCounter();
    updatePreview();
    clearFieldError(titleInput, 'noticeTitleError');
    clearFieldError(dateInput, 'noticeDateError');
    clearFieldError(descriptionInput, 'noticeDescriptionError');
    if (titleInput) titleInput.focus();
  }

  function setPublishing(isBusy) {
    if (!publishBtn) return;
    publishBtn.disabled = isBusy;
    publishBtn.classList.toggle('is-loading', isBusy);
    const label = publishBtn.querySelector('span');
    if (label) label.textContent = isBusy ? 'Publishing…' : 'Publish Notice';
  }

  /* ======================================================================
     Rendering
     ====================================================================== */

  function renderNotices(state) {
    if (!publishedList) return;

    publishedList.querySelectorAll('.admin-notice-item').forEach((item) => item.remove());

    if (state === 'loading' || state === 'error') {
      if (publishedEmpty) {
        publishedEmpty.hidden = false;
        publishedEmpty.textContent = state === 'loading'
          ? 'Loading notices from Firestore…'
          : 'The notice feed is unavailable right now. Check your Firestore rules and connection.';
      }
      if (publishedCount) publishedCount.textContent = '–';
      return;
    }

    if (publishedCount) publishedCount.textContent = String(notices.length);

    if (publishedEmpty) {
      publishedEmpty.hidden = notices.length > 0;
      publishedEmpty.textContent = 'No notices published yet. Your entries will appear here.';
    }

    notices.forEach((notice) => {
      const item = document.createElement('li');
      item.className = 'admin-notice-item';
      item.dataset.noticeId = notice.id;

      const body = document.createElement('div');
      body.className = 'admin-notice-item__body';

      const title = document.createElement('h4');
      title.textContent = notice.title || 'Untitled notice';

      const time = document.createElement('time');
      time.dateTime = notice.date ? toISODate(notice.date) : '';
      time.textContent = formatDate(notice.date ? toISODate(notice.date) : '');

      const description = document.createElement('p');
      description.textContent = notice.description;

      body.append(title, time, description);
      item.appendChild(body);
      publishedList.appendChild(item);
    });
  }

  /* ======================================================================
     Preview + small UI helpers
     ====================================================================== */

  function updatePreview() {
    if (!previewTitle || !previewDescription || !previewDate) return;

    const title = titleInput ? titleInput.value.trim() : '';
    const description = descriptionInput ? descriptionInput.value.trim() : '';
    const date = dateInput ? dateInput.value : '';

    previewTitle.textContent = title || 'Your notice title will appear here';
    previewDate.textContent = formatDate(date);
    previewDescription.textContent = description ||
      'Add a title, date, and description to preview how this notice will look to students.';
  }

  function updateCounter() {
    if (!descCount || !descriptionInput) return;
    descCount.textContent = `${descriptionInput.value.length} / ${descriptionInput.maxLength}`;
  }

  function clearFieldError(input, errorId) {
    if (!input) return;
    const group = input.closest('.form-group');
    if (group) group.classList.remove('has-error');
    const error = document.getElementById(errorId);
    if (error) error.textContent = '';
    input.removeAttribute('aria-invalid');
  }

  function setFieldError(input, errorId, message) {
    if (!input) return;
    const group = input.closest('.form-group');
    if (group) group.classList.add('has-error');
    const error = document.getElementById(errorId);
    if (error) error.textContent = message;
    input.setAttribute('aria-invalid', 'true');
  }

  function showFormStatus(message, isError) {
    if (!formStatus) return;
    formStatus.textContent = message;
    formStatus.classList.add('is-visible');
    formStatus.classList.toggle('is-error', Boolean(isError));

    window.clearTimeout(showFormStatus.timer);
    showFormStatus.timer = window.setTimeout(() => {
      formStatus.classList.remove('is-visible', 'is-error');
      formStatus.textContent = '';
    }, 6000);
  }

  function showLoginError(message) {
    if (!loginError) return;
    loginError.textContent = message;
    loginError.classList.add('is-visible');
  }

  function clearLoginError() {
    if (!loginError) return;
    loginError.textContent = '';
    loginError.classList.remove('is-visible');
  }

  function setLoginLoading(isLoading) {
    if (!loginBtn) return;
    loginBtn.disabled = isLoading;
    loginBtn.classList.toggle('is-loading', isLoading);
    if (loginBtnLabel) {
      loginBtnLabel.textContent = isLoading ? 'Verifying…' : 'Sign In Securely';
    }
  }

  function resetPasswordVisibility() {
    if (!passwordInput || !passwordToggle) return;
    passwordInput.type = 'password';
    passwordToggle.classList.remove('is-visible');
    passwordToggle.setAttribute('aria-pressed', 'false');
    passwordToggle.setAttribute('aria-label', 'Show password');
  }

  if (passwordToggle && passwordInput) {
    passwordToggle.addEventListener('click', () => {
      const isVisible = passwordInput.type === 'text';
      passwordInput.type = isVisible ? 'password' : 'text';
      passwordToggle.classList.toggle('is-visible', !isVisible);
      passwordToggle.setAttribute('aria-pressed', String(!isVisible));
      passwordToggle.setAttribute('aria-label', isVisible ? 'Show password' : 'Hide password');
      passwordInput.focus();
    });
  }

  /* ======================================================================
     Boot
     ====================================================================== */

  updateCounter();
  updatePreview();
  if (dateInput && !dateInput.value) dateInput.value = todayISO();

  if (loginView) loginView.hidden = true;   // the splash covers this until auth resolves
  dashboard.hidden = true;
}

/* =========================================================================
   Date helpers
   ========================================================================= */

function todayISO() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function toISODate(date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

/** Firestore `date` may be a "YYYY-MM-DD" string, a Date or a Timestamp. */
function parseNoticeDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value.toDate === 'function') return value.toDate();
  if (typeof value === 'object' && typeof value.seconds === 'number') {
    return new Date(value.seconds * 1000);
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = new Date(`${value.trim()}T00:00:00`);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return null;
}

function formatDate(value) {
  if (!value) return 'Date not set';
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return 'Date not set';
  return parsed.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  });
}

/* =========================================================================
   Error copy
   ========================================================================= */

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function initialsFromEmail(email) {
  if (!email) return 'IT';
  const localPart = email.split('@')[0].replace(/[^a-z0-9]/gi, '');
  return localPart ? localPart.slice(0, 2).toUpperCase() : 'IT';
}

function describeAuthError(error) {
  const code = error && error.code ? error.code : '';

  switch (code) {
    case 'auth/invalid-email':
      return 'That email address is not valid.';
    case 'auth/user-disabled':
      return 'This account has been disabled. Contact the ELLS executive committee.';
    case 'auth/user-not-found':
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return 'Incorrect email or password. Please try again.';
    case 'auth/too-many-requests':
      return 'Too many failed attempts. Please wait a few minutes and try again.';
    case 'auth/network-request-failed':
      return 'Network error — check your internet connection and try again.';
    case 'auth/invalid-api-key':
    case 'auth/configuration-not-found':
      return 'Firebase Authentication is not configured for this project yet.';
    default:
      return 'Sign-in failed. Please check your credentials and try again.';
  }
}

function describeFirestoreError(error) {
  const code = error && error.code ? error.code : '';

  switch (code) {
    case 'permission-denied':
      return 'Firestore blocked this write. Make sure your account is on the admin allowlist in the security rules.';
    case 'unavailable':
      return 'Cloud Firestore is unreachable right now. Check your connection and try again.';
    case 'failed-precondition':
      return 'Firestore needs an index for this query. Check the browser console for the setup link.';
    default:
      return 'The notice could not be published. Please try again.';
  }
}
