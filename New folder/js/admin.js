/**
 * ELLS Club — IT Secretary Admin Console
 * ---------------------------------------------------------------------------
 * Firebase Authentication (email + password) protects the dashboard, and every
 * notice is written to the Cloud Firestore `notices` collection while every
 * event is written to the `events` collection.
 *
 *   • Login      → signInWithEmailAndPassword()
 *   • Session    → onAuthStateChanged() keeps the UI in sync across reloads
 *   • Publish    → addDoc(collection(db, 'notices' | 'events'), {...})
 *   • Edit       → updateDoc(doc(db, …, id), {...}) — the same document is
 *                  rewritten in place; createdAt and the original author are
 *                  preserved, updatedAt records the edit
 *   • Delete     → deleteDoc(doc(db, …, id))
 *   • Live list  → onSnapshot() mirrors what the public homepage shows
 *   • Status     → each event carries status: 'open' | 'closed' | 'completed'
 *   • Logout     → signOut()
 *
 * Security is enforced in the Firebase console (Authentication → Users) and by
 * Firestore Security Rules (firestore.rules in the project root).
 *
 * Authorised administrators — full, identical access to this console plus
 * create / update / delete on `notices` and `events`:
 *   • emdadulhoquex@gmail.com      (IT Secretary)
 *   • ells.dell.iiuc95@gmail.com   (official ELLS club account)
 * The list lives in ADMIN_EMAILS (firebase-config.js) and is mirrored in
 * firestore.rules → isAdminEmail(); the UI check here is only a convenience.
 * ---------------------------------------------------------------------------
 */

