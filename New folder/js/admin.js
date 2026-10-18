/**
 * ELLS Club — IT Secretary Admin Console (UI/UX only)
 * ---------------------------------------------------------------------------
 * This module powers the login screen and the notice-management dashboard in
 * admin.html. Authentication here is a LOCAL DEMO only — replace
 * ELLS_ADMIN_DEMO_CREDENTIALS and the session helpers with real server-side
 * authentication when the backend is connected.
 *
 * Backend integration points are marked with "BACKEND:" comments.
 * ---------------------------------------------------------------------------
 */

const ELLS_ADMIN_DEMO_CREDENTIALS = {
  username: 'it.secretary',
  password: 'ells@2026'
};

const ELLS_ADMIN_SESSION_KEY = 'ells-admin-session';
const ELLS_ADMIN_NOTICES_KEY = 'ells-admin-notice-queue';

document.addEventListener('DOMContentLoaded', initAdminConsole);

function initAdminConsole() {
  const loginView = document.getElementById('adminLoginView');
  const dashboard = document.getElementById('adminDashboard');
  const loginForm = document.getElementById('adminLoginForm');

  if (!loginView || !dashboard || !loginForm) return;

  const loginError = document.getElementById('adminLoginError');
  const loginBtn = document.getElementById('adminLoginBtn');
  const loginBtnLabel = loginBtn ? loginBtn.querySelector('.admin-submit__label') : null;
  const usernameInput = document.getElementById('adminUsername');
  const passwordInput = document.getElementById('adminPassword');
  const passwordToggle = document.getElementById('passwordToggle');
  const rememberInput = document.getElementById('rememberSession');
  const logoutBtn = document.getElementById('adminLogoutBtn');

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

  let notices = [];

  /* ------------------------------------------------------------------------
     Session
     ------------------------------------------------------------------------ */
  function readSession() {
    try {
      const raw = sessionStorage.getItem(ELLS_ADMIN_SESSION_KEY) ||
                  localStorage.getItem(ELLS_ADMIN_SESSION_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (error) {
      return null;
    }
  }

  function saveSession(remember) {
    const payload = JSON.stringify({
      username: ELLS_ADMIN_DEMO_CREDENTIALS.username,
      role: 'IT Secretary',
      signedInAt: new Date().toISOString()
    });

    try {
      // Clear the other storage so a stale session cannot linger.
      sessionStorage.removeItem(ELLS_ADMIN_SESSION_KEY);
      localStorage.removeItem(ELLS_ADMIN_SESSION_KEY);
      (remember ? localStorage : sessionStorage).setItem(ELLS_ADMIN_SESSION_KEY, payload);
    } catch (error) {
      /* Storage blocked: the dashboard still opens for this page view. */
    }
  }

  function clearSession() {
    try {
      sessionStorage.removeItem(ELLS_ADMIN_SESSION_KEY);
      localStorage.removeItem(ELLS_ADMIN_SESSION_KEY);
    } catch (error) {
      /* no-op */
    }
  }

  /* ------------------------------------------------------------------------
     Login
     ------------------------------------------------------------------------ */
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
      loginBtnLabel.textContent = isLoading ? 'Verifying...' : 'Sign In Securely';
    }
  }

  loginForm.addEventListener('submit', (event) => {
    event.preventDefault();
    clearLoginError();

    const username = usernameInput.value.trim().toLowerCase();
    const password = passwordInput.value;

    if (!username || !password) {
      showLoginError('Please enter both your username and password.');
      (!username ? usernameInput : passwordInput).focus();
      return;
    }

    setLoginLoading(true);

    // BACKEND: replace this demo check with a POST to the authentication API.
    window.setTimeout(() => {
      const isValid =
        username === ELLS_ADMIN_DEMO_CREDENTIALS.username &&
        password === ELLS_ADMIN_DEMO_CREDENTIALS.password;

      setLoginLoading(false);

      if (!isValid) {
        showLoginError('Incorrect username or password. Please try again.');
        passwordInput.value = '';
        passwordInput.focus();
        return;
      }

      saveSession(Boolean(rememberInput && rememberInput.checked));
      openDashboard();
    }, 500);
  });

  [usernameInput, passwordInput].forEach((input) => {
    input.addEventListener('input', clearLoginError);
  });

  function openDashboard() {
    loginView.hidden = true;
    dashboard.hidden = false;
    document.title = 'IT Secretary Console | ELLS Club';
    updateSkipLinkTarget();

    const today = todayISO();
    if (adminToday) {
      adminToday.textContent = formatDate(today);
    }
    if (dateInput && !dateInput.value) {
      dateInput.value = today;
    }

    loadNotices();
    updatePreview();

    // Move focus into the dashboard for keyboard and screen-reader users.
    const heading = dashboard.querySelector('.admin-main__head h1');
    if (heading) {
      heading.setAttribute('tabindex', '-1');
      heading.focus({ preventScroll: true });
    }
  }

  function openLogin() {
    dashboard.hidden = true;
    loginView.hidden = false;
    document.title = 'IT Secretary Console | ELLS Club';
    updateSkipLinkTarget();

    loginForm.reset();
    clearLoginError();
    resetPasswordVisibility();
    usernameInput.focus();
  }

  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      clearSession();
      openLogin();
    });
  }

  /* ------------------------------------------------------------------------
     Password visibility toggle
     ------------------------------------------------------------------------ */
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

  /* ------------------------------------------------------------------------
     Notice form
     ------------------------------------------------------------------------ */
  function todayISO() {
    const now = new Date();
    const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 10);
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
    const group = input.closest('.form-group');
    if (group) group.classList.remove('has-error');
    const error = document.getElementById(errorId);
    if (error) error.textContent = '';
    input.removeAttribute('aria-invalid');
  }

  function setFieldError(input, errorId, message) {
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
      formStatus.classList.remove('is-visible');
      formStatus.textContent = '';
    }, 5000);
  }

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

    noticeForm.addEventListener('submit', (event) => {
      event.preventDefault();

      const title = titleInput.value.trim();
      const date = dateInput.value;
      const description = descriptionInput.value.trim();
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

      const notice = {
        id: `notice-${Date.now()}`,
        title,
        date,
        description,
        createdAt: new Date().toISOString()
      };

      notices.unshift(notice);
      saveNotices();
      renderNotices();

      // BACKEND: POST `notice` to the notices API here, then refresh from server.
      // Clear the fields manually (instead of form.reset()) so the reset
      // listener does not erase the success message that follows.
      if (titleInput) titleInput.value = '';
      if (descriptionInput) descriptionInput.value = '';
      if (dateInput) dateInput.value = todayISO();
      updateCounter();
      updatePreview();
      clearFieldError(titleInput, 'noticeTitleError');
      clearFieldError(dateInput, 'noticeDateError');
      clearFieldError(descriptionInput, 'noticeDescriptionError');
      showFormStatus('Notice added to this session\'s preview queue.', false);
      if (titleInput) titleInput.focus();
    });

    noticeForm.addEventListener('reset', () => {
      window.setTimeout(() => {
        if (dateInput) dateInput.value = todayISO();
        updateCounter();
        updatePreview();
        [titleInput, dateInput, descriptionInput].forEach((input) => {
          if (input) {
            const errorId = `${input.id}Error`;
            clearFieldError(input, errorId);
          }
        });
        if (formStatus) {
          formStatus.classList.remove('is-visible', 'is-error');
          formStatus.textContent = '';
        }
      }, 0);
    });
  }

  /* ------------------------------------------------------------------------
     Notice queue (session preview only)
     ------------------------------------------------------------------------ */
  function loadNotices() {
    let stored = [];
    try {
      stored = JSON.parse(sessionStorage.getItem(ELLS_ADMIN_NOTICES_KEY) || '[]');
    } catch (error) {
      stored = [];
    }

    notices = Array.isArray(stored)
      ? stored.filter((notice) => notice && notice.title && notice.date && notice.description)
      : [];

    renderNotices();
  }

  function saveNotices() {
    try {
      sessionStorage.setItem(ELLS_ADMIN_NOTICES_KEY, JSON.stringify(notices.slice(0, 25)));
    } catch (error) {
      /* Storage unavailable — the queue still lives in memory. */
    }
  }

  function renderNotices() {
    if (!publishedList) return;

    publishedList.querySelectorAll('.admin-notice-item').forEach((item) => item.remove());

    if (publishedCount) {
      publishedCount.textContent = String(notices.length);
    }

    if (publishedEmpty) {
      publishedEmpty.hidden = notices.length > 0;
    }

    notices.forEach((notice) => {
      const item = document.createElement('li');
      item.className = 'admin-notice-item';
      item.dataset.noticeId = notice.id;

      const body = document.createElement('div');
      body.className = 'admin-notice-item__body';

      const title = document.createElement('h4');
      title.textContent = notice.title;

      const time = document.createElement('time');
      time.dateTime = notice.date;
      time.textContent = formatDate(notice.date);

      const description = document.createElement('p');
      description.textContent = notice.description;

      body.append(title, time, description);

      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'admin-notice-item__remove';
      remove.setAttribute('aria-label', `Remove notice: ${notice.title}`);
      remove.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';

      remove.addEventListener('click', () => {
        notices = notices.filter((entry) => entry.id !== notice.id);
        saveNotices();
        renderNotices();
      });

      item.append(body, remove);
      publishedList.appendChild(item);
    });
  }

  /* ------------------------------------------------------------------------
     Boot
     ------------------------------------------------------------------------ */
  updateCounter();
  updatePreview();

  const existingSession = readSession();
  if (existingSession) {
    openDashboard();
  } else {
    dashboard.hidden = true;
    loginView.hidden = false;
  }

  function updateSkipLinkTarget() {
    const skipLink = document.querySelector('.skip-link');
    if (!skipLink) return;
    skipLink.setAttribute('href', dashboard.hidden ? '#adminMain' : '#adminDashboardMain');
  }
}
