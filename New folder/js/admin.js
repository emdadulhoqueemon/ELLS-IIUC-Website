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
 *   • Live list  → onSnapshot() mirrors what the public homepage shows
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
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  setPersistence,
  browserLocalPersistence,
  browserSessionPersistence,
  addDoc,
  collection,
  deleteDoc,
  doc,
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

  let unsubscribeNotices = null;
  let unsubscribeEvents = null;
  let currentUser = null;
  let isPublishing = false;
  let isPublishingEvent = false;
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
            registrationLink: typeof data.registrationLink === 'string' ? data.registrationLink.trim() : ''
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

      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'admin-notice-item__remove';
      remove.title = 'Delete notice';
      remove.setAttribute('aria-label', `Delete notice: ${notice.title || 'Untitled notice'}`);
      remove.innerHTML =
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
        'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
        '<line x1="18" y1="6" x2="6" y2="18"></line>' +
        '<line x1="6" y1="6" x2="18" y2="18"></line></svg>';
      remove.addEventListener('click', () => deleteNotice(notice, remove));

      item.append(body, remove);
      publishedList.appendChild(item);
    });
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
      setEventPublishing(true);

      try {
        await addDoc(collection(db, EVENTS_COLLECTION), {
          title,
          category,
          description,
          date,
          time,
          venue,
          registrationLink,
          createdAt: serverTimestamp(),
          authorEmail: currentUser.email || null,
          authorUid: currentUser.uid
        });

        // The live onSnapshot() subscription refreshes the list automatically.
        resetEventForm();
        showFormStatus('Event published — it is now live on the public Events page.', false, eventFormStatus);
      } catch (error) {
        console.error('[ELLS] Publishing event failed:', error);
        showFormStatus(describeFirestoreError(error), true, eventFormStatus);
      } finally {
        isPublishingEvent = false;
        setEventPublishing(false);
      }
    });

    eventForm.addEventListener('reset', () => {
      window.setTimeout(() => {
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

  function setEventPublishing(isBusy) {
    if (!publishEventBtn) return;
    publishEventBtn.disabled = isBusy;
    publishEventBtn.classList.toggle('is-loading', isBusy);
    const label = publishEventBtn.querySelector('span');
    if (label) label.textContent = isBusy ? 'Publishing…' : 'Publish Event';
  }

  /* ======================================================================
     Event rendering (live list)
     ====================================================================== */

  function renderEvents(state) {
    if (!publishedEventList) return;

    publishedEventList.querySelectorAll('.admin-notice-item').forEach((item) => item.remove());

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

    events.forEach((evt) => {
      const item = document.createElement('li');
      item.className = 'admin-notice-item';
      item.dataset.eventId = evt.id;

      const body = document.createElement('div');
      body.className = 'admin-notice-item__body';

      const title = document.createElement('h4');
      title.textContent = evt.title || 'Untitled event';

      const time = document.createElement('time');
      time.textContent = [evt.date, evt.time].filter(Boolean).join(' • ') || 'Date not set';

      const description = document.createElement('p');
      description.textContent = [evt.category, evt.venue].filter(Boolean).join(' · ');

      body.append(title, time, description);

      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'admin-notice-item__remove';
      remove.title = 'Delete event';
      remove.setAttribute('aria-label', `Delete event: ${evt.title || 'Untitled event'}`);
      remove.innerHTML =
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
        'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
        '<line x1="18" y1="6" x2="6" y2="18"></line>' +
        '<line x1="6" y1="6" x2="18" y2="18"></line></svg>';
      remove.addEventListener('click', () => deleteEvent(evt, remove));

      item.append(body, remove);
      publishedEventList.appendChild(item);
    });
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
    if (eventPreviewLink) {
      eventPreviewLink.textContent = registrationLink
        ? `RSVP → ${registrationLink}`
        : 'Registration link not set';
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