import {
  auth,
  db,
  ADMIN_EMAILS,
  NOTICES_COLLECTION,
  EVENTS_COLLECTION,
  IMGBB_UPLOAD_ENDPOINT,
  IMGBB_API_KEY,
  POSTER_MAX_BYTES,
  POSTER_MIME_TYPES,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  setPersistence,
  browserLocalPersistence,
  browserSessionPersistence,
  addDoc,
  collection,
  deleteDoc,
  deleteField,
  doc,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp,
  updateDoc
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

  /* ---- Event Management elements ---- */
  const eventForm = document.getElementById('addEventForm');
  const eventTitleInput = document.getElementById('eventTitle');
  const eventCategoryInput = document.getElementById('eventCategory');
  const eventDescriptionInput = document.getElementById('eventDescription');
  const eventDescCount = document.getElementById('eventDescCount');
  const eventDateInput = document.getElementById('eventDate');
  const eventTimeInput = document.getElementById('eventTime');
  const eventVenueInput = document.getElementById('eventVenue');
  const eventRegLinkInput = document.getElementById('eventRegLink');
  const eventPosterInput = document.getElementById('eventPosterFile');
  const eventPosterDrop = document.getElementById('eventPosterDrop');
  const eventPosterThumb = document.getElementById('eventPosterThumb');
  const eventPosterIcon = document.getElementById('eventPosterIcon');
  const eventPosterLabel = document.getElementById('eventPosterLabel');
  const eventPosterFileName = document.getElementById('eventPosterFileName');
  const removeEventPosterBtn = document.getElementById('removeEventPoster');
  const eventPreviewPosterWrap = document.getElementById('eventPreviewPosterWrap');
  const eventPreviewPoster = document.getElementById('eventPreviewPoster');
  const publishEventBtn = document.getElementById('publishEventBtn');
  const eventFormStatus = document.getElementById('eventFormStatus');
  const eventPreviewBadge = document.getElementById('eventPreviewBadge');
  const eventPreviewTitle = document.getElementById('eventPreviewTitle');
  const eventPreviewWhen = document.getElementById('eventPreviewWhen');
  const eventPreviewDescription = document.getElementById('eventPreviewDescription');
  const eventPreviewVenue = document.getElementById('eventPreviewVenue');
  const eventPreviewLink = document.getElementById('eventPreviewLink');
  const publishedEventList = document.getElementById('publishedEventList');
  const publishedEventEmpty = document.getElementById('publishedEventEmpty');
  const publishedEventCount = document.getElementById('publishedEventCount');
  const adminEventTotal = document.getElementById('adminEventTotal');
  const eventStatusInput = document.getElementById('eventStatus');
  const cancelNoticeEditBtn = document.getElementById('cancelNoticeEditBtn');
  const cancelEventEditBtn = document.getElementById('cancelEventEditBtn');

  let unsubscribeNotices = null;
  let unsubscribeEvents = null;
  let currentUser = null;
  let isPublishing = false;
  let isPublishingEvent = false;

  /* --- Edit mode -------------------------------------------------------
     When these hold a document id the matching form UPDATES that document
     instead of creating a new one. `editingNotice` / `editingEvent` keep the
     snapshot so an edit never loses fields the form does not show —
     createdAt, the original authorUid/authorEmail, and the saved poster. */
  let editingNoticeId = '';
  let editingNotice = null;
  let editingEventId = '';
  let editingEvent = null;
  /** ImgBB display_url already stored on the event being edited. */
  let editingPosterUrl = '';
  // Object URL for the poster chosen in the form (revoked when replaced/cleared)
  let eventPosterObjectUrl = '';
  // File dropped onto the picker (input.files cannot be set programmatically)
  let droppedPosterFile = null;
  // Set when an authenticated account is not on the ADMIN_EMAILS allowlist;
  // openLogin() displays it once the sign-out cycle settles.
  let pendingAuthMessage = '';

  /* ======================================================================
     Authentication
     ====================================================================== */

  onAuthStateChanged(
    auth,
    (user) => {
      // Firebase can authenticate any account in the project, but only the
      // allowlisted addresses may use the console. The allowlist is
      // ADMIN_EMAILS in firebase-config.js and currently holds:
      //   • emdadulhoquex@gmail.com      (IT Secretary)
      //   • ells.dell.iiuc95@gmail.com   (official ELLS club account)
      // Everyone else is signed straight back out (Firestore rules enforce
      // the very same boundary server-side).
      if (user && !isAuthorizedAdmin(user)) {
        const rejected = user.email || 'This account';
        pendingAuthMessage =
          `${rejected} is not authorised to use the ELLS admin console. ` +
          'Please sign in with an authorised admin account.';
        console.warn('[ELLS] Rejected non-admin sign-in:', rejected);

        signOut(auth).catch((error) => {
          console.error('[ELLS] Could not sign out rejected account:', error);
        });
        return; // the null-user callback below finishes the transition
      }

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
    updateEventPreview();
    subscribeToNotices();
    subscribeToEvents();
  }

  function teardownDashboard() {
    teardownEditModes();
    dashboard.hidden = true;

    if (unsubscribeNotices) {
      unsubscribeNotices();
      unsubscribeNotices = null;
    }

    if (unsubscribeEvents) {
      unsubscribeEvents();
      unsubscribeEvents = null;
    }

    notices = [];
    renderNotices();
    events = [];
    renderEvents();
  }

  /** Drops any half-finished edit when the session ends. */
  function teardownEditModes() {
    editingNoticeId = '';
    editingNotice = null;
    editingEventId = '';
    editingEvent = null;
    editingPosterUrl = '';

    if (cancelNoticeEditBtn) cancelNoticeEditBtn.hidden = true;
    if (cancelEventEditBtn) cancelEventEditBtn.hidden = true;
    if (noticeForm) noticeForm.classList.remove('is-editing');
    if (eventForm) eventForm.classList.remove('is-editing');
  }

  function openLogin() {
    dashboard.hidden = true;
    loginView.hidden = false;
    document.title = 'IT Secretary Console | ELLS Club';
    updateSkipLinkTarget();

    loginForm.reset();
    clearLoginError();
    resetPasswordVisibility();

    if (pendingAuthMessage) {
      showLoginError(pendingAuthMessage);
      pendingAuthMessage = '';
    }

    if (emailInput) emailInput.focus();
  }

  /**
   * Both allowlisted accounts are full administrators with identical rights:
   *   • emdadulhoquex@gmail.com      (IT Secretary)
   *   • ells.dell.iiuc95@gmail.com   (official ELLS club account)
   * Matching is case-insensitive (and whitespace-tolerant) so a token whose
   * email casing differs from the configured entry still grants access.
   * Keep ADMIN_EMAILS in sync with firestore.rules → isAdminEmail().
   */
  function isAuthorizedAdmin(user) {
    const email = (user && user.email ? user.email : '').trim().toLowerCase();
    if (!email) return false;
    return ADMIN_EMAILS.some(
      (allowed) => String(allowed).trim().toLowerCase() === email
    );
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
            date: parseNoticeDate(data.date),
            authorEmail: typeof data.authorEmail === 'string' ? data.authorEmail : '',
            authorUid: typeof data.authorUid === 'string' ? data.authorUid : ''
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
     Firestore — real-time event feed
     ====================================================================== */

  let events = [];

  function subscribeToEvents() {
    if (unsubscribeEvents) unsubscribeEvents();

    renderEvents('loading');

    // Single-field index is automatic; the list is newest-published first.
    const eventsQuery = query(
      collection(db, EVENTS_COLLECTION),
      orderBy('createdAt', 'desc')
    );

    unsubscribeEvents = onSnapshot(
      eventsQuery,
      (snapshot) => {
        events = snapshot.docs.map((docSnap) => {
          const data = docSnap.data() || {};
          return {
            id: docSnap.id,
            title: typeof data.title === 'string' ? data.title.trim() : '',
            category: typeof data.category === 'string' ? data.category.trim() : '',
            description: typeof data.description === 'string' ? data.description.trim() : '',
            date: typeof data.date === 'string' ? data.date.trim() : '',
            time: typeof data.time === 'string' ? data.time.trim() : '',
            venue: typeof data.venue === 'string' ? data.venue.trim() : '',
            registrationLink: typeof data.registrationLink === 'string' ? data.registrationLink.trim() : '',
            posterUrl: typeof data.posterUrl === 'string' ? data.posterUrl.trim() : '',
            status: normalizeEventStatus(data.status),
            authorEmail: typeof data.authorEmail === 'string' ? data.authorEmail : '',
            authorUid: typeof data.authorUid === 'string' ? data.authorUid : ''
          };
        });

        renderEvents();
      },
      (error) => {
        console.error('[ELLS] Event feed failed:', error);
        renderEvents('error');
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
      const wasEditing = Boolean(editingNoticeId);
      setPublishing(true, wasEditing ? 'Saving…' : 'Publishing…');

      try {
        if (wasEditing) {
          /* UPDATE the existing document. createdAt is deliberately omitted so
             the original publish time survives, and the author is carried over
             from the snapshot (either admin may edit either document). */
          await updateDoc(doc(db, NOTICES_COLLECTION, editingNoticeId), {
            title,
            date,
            description,
            updatedAt: serverTimestamp(),
            authorEmail: (editingNotice && editingNotice.authorEmail) || currentUser.email || null,
            authorUid: (editingNotice && editingNotice.authorUid) || currentUser.uid
          });

          const savedId = editingNoticeId;
          exitNoticeEditMode();
          showFormStatus('Notice updated — the public board immediately shows the new text.', false);
          flashLiveItem('notice', savedId);
        } else {
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
        }
      } catch (error) {
        console.error('[ELLS] Publishing notice failed:', error);
        showFormStatus(describeFirestoreError(error), true);
      } finally {
        isPublishing = false;
        setPublishing(false);
      }
    });

    noticeForm.addEventListener('reset', () => {
      // Reset doubles as "leave edit mode": a cleared form must never keep
      // pointing at the document it was loaded from.
      exitNoticeEditMode({ keepFields: true });
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

  if (cancelNoticeEditBtn) {
    cancelNoticeEditBtn.addEventListener('click', () => exitNoticeEditMode());
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

  function setPublishing(isBusy, busyLabel) {
    if (!publishBtn) return;
    publishBtn.disabled = isBusy;
    publishBtn.classList.toggle('is-loading', isBusy);
    const label = publishBtn.querySelector('span');
    if (label) {
      label.textContent = isBusy
        ? (busyLabel || 'Publishing…')
        : (editingNoticeId ? 'Save Changes' : 'Publish Notice');
    }
  }

  /* ======================================================================
     Notice edit mode
     ====================================================================== */

  /** Loads a notice document into the form so submit() updates it. */
  function startNoticeEdit(notice) {
    editingNoticeId = notice.id;
    editingNotice = notice;

    if (titleInput) titleInput.value = notice.title;
    if (dateInput) dateInput.value = toISODate(notice.date) || todayISO();
    if (descriptionInput) descriptionInput.value = notice.description;

    clearFieldError(titleInput, 'noticeTitleError');
    clearFieldError(dateInput, 'noticeDateError');
    clearFieldError(descriptionInput, 'noticeDescriptionError');

    updateCounter();
    updatePreview();

    if (publishBtn) {
      const label = publishBtn.querySelector('span');
      if (label) label.textContent = 'Save Changes';
    }
    if (cancelNoticeEditBtn) cancelNoticeEditBtn.hidden = false;
    if (noticeForm) noticeForm.classList.add('is-editing');

    const heading = document.getElementById('addNoticeHeading');
    if (heading) heading.textContent = 'Edit Notice';

    if (titleInput) titleInput.focus();
    if (noticeForm) noticeForm.scrollIntoView({ behavior: 'smooth', block: 'center' });
    showFormStatus('Editing an existing notice — saving will update it, not create a duplicate.', false);
    markEditingRow('notice', notice.id);
  }

  /** Leaves edit mode without touching Firestore. */
  function exitNoticeEditMode(options = {}) {
    editingNoticeId = '';
    editingNotice = null;

    if (publishBtn) {
      const label = publishBtn.querySelector('span');
      if (label) label.textContent = 'Publish Notice';
    }
    if (cancelNoticeEditBtn) cancelNoticeEditBtn.hidden = true;
    if (noticeForm) noticeForm.classList.remove('is-editing');

    const heading = document.getElementById('addNoticeHeading');
    if (heading) heading.textContent = 'Add New Notice';

    if (!options.keepFields) resetNoticeForm();
    if (formStatus) {
      formStatus.classList.remove('is-visible', 'is-error');
      formStatus.textContent = '';
    }
    markEditingRow('notice', '');
  }

  /* ======================================================================
     Rendering
     ====================================================================== */

  function renderNotices(state) {
    if (!publishedList) return;

    publishedList.querySelectorAll('.admin-live-item').forEach((item) => item.remove());
    publishedList.classList.toggle('is-loading', state === 'loading');

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

    notices.forEach((notice, index) => {
      publishedList.appendChild(buildNoticeRow(notice, index));
    });

    // Keep the highlight in sync after a live re-render.
    markEditingRow('notice', editingNoticeId);
  }

  /** One row of the "Currently Live" notice table. */
  function buildNoticeRow(notice, index) {
    const item = document.createElement('li');
    item.className = 'admin-live-item';
    item.dataset.noticeId = notice.id;

    /* Serial: #01, #02 … padded to two digits, growing past 99 naturally. */
    const serial = document.createElement('span');
    serial.className = 'admin-live-item__serial';
    serial.textContent = formatSerial(index);

    const body = document.createElement('div');
    body.className = 'admin-live-item__body';

    const title = document.createElement('h4');
    title.className = 'admin-live-item__title';
    title.textContent = notice.title || 'Untitled notice';

    const meta = document.createElement('p');
    meta.className = 'admin-live-item__meta';

    const when = document.createElement('time');
    when.dateTime = notice.date ? toISODate(notice.date) : '';
    when.textContent = formatDate(notice.date ? toISODate(notice.date) : '');

    const dot = document.createElement('span');
    dot.className = 'admin-live-item__dot';
    dot.setAttribute('aria-hidden', 'true');
    dot.textContent = '•';

    const live = document.createElement('span');
    live.className = 'admin-live-badge admin-live-badge--live';
    live.textContent = 'Live';

    meta.append(when, dot, live);

    const description = document.createElement('p');
    description.className = 'admin-live-item__desc';
    description.textContent = notice.description;

    body.append(title, meta, description);

    const actions = document.createElement('div');
    actions.className = 'admin-live-item__actions';
    actions.append(
      buildEditButton('notice', notice, () => startNoticeEdit(notice)),
      buildDeleteButton('notice', notice, (btn) => deleteNotice(notice, btn))
    );

    item.append(serial, body, actions);
    return item;
  }

  /* ======================================================================
     Shared "Currently Live" helpers (used by notices and events)
     ====================================================================== */

  /** #01, #02 … — two digits until the list is longer than 99. */
  function formatSerial(index) {
    return `#${String(index + 1).padStart(2, '0')}`;
  }

  function buildIcon(kind, paths) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('aria-hidden', 'true');
    svg.innerHTML = paths;
    return svg;
  }

  function buildEditButton(kind, record, onClick) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'admin-live-action admin-live-action--edit';
    button.dataset.action = 'edit';
    button.dataset[kind + 'Id'] = record.id;
    button.title = `Edit ${kind}`;
    button.setAttribute('aria-label', `Edit ${kind}: ${record.title || 'Untitled'}`);
    button.append(
      buildIcon('edit', '<path d="M12 20h9"></path><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"></path>'),
      Object.assign(document.createElement('span'), { textContent: 'Edit' })
    );
    button.addEventListener('click', onClick);
    return button;
  }

  function buildDeleteButton(kind, record, onClick) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'admin-live-action admin-live-action--delete';
    button.dataset.action = 'delete';
    button.dataset[kind + 'Id'] = record.id;
    button.title = `Delete ${kind}`;
    button.setAttribute('aria-label', `Delete ${kind}: ${record.title || 'Untitled'}`);
    button.append(
      buildIcon('delete', '<path d="M3 6h18"></path><path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2"></path><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line>'),
      Object.assign(document.createElement('span'), { textContent: 'Delete' })
    );
    button.addEventListener('click', () => onClick(button));
    return button;
  }

  /** Marks the row matching the document currently open in a form. */
  function markEditingRow(kind, id) {
    const list = kind === 'notice' ? publishedList : publishedEventList;
    if (!list) return;
    const attr = kind === 'notice' ? 'noticeId' : 'eventId';
    list.querySelectorAll('.admin-live-item').forEach((row) => {
      const isEditing = Boolean(id) && row.dataset[attr] === id;
      row.classList.toggle('is-editing', isEditing);
      if (isEditing) row.setAttribute('aria-current', 'true');
      else row.removeAttribute('aria-current');
    });
  }

  /** Brief highlight so the admin sees which row they just saved. */
  function flashLiveItem(kind, id) {
    const list = kind === 'notice' ? publishedList : publishedEventList;
    if (!list || !id) return;
    const attr = kind === 'notice' ? 'noticeId' : 'eventId';
    const row = list.querySelector(`.admin-live-item[data-${kind === 'notice' ? 'notice' : 'event'}-id="${id}"]`);
    if (!row) return;
    row.classList.add('is-saved');
    window.setTimeout(() => row.classList.remove('is-saved'), 1600);
  }

  /* ======================================================================
     Delete a notice (Firestore rules allow this for the admin only)
     ====================================================================== */

  async function deleteNotice(notice, buttonEl) {
    const label = notice.title || 'this notice';
    const confirmed = window.confirm(
      `Delete "${label}"?\n\n` +
      'It will be removed from Cloud Firestore and disappear from the public ' +
      'notice board immediately. This cannot be undone.'
    );
    if (!confirmed) return;

    if (buttonEl) buttonEl.disabled = true;

    try {
      await deleteDoc(doc(db, NOTICES_COLLECTION, notice.id));
      // onSnapshot() removes the row automatically.
      if (editingNoticeId === notice.id) exitNoticeEditMode();
      showFormStatus('Notice deleted from the public notice board.', false);
    } catch (error) {
      console.error('[ELLS] Deleting notice failed:', error);
      showFormStatus(describeFirestoreError(error), true);
      if (buttonEl) buttonEl.disabled = false;
    }
  }

  /* ======================================================================
     Event form
     ====================================================================== */

  if (eventForm) {
    eventForm.addEventListener('input', (event) => {
      if (event.target === eventTitleInput) clearFieldError(eventTitleInput, 'eventTitleError');
      if (event.target === eventCategoryInput) clearFieldError(eventCategoryInput, 'eventCategoryError');
      if (event.target === eventDescriptionInput) {
        clearFieldError(eventDescriptionInput, 'eventDescriptionError');
        updateEventCounter();
      }
      if (event.target === eventDateInput) clearFieldError(eventDateInput, 'eventDateError');
      if (event.target === eventTimeInput) clearFieldError(eventTimeInput, 'eventTimeError');
      if (event.target === eventVenueInput) clearFieldError(eventVenueInput, 'eventVenueError');
      if (event.target === eventRegLinkInput) clearFieldError(eventRegLinkInput, 'eventRegLinkError');
      updateEventPreview();
    });

    eventForm.addEventListener('change', (event) => {
      if (event.target === eventCategoryInput) {
        clearFieldError(eventCategoryInput, 'eventCategoryError');
      }
      if (event.target === eventCategoryInput || event.target === eventStatusInput) {
        updateEventPreview();
      }
    });

    eventForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (isPublishingEvent) return;

      const title = eventTitleInput ? eventTitleInput.value.trim() : '';
      const category = eventCategoryInput ? eventCategoryInput.value.trim() : '';
      const description = eventDescriptionInput ? eventDescriptionInput.value.trim() : '';
      const date = eventDateInput ? eventDateInput.value.trim() : '';
      const time = eventTimeInput ? eventTimeInput.value.trim() : '';
      const venue = eventVenueInput ? eventVenueInput.value.trim() : '';
      const registrationLink = eventRegLinkInput ? eventRegLinkInput.value.trim() : '';
      let isValid = true;

      if (!title) {
        setFieldError(eventTitleInput, 'eventTitleError', 'Please enter an event title.');
        isValid = false;
      } else if (title.length < 4) {
        setFieldError(eventTitleInput, 'eventTitleError', 'The title should be at least 4 characters long.');
        isValid = false;
      }

      if (!category) {
        setFieldError(eventCategoryInput, 'eventCategoryError', 'Please choose an event category/track.');
        isValid = false;
      }

      if (!description) {
        setFieldError(eventDescriptionInput, 'eventDescriptionError', 'Please write a short description for the event.');
        isValid = false;
      } else if (description.length < 10) {
        setFieldError(eventDescriptionInput, 'eventDescriptionError', 'Please add a little more detail (at least 10 characters).');
        isValid = false;
      } else if (description.length > 220) {
        setFieldError(eventDescriptionInput, 'eventDescriptionError', 'Keep the description short — 220 characters maximum.');
        isValid = false;
      }

      if (!date) {
        setFieldError(eventDateInput, 'eventDateError', 'Please enter the event date (e.g., Wed, Oct 14).');
        isValid = false;
      }

      if (!time) {
        setFieldError(eventTimeInput, 'eventTimeError', 'Please enter the event time (e.g., 2:00 PM - 2:30 PM).');
        isValid = false;
      }

      if (!venue) {
        setFieldError(eventVenueInput, 'eventVenueError', 'Please enter the event venue.');
        isValid = false;
      }

      if (!registrationLink) {
        setFieldError(eventRegLinkInput, 'eventRegLinkError', 'Please provide the registration link for the RSVP button.');
        isValid = false;
      } else if (!isValidHttpUrl(registrationLink)) {
        setFieldError(eventRegLinkInput, 'eventRegLinkError', 'Please enter a valid URL starting with http:// or https://.');
        isValid = false;
      }

      if (!isValid) {
        const firstInvalid = eventForm.querySelector('.has-error .form-control');
        if (firstInvalid) firstInvalid.focus();
        showFormStatus('Please complete the highlighted fields before publishing.', true, eventFormStatus);
        return;
      }

      if (!currentUser) {
        showFormStatus('Your session has expired. Please sign in again.', true, eventFormStatus);
        return;
      }

      isPublishingEvent = true;
      const wasEditingEvent = Boolean(editingEventId);

      try {
        const status = normalizeEventStatus(eventStatusInput ? eventStatusInput.value : 'open');

        /* --------------------------------------------------------------
           Step 1 — upload the poster to ImgBB (only when one is chosen).
           The public display_url is what we store in Firestore; the binary
           never touches Firebase Storage, so there is nothing to bill.

           While editing, the poster already saved on the document is kept
           unless the admin picked a new file (replace) or pressed remove
           (delete the field on save).
           -------------------------------------------------------------- */
        let posterUrl = wasEditingEvent ? (editingPosterUrl || '') : '';
        const posterReplaced = Boolean(getSelectedPoster());
        const posterFile = getSelectedPoster();

        if (posterFile) {
          // Re-check at submit time: never send a rejected/oversized file to
          // ImgBB just because it slipped in through drag & drop.
          const posterProblem = validatePosterFile(posterFile);
          if (posterProblem) {
            markPosterError(posterProblem);
            showFormStatus(posterProblem, true, eventFormStatus);
            return;
          }

          setEventPublishing(true, 'Uploading poster…');
          showFormStatus('Uploading poster…', false, eventFormStatus);

          try {
            posterUrl = await uploadPosterToImgBB(posterFile);
          } catch (uploadError) {
            console.error('[ELLS] Poster upload failed:', uploadError);
            showFormStatus(describePosterError(uploadError), true, eventFormStatus);
            markPosterError(describePosterError(uploadError));
            return;
          }

          showFormStatus('Poster uploaded — saving event…', false, eventFormStatus);
          clearPosterError();
        }

        /* Step 2 — create or update the event document. */
        setEventPublishing(true, wasEditingEvent ? 'Saving…' : 'Publishing…');

        const eventDoc = {
          title,
          category,
          description,
          date,
          time,
          venue,
          registrationLink,
          status
        };

        if (wasEditingEvent) {
          /* UPDATE in place. createdAt is omitted on purpose so the original
             publish time survives; the author comes from the snapshot so
             either admin can edit either document. */
          eventDoc.updatedAt = serverTimestamp();
          eventDoc.authorEmail = (editingEvent && editingEvent.authorEmail) || currentUser.email || null;
          eventDoc.authorUid = (editingEvent && editingEvent.authorUid) || currentUser.uid;

          if (posterUrl) {
            eventDoc.posterUrl = posterUrl;
          } else if (!posterReplaced) {
            /* No new file and no saved poster left → remove the field entirely
               (firestore.rules rejects an empty string). */
            eventDoc.posterUrl = deleteField();
          }

          const savedId = editingEventId;
          await updateDoc(doc(db, EVENTS_COLLECTION, savedId), eventDoc);

          exitEventEditMode();
          showFormStatus('Event updated — the public Events page now shows the new details.', false, eventFormStatus);
          flashLiveItem('event', savedId);
        } else {
          eventDoc.createdAt = serverTimestamp();
          eventDoc.authorEmail = currentUser.email || null;
          eventDoc.authorUid = currentUser.uid;

          // Omitted entirely when no poster was chosen — firestore.rules treats
          // the field as optional and validates it as an https URL when present.
          if (posterUrl) eventDoc.posterUrl = posterUrl;

          await addDoc(collection(db, EVENTS_COLLECTION), eventDoc);

          // The live onSnapshot() subscription refreshes the list automatically.
          resetEventForm();
          showFormStatus(
            posterUrl
              ? 'Event published with its poster — it is now live on the public Events page.'
              : 'Event published — it is now live on the public Events page.',
            false,
            eventFormStatus
          );
        }
      } catch (error) {
        console.error('[ELLS] Publishing event failed:', error);
        showFormStatus(describeFirestoreError(error), true, eventFormStatus);
      } finally {
        isPublishingEvent = false;
        setEventPublishing(false);
      }
    });

    if (cancelEventEditBtn) {
      cancelEventEditBtn.addEventListener('click', () => exitEventEditMode());
    }

    /* ------------------------------------------------------------------
       Poster picker — live thumbnail, validation and removal.
       ------------------------------------------------------------------ */
    if (eventPosterInput) {
      eventPosterInput.addEventListener('change', () => {
        clearPosterError();
        const file = getSelectedPoster();
        if (!file) {
          clearPosterSelection();
          return;
        }

        const problem = validatePosterFile(file);
        if (problem) {
          markPosterError(problem);
          clearPosterSelection();
          return;
        }

        previewPosterSelection(file);
      });
    }

    if (removeEventPosterBtn) {
      removeEventPosterBtn.addEventListener('click', (event) => {
        event.preventDefault();
        clearPosterSelection();
        clearPosterError();
        if (eventPosterInput) eventPosterInput.focus();
      });
    }

    // Drag & drop support on the drop zone
    if (eventPosterDrop && eventPosterInput) {
      ['dragenter', 'dragover'].forEach((type) => {
        eventPosterDrop.addEventListener(type, (event) => {
          event.preventDefault();
          eventPosterDrop.classList.add('is-dragging');
        });
      });

      ['dragleave', 'drop'].forEach((type) => {
        eventPosterDrop.addEventListener(type, () => {
          eventPosterDrop.classList.remove('is-dragging');
        });
      });

      eventPosterDrop.addEventListener('drop', (event) => {
        event.preventDefault();
        const file = event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0];
        if (!file) return;

        const problem = validatePosterFile(file);
        if (problem) {
          markPosterError(problem);
          clearPosterSelection();
          return;
        }

        // Browsers do not let us set input.files from a drop, so remember the
        // dropped file separately and use it when the form is submitted.
        droppedPosterFile = file;
        clearPosterError();
        previewPosterSelection(file);
      });
    }

    eventForm.addEventListener('reset', () => {
      // The reset button doubles as "leave edit mode" — otherwise a reset form
      // would still update the document it was loaded from.
      exitEventEditMode({ keepFields: true });
      window.setTimeout(() => {
        clearPosterSelection();
        clearPosterError();
        if (eventStatusInput) eventStatusInput.value = 'open';
        updateEventCounter();
        updateEventPreview();
        clearFieldError(eventTitleInput, 'eventTitleError');
        clearFieldError(eventCategoryInput, 'eventCategoryError');
        clearFieldError(eventDescriptionInput, 'eventDescriptionError');
        clearFieldError(eventDateInput, 'eventDateError');
        clearFieldError(eventTimeInput, 'eventTimeError');
        clearFieldError(eventVenueInput, 'eventVenueError');
        clearFieldError(eventRegLinkInput, 'eventRegLinkError');
        if (eventFormStatus) {
          eventFormStatus.classList.remove('is-visible', 'is-error');
          eventFormStatus.textContent = '';
        }
      }, 0);
    });
  }

  function resetEventForm() {
    if (eventTitleInput) eventTitleInput.value = '';
    if (eventCategoryInput) eventCategoryInput.value = '';
    if (eventDescriptionInput) eventDescriptionInput.value = '';
    if (eventDateInput) eventDateInput.value = '';
    if (eventTimeInput) eventTimeInput.value = '';
    if (eventVenueInput) eventVenueInput.value = '';
    if (eventRegLinkInput) eventRegLinkInput.value = '';
    if (eventStatusInput) eventStatusInput.value = 'open';
    clearPosterSelection();
    clearPosterError();
    updateEventCounter();
    updateEventPreview();
    clearFieldError(eventTitleInput, 'eventTitleError');
    clearFieldError(eventCategoryInput, 'eventCategoryError');
    clearFieldError(eventDescriptionInput, 'eventDescriptionError');
    clearFieldError(eventDateInput, 'eventDateError');
    clearFieldError(eventTimeInput, 'eventTimeError');
    clearFieldError(eventVenueInput, 'eventVenueError');
    clearFieldError(eventRegLinkInput, 'eventRegLinkError');
    if (eventTitleInput) eventTitleInput.focus();
  }

  function setEventPublishing(isBusy, busyLabel) {
    if (!publishEventBtn) return;
    publishEventBtn.disabled = isBusy;
    publishEventBtn.classList.toggle('is-loading', isBusy);
    const label = publishEventBtn.querySelector('span');
    if (label) {
      label.textContent = isBusy
        ? (busyLabel || 'Publishing…')
        : (editingEventId ? 'Save Changes' : 'Publish Event');
    }
  }

  /* ======================================================================
     Event edit mode
     ====================================================================== */

  /** Loads an event document into the form so submit() updates it. */
  function startEventEdit(evt) {
    editingEventId = evt.id;
    editingEvent = evt;
    editingPosterUrl = evt.posterUrl || '';

    if (eventTitleInput) eventTitleInput.value = evt.title;
    if (eventCategoryInput) eventCategoryInput.value = evt.category;
    if (eventDescriptionInput) eventDescriptionInput.value = evt.description;
    if (eventDateInput) eventDateInput.value = evt.date;
    if (eventTimeInput) eventTimeInput.value = evt.time;
    if (eventVenueInput) eventVenueInput.value = evt.venue;
    if (eventRegLinkInput) eventRegLinkInput.value = evt.registrationLink;
    if (eventStatusInput) eventStatusInput.value = normalizeEventStatus(evt.status);

    // A stale dropped file must never leak into a different event's edit.
    droppedPosterFile = null;
    if (eventPosterInput) eventPosterInput.value = '';

    clearPosterError();
    clearFieldError(eventTitleInput, 'eventTitleError');
    clearFieldError(eventCategoryInput, 'eventCategoryError');
    clearFieldError(eventDescriptionInput, 'eventDescriptionError');
    clearFieldError(eventDateInput, 'eventDateError');
    clearFieldError(eventTimeInput, 'eventTimeError');
    clearFieldError(eventVenueInput, 'eventVenueError');
    clearFieldError(eventRegLinkInput, 'eventRegLinkError');

    updateEventCounter();
    updateEventPreview();
    previewPosterSelection(null);

    if (publishEventBtn) {
      const label = publishEventBtn.querySelector('span');
      if (label) label.textContent = 'Save Changes';
    }
    if (cancelEventEditBtn) cancelEventEditBtn.hidden = false;
    if (eventForm) eventForm.classList.add('is-editing');

    const heading = document.getElementById('addEventHeading');
    if (heading) heading.textContent = 'Edit Event';

    if (eventTitleInput) eventTitleInput.focus();
    if (eventForm) eventForm.scrollIntoView({ behavior: 'smooth', block: 'center' });
    showFormStatus('Editing an existing event — saving will update it, not create a duplicate.', false, eventFormStatus);
    markEditingRow('event', evt.id);
  }

  /** Leaves edit mode without touching Firestore. */
  function exitEventEditMode(options = {}) {
    editingEventId = '';
    editingEvent = null;
    editingPosterUrl = '';

    if (publishEventBtn) {
      const label = publishEventBtn.querySelector('span');
      if (label) label.textContent = 'Publish Event';
    }
    if (cancelEventEditBtn) cancelEventEditBtn.hidden = true;
    if (eventForm) eventForm.classList.remove('is-editing');

    const heading = document.getElementById('addEventHeading');
    if (heading) heading.textContent = 'Add New Event';

    if (!options.keepFields) resetEventForm();
    if (eventFormStatus) {
      eventFormStatus.classList.remove('is-visible', 'is-error');
      eventFormStatus.textContent = '';
    }
    markEditingRow('event', '');
  }

  /* ======================================================================
     Poster picker — validation, preview and ImgBB upload
     ====================================================================== */

  /** The poster the admin picked, whether via the picker or drag & drop. */
  function getSelectedPoster() {
    const picked = eventPosterInput && eventPosterInput.files && eventPosterInput.files[0];
    return picked || droppedPosterFile || null;
  }

  /** Returns a human message when the file is unacceptable, otherwise ''. */
  function validatePosterFile(file) {
    const type = String(file.type || '').toLowerCase();
    const name = String(file.name || '');
    const looksLikeImage = /\.(jpe?g|png)$/i.test(name);

    if (!POSTER_MIME_TYPES.includes(type) && !(looksLikeImage && !type)) {
      return 'Please choose a JPG or PNG image. Other formats are not supported.';
    }

    if (!/\.(jpe?g|png)$/i.test(name) && !POSTER_MIME_TYPES.includes(type)) {
      return 'Please choose a JPG or PNG image.';
    }

    if (file.size > POSTER_MAX_BYTES) {
      return `That image is ${formatFileSize(file.size)} — the maximum is ${formatFileSize(POSTER_MAX_BYTES)}.`;
    }

    if (file.size === 0) {
      return 'That file appears to be empty. Please choose another image.';
    }

    return '';
  }

  function formatFileSize(bytes) {
    if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }

  /** Shows the chosen image inside the picker and in the live preview. */
  function previewPosterSelection(file) {
    if (eventPosterObjectUrl) {
      URL.revokeObjectURL(eventPosterObjectUrl);
      eventPosterObjectUrl = '';
    }

    if (file) eventPosterObjectUrl = URL.createObjectURL(file);

    /* A newly chosen file wins. Otherwise, while editing, keep showing the
       poster already stored on the document until the admin removes it. */
    const previewSrc = eventPosterObjectUrl || (editingEventId ? editingPosterUrl : '');
    const hasPoster = Boolean(previewSrc);

    if (eventPosterThumb) {
      if (hasPoster) {
        eventPosterThumb.src = previewSrc;
        eventPosterThumb.hidden = false;
      } else {
        eventPosterThumb.removeAttribute('src');
        eventPosterThumb.hidden = true;
      }
    }

    if (eventPosterIcon) eventPosterIcon.hidden = hasPoster;
    if (eventPosterDrop) eventPosterDrop.classList.toggle('has-file', hasPoster);
    if (removeEventPosterBtn) removeEventPosterBtn.hidden = !hasPoster;

    if (eventPosterLabel) {
      if (file) eventPosterLabel.textContent = 'Poster selected';
      else if (hasPoster) eventPosterLabel.textContent = 'Current poster';
      else eventPosterLabel.textContent = 'Choose a poster image';
    }

    if (eventPosterFileName) {
      if (file) eventPosterFileName.textContent = `${file.name} · ${formatFileSize(file.size)}`;
      else if (hasPoster) eventPosterFileName.textContent = 'Saved on ImgBB — choose a file to replace it';
      else eventPosterFileName.textContent = 'PNG or JPG, square images look best';
    }

    if (eventPreviewPoster && eventPreviewPosterWrap) {
      if (hasPoster) {
        eventPreviewPoster.src = previewSrc;
        eventPreviewPosterWrap.hidden = false;
      } else {
        eventPreviewPoster.removeAttribute('src');
        eventPreviewPosterWrap.hidden = true;
      }
    }
  }

  /** Drops the selection (keeps the rest of the form untouched).
      While editing, this also schedules the saved poster for removal. */
  function clearPosterSelection() {
    if (eventPosterInput) eventPosterInput.value = '';
    droppedPosterFile = null;
    editingPosterUrl = '';
    previewPosterSelection(null);
    if (eventPosterDrop) eventPosterDrop.classList.remove('is-dragging', 'has-file');
  }

  function markPosterError(message) {
    if (eventPosterInput) setFieldError(eventPosterInput, 'eventPosterFileError', message);
    if (eventPosterDrop) eventPosterDrop.classList.add('has-error');
  }

  function clearPosterError() {
    if (eventPosterInput) clearFieldError(eventPosterInput, 'eventPosterFileError');
    if (eventPosterDrop) eventPosterDrop.classList.remove('has-error');
  }

  /* ======================================================================
     Event rendering (live list)
     ====================================================================== */

  function renderEvents(state) {
    if (!publishedEventList) return;

    publishedEventList.querySelectorAll('.admin-live-item').forEach((item) => item.remove());
    publishedEventList.classList.toggle('is-loading', state === 'loading');

    if (state === 'loading' || state === 'error') {
      if (publishedEventEmpty) {
        publishedEventEmpty.hidden = false;
        publishedEventEmpty.textContent = state === 'loading'
          ? 'Loading events from Firestore…'
          : 'The event feed is unavailable right now. Check your Firestore rules and connection.';
      }
      if (publishedEventCount) publishedEventCount.textContent = '–';
      if (adminEventTotal) adminEventTotal.textContent = '–';
      return;
    }

    if (publishedEventCount) publishedEventCount.textContent = String(events.length);
    if (adminEventTotal) adminEventTotal.textContent = String(events.length);

    if (publishedEventEmpty) {
      publishedEventEmpty.hidden = events.length > 0;
      publishedEventEmpty.textContent = 'No events published yet. Your entries will appear here.';
    }

    events.forEach((evt, index) => {
      publishedEventList.appendChild(buildEventRow(evt, index));
    });

    markEditingRow('event', editingEventId);
  }

  /** One row of the "Currently Live" event table: poster, title, date, status. */
  function buildEventRow(evt, index) {
    const item = document.createElement('li');
    item.className = 'admin-live-item admin-live-item--event';
    item.dataset.eventId = evt.id;

    const serial = document.createElement('span');
    serial.className = 'admin-live-item__serial';
    serial.textContent = formatSerial(index);

    /* Mini poster thumbnail — the ImgBB display_url saved on the document. */
    const thumbWrap = document.createElement('span');
    thumbWrap.className = 'admin-live-item__thumb';

    if (evt.posterUrl) {
      const img = document.createElement('img');
      img.src = evt.posterUrl;
      img.alt = '';
      img.loading = 'lazy';
      img.setAttribute('referrerpolicy', 'no-referrer');
      img.addEventListener('error', () => {
        thumbWrap.textContent = '';
        thumbWrap.classList.add('is-placeholder');
        thumbWrap.textContent = 'ELLS';
      }, { once: true });
      thumbWrap.appendChild(img);
    } else {
      thumbWrap.classList.add('is-placeholder');
      thumbWrap.textContent = 'ELLS';
    }

    const body = document.createElement('div');
    body.className = 'admin-live-item__body';

    const title = document.createElement('h4');
    title.className = 'admin-live-item__title';
    title.textContent = evt.title || 'Untitled event';

    const meta = document.createElement('p');
    meta.className = 'admin-live-item__meta';

    const when = document.createElement('time');
    when.textContent = [evt.date, evt.time].filter(Boolean).join(' • ') || 'Date not set';

    const dot = document.createElement('span');
    dot.className = 'admin-live-item__dot';
    dot.setAttribute('aria-hidden', 'true');
    dot.textContent = '•';

    const where = document.createElement('span');
    where.textContent = [evt.category, evt.venue].filter(Boolean).join(' · ') || 'Venue not set';

    const status = document.createElement('span');
    status.className = `admin-live-badge admin-live-badge--${evt.status}`;
    status.textContent = eventStatusLabel(evt.status);

    meta.append(when, dot, where, dot.cloneNode(true), status);

    body.append(title, meta);

    const actions = document.createElement('div');
    actions.className = 'admin-live-item__actions';
    actions.append(
      buildEditButton('event', evt, () => startEventEdit(evt)),
      buildDeleteButton('event', evt, (btn) => deleteEvent(evt, btn))
    );

    item.append(serial, thumbWrap, body, actions);
    return item;
  }

  /* ======================================================================
     Delete an event (Firestore rules allow this for the admin only)
     ====================================================================== */

  async function deleteEvent(evt, buttonEl) {
    const label = evt.title || 'this event';
    const confirmed = window.confirm(
      `Delete "${label}"?\n\n` +
      'It will be removed from Cloud Firestore and disappear from the public ' +
      'Events page immediately. This cannot be undone.'
    );
    if (!confirmed) return;

    if (buttonEl) buttonEl.disabled = true;

    try {
      await deleteDoc(doc(db, EVENTS_COLLECTION, evt.id));
      // onSnapshot() removes the row automatically.
      if (editingEventId === evt.id) exitEventEditMode();
      showFormStatus('Event deleted from the public Events page.', false, eventFormStatus);
    } catch (error) {
      console.error('[ELLS] Deleting event failed:', error);
      showFormStatus(describeFirestoreError(error), true, eventFormStatus);
      if (buttonEl) buttonEl.disabled = false;
    }
  }

  /* ======================================================================
     Event preview + small helpers
     ====================================================================== */

  function updateEventPreview() {
    if (!eventPreviewTitle || !eventPreviewDescription || !eventPreviewWhen) return;

    const title = eventTitleInput ? eventTitleInput.value.trim() : '';
    const category = eventCategoryInput ? eventCategoryInput.value.trim() : '';
    const description = eventDescriptionInput ? eventDescriptionInput.value.trim() : '';
    const date = eventDateInput ? eventDateInput.value.trim() : '';
    const time = eventTimeInput ? eventTimeInput.value.trim() : '';
    const venue = eventVenueInput ? eventVenueInput.value.trim() : '';
    const registrationLink = eventRegLinkInput ? eventRegLinkInput.value.trim() : '';

    if (eventPreviewBadge) eventPreviewBadge.textContent = category || 'Event';
    eventPreviewTitle.textContent = title || 'Your event title will appear here';
    eventPreviewWhen.textContent = [date, time].filter(Boolean).join(' • ') || 'Date & time not set';
    eventPreviewDescription.textContent = description ||
      'Add a title, category, and description to preview how this event will look to students.';
    if (eventPreviewVenue) eventPreviewVenue.textContent = venue ? `Venue: ${venue}` : 'Venue not set';

    const status = normalizeEventStatus(eventStatusInput ? eventStatusInput.value : 'open');
    if (eventPreviewLink) {
      if (status !== 'open') {
        eventPreviewLink.textContent = status === 'closed'
          ? 'Reg Now is disabled — Registration Closed'
          : 'Reg Now is disabled — Event Completed';
      } else {
        eventPreviewLink.textContent = registrationLink
          ? `RSVP → ${registrationLink}`
          : 'Registration link not set';
      }
    }
  }

  function updateEventCounter() {
    if (!eventDescCount || !eventDescriptionInput) return;
    eventDescCount.textContent = `${eventDescriptionInput.value.length} / ${eventDescriptionInput.maxLength}`;
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

  function showFormStatus(message, isError, statusEl) {
    const target = statusEl || formStatus;
    if (!target) return;
    target.textContent = message;
    target.classList.add('is-visible');
    target.classList.toggle('is-error', Boolean(isError));

    window.clearTimeout(target._hideTimer);
    target._hideTimer = window.setTimeout(() => {
      target.classList.remove('is-visible', 'is-error');
      target.textContent = '';
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
  updateEventCounter();
  updateEventPreview();
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

/* ---------------------------------------------------------------------------
   Event registration status
   ---------------------------------------------------------------------------
   'open'       → public button reads "Reg Now" and links out
   'closed'     → button is disabled and reads "Reg Closed"
   'completed'  → button is disabled and reads "Completed"
   Documents created before the field existed have no `status` key at all;
   they are treated as 'open'.
   --------------------------------------------------------------------------- */

const EVENT_STATUS_OPTIONS = ['open', 'closed', 'completed'];

const EVENT_STATUS_LABELS = {
  open: 'Registration Open',
  closed: 'Registration Closed',
  completed: 'Completed'
};

function normalizeEventStatus(value) {
  const raw = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return EVENT_STATUS_OPTIONS.includes(raw) ? raw : 'open';
}

function eventStatusLabel(status) {
  return EVENT_STATUS_LABELS[normalizeEventStatus(status)];
}

function isValidHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
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

/* =========================================================================
   ImgBB poster upload
   -------------------------------------------------------------------------
   POST https://api.imgbb.com/1/upload  (multipart/form-data)
     image → the file itself
     key   → the free ImgBB API key (see firebase-config.js)

   Success: { success: true, data: { display_url, url, … } }
   Failure: { success: false, status: 4xx, error: { message } }

   Only data.display_url is returned; the binary stays on ImgBB's CDN so no
   Firebase Storage bucket (and no billing) is involved.
   ========================================================================= */
async function uploadPosterToImgBB(file) {
  const formData = new FormData();
  formData.append('image', file, file.name);
  formData.append('key', IMGBB_API_KEY);

  let response;
  try {
    response = await fetch(IMGBB_UPLOAD_ENDPOINT, {
      method: 'POST',
      body: formData,
      // No mode/headers: the browser sets the multipart boundary itself and
      // ImgBB returns permissive CORS headers for browser uploads.
      redirect: 'follow'
    });
  } catch (networkError) {
    const error = new Error('network');
    error.cause = networkError;
    throw error;
  }

  let payload = null;
  try {
    payload = await response.json();
  } catch (parseError) {
    payload = null;
  }

  if (!response.ok || !payload || payload.success === false) {
    const error = new Error('rejected');
    error.status = response.status;
    error.apiMessage = payload && payload.error && payload.error.message;
    throw error;
  }

  const url = payload.data && (payload.data.display_url || payload.data.url);
  if (!url || !/^https?:\/\//i.test(url)) {
    throw new Error('no-url');
  }

  return url;
}

function describePosterError(error) {
  if (!error) return 'The poster could not be uploaded. Please try again.';
  if (error.message === 'network') {
    return 'Could not reach ImgBB. Check your internet connection and try again.';
  }
  if (error.status === 400) {
    return 'ImgBB rejected the image. Try a different JPG or PNG file.';
  }
  if (error.status === 413) {
    return 'That image is too large for ImgBB. Please choose a smaller file.';
  }
  if (error.status === 429) {
    return 'Too many uploads right now. Wait a minute and try again.';
  }
  if (error.status === 401 || error.status === 403) {
    return 'The ImgBB API key was rejected. Update IMGBB_API_KEY in firebase-config.js.';
  }
  if (error.message === 'no-url') {
    return 'ImgBB accepted the upload but returned no image URL. Please try again.';
  }
  return 'The poster could not be uploaded. Please try again.';
}

function describeFirestoreError(error) {
  const code = error && error.code ? error.code : '';

  switch (code) {
    case 'permission-denied':
      return 'Firestore blocked this action. Only an authorised ELLS admin account (see firestore.rules) may change notices or events.';
    case 'unavailable':
      return 'Cloud Firestore is unreachable right now. Check your connection and try again.';
    case 'failed-precondition':
      return 'Firestore needs an index for this query. Check the browser console for the setup link.';
    default:
      return 'The entry could not be saved. Please try again.';
  }
}
