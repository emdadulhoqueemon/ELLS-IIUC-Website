/**
 * ELLS Club - Membership Application Module
 * Multi-step wizard, interactive validation, word counter, and digital pass generation
 */

document.addEventListener('DOMContentLoaded', () => {
  initMembershipViews();
  initMembershipWizard();
  checkExistingMembership();
  initMemberRecordSearch();
});

/* ==========================================================================
   Membership Views — Status Check vs. 4-Step Application
   --------------------------------------------------------------------------
   Both sections live in the page at the same time:
     • #membershipStatusCheck   → the Student ID lookup (Google Apps Script)
     • #applicationFormCard     → the restored 4-step wizard + certificate

   They are two panes of one switch. With JavaScript disabled both stay
   visible and simply stack, so nothing is ever lost. Deep links work too:
     membership.html#membershipStatusCheck  → status pane
     membership.html#applicationFormCard    → application pane
   ========================================================================== */
function initMembershipViews() {
  const switchEl = document.querySelector('.membership-switch');
  const panels = Array.from(document.querySelectorAll('.membership-panel'));
  if (!panels.length) return;

  const tabs = Array.from(
    (switchEl || document).querySelectorAll('[role="tab"][data-membership-target]')
  );
  const triggers = Array.from(document.querySelectorAll('[data-membership-target]'));

  const STATUS_PANEL = 'membershipStatusCheck';
  const APPLY_PANEL = 'applicationFormCard';

  function resolvePanelId(raw) {
    const id = String(raw || '').replace(/^#/, '').trim();
    if (id === APPLY_PANEL || id === 'membershipApplyPanel' || id === 'applyMembershipToggle') {
      return APPLY_PANEL;
    }
    if (id === STATUS_PANEL) return STATUS_PANEL;
    return '';
  }

  function activate(panelId, options) {
    const id = resolvePanelId(panelId) || STATUS_PANEL;
    const target = document.getElementById(id);

    panels.forEach(panel => {
      const isActive = panel === target;
      panel.hidden = !isActive;
      panel.classList.toggle('is-active', isActive);
      panel.setAttribute('aria-hidden', String(!isActive));
      // Restore a pane that a previous flow (e.g. the generated certificate)
      // hid with an inline style.
      if (isActive) panel.style.removeProperty('display');
    });

    tabs.forEach(tab => {
      const isActive = tab.getAttribute('data-membership-target') === id;
      tab.setAttribute('aria-selected', String(isActive));
      tab.setAttribute('tabindex', isActive ? '0' : '-1');
    });

    if (options && options.scroll && target) {
      const headerOffset = 92;
      const top = target.getBoundingClientRect().top + window.pageYOffset - headerOffset;
      window.scrollTo({ top: Math.max(top, 0), behavior: 'smooth' });
    }
  }

  triggers.forEach(el => {
    el.addEventListener('click', event => {
      const id = resolvePanelId(el.getAttribute('data-membership-target'));
      if (!id) return;
      event.preventDefault();
      // Keep focus on the control that was activated (WAI-ARIA tabs pattern);
      // only the pane visibility and scroll position change.
      activate(id, { scroll: true });
    });
  });

  // Arrow-key navigation between the two tabs (WAI-ARIA tabs pattern).
  if (switchEl) {
    switchEl.addEventListener('keydown', event => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault();
      const current = tabs.findIndex(tab => tab.getAttribute('aria-selected') === 'true');
      const delta = event.key === 'ArrowRight' ? 1 : -1;
      const next = tabs[(current + delta + tabs.length) % tabs.length];
      if (next) {
        activate(next.getAttribute('data-membership-target'));
        next.focus();
      }
    });
  }

  function activateFromHash() {
    const id = resolvePanelId(window.location.hash);
    if (id) activate(id, { scroll: true });
  }

  // Default view: the Status Check. A deep link (from "Join ELLS" anywhere on
  // the site) switches straight to the application wizard instead.
  activateFromHash();
  if (!resolvePanelId(window.location.hash)) {
    activate(STATUS_PANEL);
  }
  window.addEventListener('hashchange', activateFromHash);
}

/* ==========================================================================
   Google Apps Script API Endpoint
   ---------------------------------------------------------------------------
   Deployed Google Apps Script Web App URL.
   Accepts a "studentId" query parameter and returns a flat JSON object with
   student membership details, e.g.:
     {"Student_ID":"N241038","Name":"Md. Emdadul Hoque","Semester":"6th",
      "Total_Fee":2000,"Paid":2000,"Due":0,"Status":"Eligible"}
   On error it returns:
     {"error": "Student ID not found in our records"}
   ========================================================================== */
const MEMBER_API_ENDPOINT = 'https://script.google.com/macros/s/AKfycbweVB7pfq9ZMDIl6WBDsfv4vbTL9Fcj0qGxGeH_ydsYi_RCUlYWcN6Qpjn6BC2nbcW7/exec';

/* ==========================================================================
   Safe local storage
   --------------------------------------------------------------------------
   Storage can be unavailable (private mode, blocked third-party storage,
   file:// previews). A failure must never stop the certificate from being
   generated, so every access is guarded.
   ========================================================================== */
const MEMBER_STORAGE_KEY = 'ells-member';

function readStoredMember() {
  try {
    const raw = window.localStorage ? window.localStorage.getItem(MEMBER_STORAGE_KEY) : null;
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    console.warn('[ELLS] Membership storage unavailable (read):', error);
    return null;
  }
}

function storeMember(memberData) {
  try {
    if (window.localStorage) {
      window.localStorage.setItem(MEMBER_STORAGE_KEY, JSON.stringify(memberData));
    }
  } catch (error) {
    console.warn('[ELLS] Membership storage unavailable (write):', error);
  }
}

function clearStoredMember() {
  try {
    if (window.localStorage) window.localStorage.removeItem(MEMBER_STORAGE_KEY);
  } catch (error) {
    console.warn('[ELLS] Membership storage unavailable (clear):', error);
  }
}

/* ==========================================================================
   Member Record Lookup (Google Apps Script API fetch)
   ---------------------------------------------------------------------------
   Fetches membership records from the Google Apps Script API. Uses
   { redirect: 'follow' } because Google Apps Script Web Apps respond to
   GET requests with a 302 redirect to the final served content. Without
   this flag the browser would surface the redirect as an opaque response
   and the JSON payload would never reach our .then() handler.
   ========================================================================== */
function initMemberRecordSearch() {
  const lookupForm = document.getElementById('memberLookupForm');
  const lookupInput = document.getElementById('memberLookupInput');
  const lookupBtn = document.getElementById('memberLookupBtn');
  const lookupBtnText = document.getElementById('memberLookupBtnText');
  const statusEl = document.getElementById('memberLookupStatus');
  const resultsEl = document.getElementById('memberLookupResults');

  if (!lookupForm || !lookupInput) return;

  lookupForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const query = lookupInput.value.trim();

    if (!query) {
      showSearchStatus(statusEl, 'Please enter your Student ID to search.', 'warning');
      resultsEl.innerHTML = '';
      return;
    }

    // Disable the button and show "Searching records..." loading state
    setLookupLoading(true);
    showSearchStatus(statusEl, 'Searching records...', 'loading');
    resultsEl.innerHTML = '';

    searchMemberRecords(query)
      .then(data => {
        // ── Handle API-level error response ──
        // The Apps Script returns {"error": "..."} when the student ID is not found.
        if (data && data.error) {
          console.warn('[ELLS Lookup] API error response:', data.error);
          resultsEl.innerHTML = `
            <div class="card" style="padding: 1.5rem; text-align: center; border: 1px solid var(--accent-crimson, #dc2626); background: rgba(220, 38, 38, 0.06);">
              <div style="font-size: 1.8rem; margin-bottom: 0.5rem;">🔍</div>
              <p style="margin: 0; color: var(--accent-crimson, #dc2626); font-weight: 600;">
                ${escapeHtml(data.error)}
              </p>
              <p style="margin: 0.5rem 0 0; color: var(--text-muted); font-size: 0.88rem;">
                Searched for: <strong>${escapeHtml(query)}</strong>
              </p>
            </div>`;
          showSearchStatus(statusEl, 'No matching record found.', 'warning');
          return;
        }

        // ── Handle successful flat JSON response ──
        // The API returns a flat object with keys: Student_ID, Name, Semester,
        // Total_Fee, Paid, Due, Status.
        if (data && data.Student_ID) {
          renderMemberStatusCard(resultsEl, data);
          showSearchStatus(statusEl, 'Record found successfully.', 'success');
        } else {
          // Unexpected shape — neither an error nor a recognized record
          console.error('[ELLS Lookup] Unexpected API response shape:', data);
          showSearchStatus(statusEl, 'Search returned an unexpected response. Please try again.', 'error');
          resultsEl.innerHTML = '';
        }
      })
      .catch(err => {
        // Robust error handling: network failures, CORS blocks, JSON parse errors,
        // redirect issues, timeouts, etc. — never hang on "Searching records...".
        console.error('[ELLS Lookup] Fetch error:', err);

        let userMessage = 'Unable to reach the membership server. This may be a network or connectivity issue.';
        if (err && err.name === 'AbortError') {
          userMessage = 'The search request timed out. Please check your connection and try again.';
        } else if (err instanceof TypeError && /Failed to fetch|NetworkError|Load failed/i.test(err.message)) {
          userMessage = 'A network or CORS error prevented the search. Please verify your internet connection or try again shortly.';
        } else if (err && err.message && /JSON/i.test(err.message)) {
          userMessage = 'The server returned an invalid response. Please try again or contact support.';
        }
        showSearchStatus(statusEl, userMessage, 'error');
        resultsEl.innerHTML = '';
      })
      .finally(() => {
        setLookupLoading(false);
      });
  });

  function setLookupLoading(loading) {
    if (lookupBtn) lookupBtn.disabled = !!loading;
    if (lookupBtnText) {
      lookupBtnText.textContent = loading ? 'Searching...' : 'Search Records';
    }
    if (lookupInput) lookupInput.disabled = !!loading;
  }
}

/* --------------------------------------------------------------------------
   searchMemberRecords — performs the actual fetch with redirect: 'follow'
   -------------------------------------------------------------------------- */
async function searchMemberRecords(query) {
  const url = `${MEMBER_API_ENDPOINT}?studentId=${encodeURIComponent(query)}`;

  // { redirect: 'follow' } is essential for Google Apps Script Web Apps.
  // When a GAS endpoint is called, it first returns a 302 redirect to a
  // googleusercontent.com URL. Browsers normally follow this automatically,
  // but explicitly declaring it ensures the final JSON payload is captured
  // as a transparent (not opaque) response.
  const response = await fetch(url, {
    method: 'GET',
    redirect: 'follow',
    headers: {
      'Accept': 'application/json'
    }
  });

  if (!response.ok) {
    // HTTP error (4xx, 5xx) — surface it so the catch handler can show a message
    throw new Error(`Server responded with status ${response.status} (${response.statusText})`);
  }

  // Parse JSON — if the response is not valid JSON, this throws and is caught below
  const data = await response.json();
  return data;
}

/* --------------------------------------------------------------------------
   renderMemberStatusCard — displays the flat student record as a beautiful
   status card with Name, Student ID, Semester, Total Fee, Paid, Due, Status.
   -------------------------------------------------------------------------- */
function renderMemberStatusCard(container, record) {
  const studentId  = escapeHtml(record.Student_ID || 'N/A');
  const name       = escapeHtml(record.Name || 'N/A');
  const semester   = escapeHtml(record.Semester || 'N/A');
  const totalFee   = record.Total_Fee != null ? Number(record.Total_Fee) : null;
  const paid       = record.Paid != null      ? Number(record.Paid)      : null;
  const due        = record.Due != null       ? Number(record.Due)       : null;
  const status     = escapeHtml(record.Status || 'N/A');

  // ── Determine status badge styling ──
  // Green if Status is "Eligible" OR Due is 0 (fully paid).
  // Red if Due > 0 and status explicitly contains "Not" or "Ineligible".
  // Yellow/amber as a fallback warning for any other case with outstanding due.
  let statusBadgeColor, statusBadgeBg, statusBadgeIcon;
  const isEligible = (record.Status && /eligible/i.test(record.Status) && !/not\s*eligible/i.test(record.Status))
                     || (due !== null && due === 0);
  const isIneligible = record.Status && /not\s*eligible|ineligible|defaulter/i.test(record.Status);

  if (isEligible) {
    statusBadgeColor = '#16a34a';   // green-600
    statusBadgeBg    = 'rgba(22, 163, 74, 0.12)';
    statusBadgeIcon  = '✓';
  } else if (isIneligible || (due !== null && due > 0)) {
    statusBadgeColor = '#dc2626';   // red-600
    statusBadgeBg    = 'rgba(220, 38, 38, 0.10)';
    statusBadgeIcon  = '✕';
  } else {
    statusBadgeColor = '#d97706';   // amber-600
    statusBadgeBg    = 'rgba(217, 119, 6, 0.10)';
    statusBadgeIcon  = '⚠';
  }

  const fmtBDT = (n) => n != null ? n.toLocaleString('en-BD') + ' TK' : 'N/A';

  container.innerHTML = `
    <div style="
      border: 1px solid var(--border-subtle, #2a2f45);
      border-radius: 12px;
      overflow: hidden;
      background: var(--bg-secondary, #111827);
      box-shadow: 0 4px 24px rgba(0,0,0,0.18);
    ">
      <!-- Card Header -->
      <div style="
        background: linear-gradient(135deg, rgba(201, 162, 39, 0.15) 0%, rgba(201, 162, 39, 0.04) 100%);
        border-bottom: 1px solid var(--border-subtle, #2a2f45);
        padding: 1.4rem 1.6rem;
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        flex-wrap: wrap;
        gap: 0.8rem;
      ">
        <div>
          <p style="margin: 0 0 0.25rem; font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-muted, #8a8fa3);">Member Record</p>
          <h4 style="margin: 0; font-size: 1.2rem; line-height: 1.3;">${name}</h4>
          <p style="margin: 0.2rem 0 0; font-size: 0.88rem; color: var(--text-secondary, #a0a4b8);">ID: ${studentId} · Semester: ${semester}</p>
        </div>
        <span style="
          display: inline-flex;
          align-items: center;
          gap: 0.35rem;
          padding: 0.35rem 0.9rem;
          border-radius: 999px;
          font-size: 0.82rem;
          font-weight: 700;
          letter-spacing: 0.03em;
          color: ${statusBadgeColor};
          background: ${statusBadgeBg};
          border: 1px solid ${statusBadgeColor}40;
        ">
          <span aria-hidden="true">${statusBadgeIcon}</span>
          ${status}
        </span>
      </div>

      <!-- Fee Breakdown Grid -->
      <div style="
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
        gap: 0;
      ">
        <div style="padding: 1.1rem 1.6rem; border-right: 1px solid var(--border-subtle, #2a2f45); border-bottom: 1px solid var(--border-subtle, #2a2f45);">
          <p style="margin: 0 0 0.25rem; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-muted, #8a8fa3);">Total Fee</p>
          <p style="margin: 0; font-size: 1.15rem; font-weight: 700;">${fmtBDT(totalFee)}</p>
        </div>
        <div style="padding: 1.1rem 1.6rem; border-right: 1px solid var(--border-subtle, #2a2f45); border-bottom: 1px solid var(--border-subtle, #2a2f45);">
          <p style="margin: 0 0 0.25rem; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-muted, #8a8fa3);">Paid Amount</p>
          <p style="margin: 0; font-size: 1.15rem; font-weight: 700; color: #16a34a;">${fmtBDT(paid)}</p>
        </div>
        <div style="padding: 1.1rem 1.6rem; border-bottom: 1px solid var(--border-subtle, #2a2f45);">
          <p style="margin: 0 0 0.25rem; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-muted, #8a8fa3);">Due Amount</p>
          <p style="margin: 0; font-size: 1.15rem; font-weight: 700; color: ${due !== null && due > 0 ? '#dc2626' : '#16a34a'};">${fmtBDT(due)}</p>
        </div>
      </div>
    </div>`;
}

/* --------------------------------------------------------------------------
   showSearchStatus — displays status / loading / error messages to the user
   -------------------------------------------------------------------------- */
function showSearchStatus(element, message, type) {
  if (!element) return;
  element.style.display = 'block';

  const colorMap = {
    loading: 'var(--text-secondary, #8a8fa3)',
    success: 'var(--accent-green, #22c55e)',
    error: 'var(--accent-crimson, #dc2626)',
    warning: 'var(--accent-gold, #c9a227)',
    info: 'var(--text-secondary, #8a8fa3)'
  };

  const iconMap = {
    loading: '⏳',
    success: '✓',
    error: '✕',
    warning: '⚠',
    info: 'ℹ'
  };

  element.style.color = colorMap[type] || colorMap.info;
  element.innerHTML = `<span aria-hidden="true">${iconMap[type] || ''}</span> ${escapeHtml(message)}`;
}

/* --------------------------------------------------------------------------
   escapeHtml — prevents XSS when inserting user/server data into the DOM
   -------------------------------------------------------------------------- */
function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}


function initMembershipWizard() {
  const wizardForm = document.getElementById('membershipForm');
  if (!wizardForm) return;

  const steps = document.querySelectorAll('.wizard-step');
  const stepIndicators = document.querySelectorAll('.wizard-step-indicator');
  const prevBtn = document.getElementById('prevStepBtn');
  const nextBtn = document.getElementById('nextStepBtn');
  const submitBtn = document.getElementById('submitMembershipBtn');
  const statementInput = document.getElementById('statementOfPurpose');
  const wordCountDisplay = document.getElementById('wordCountDisplay');

  let currentStep = 1;
  const totalSteps = steps.length;

  // Tier selection handling
  const tierCards = document.querySelectorAll('.tier-card');
  const tierInput = document.getElementById('selectedTierInput');

  tierCards.forEach(card => {
    card.addEventListener('click', () => {
      tierCards.forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      const tierValue = card.getAttribute('data-tier');
      if (tierInput) tierInput.value = tierValue;
      updateReviewSummary();
    });
  });

  // Word Counter for Statement
  if (statementInput && wordCountDisplay) {
    statementInput.addEventListener('input', () => {
      const text = statementInput.value.trim();
      const words = text ? text.split(/\s+/).length : 0;
      wordCountDisplay.textContent = `${words} / 150 words`;
      if (words > 150) {
        wordCountDisplay.style.color = 'var(--accent-crimson)';
      } else {
        wordCountDisplay.style.color = 'var(--text-muted)';
      }
    });
  }

  // Navigation handlers
  if (nextBtn) {
    nextBtn.addEventListener('click', () => {
      if (validateStep(currentStep)) {
        if (currentStep < totalSteps) {
          goToStep(currentStep + 1);
        }
      }
    });
  }

  if (prevBtn) {
    prevBtn.addEventListener('click', () => {
      if (currentStep > 1) {
        goToStep(currentStep - 1);
      }
    });
  }

  function goToStep(stepNumber) {
    currentStep = stepNumber;

    // Update steps display
    steps.forEach(step => {
      step.classList.remove('active');
      if (parseInt(step.getAttribute('data-step')) === currentStep) {
        step.classList.add('active');
      }
    });

    // Update indicators
    stepIndicators.forEach(indicator => {
      const stepIdx = parseInt(indicator.getAttribute('data-step'));
      indicator.classList.remove('active', 'completed');
      if (stepIdx === currentStep) {
        indicator.classList.add('active');
      } else if (stepIdx < currentStep) {
        indicator.classList.add('completed');
      }
    });

    // Toggle navigation buttons
    if (prevBtn) {
      prevBtn.style.display = currentStep === 1 ? 'none' : 'inline-flex';
    }

    if (nextBtn && submitBtn) {
      if (currentStep === totalSteps) {
        nextBtn.style.display = 'none';
        submitBtn.style.display = 'inline-flex';
        updateReviewSummary();
      } else {
        nextBtn.style.display = 'inline-flex';
        submitBtn.style.display = 'none';
      }
    }

    // Smooth scroll back to form top
    wizardForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // Live Step Validation
  function validateStep(step) {
    let isValid = true;

    if (step === 1) {
      const fullName = document.getElementById('fullName');
      const email = document.getElementById('emailAddress');
      const phone = document.getElementById('phoneNumber');
      const affiliation = document.getElementById('affiliation');

      if (!fullName.value.trim()) {
        markError(fullName, 'Please provide your full legal or preferred name.');
        isValid = false;
      } else {
        clearError(fullName);
      }

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!email.value.trim() || !emailRegex.test(email.value.trim())) {
        markError(email, 'Please enter a valid academic or personal email address.');
        isValid = false;
      } else {
        clearError(email);
      }

      if (!phone.value.trim()) {
        markError(phone, 'Please provide a valid contact number.');
        isValid = false;
      } else {
        clearError(phone);
      }

      if (!affiliation.value.trim()) {
        markError(affiliation, 'Please enter your department, major, or institution.');
        isValid = false;
      } else {
        clearError(affiliation);
      }
    }

    if (step === 2) {
      const interests = document.querySelectorAll('input[name="literaryInterests"]:checked');
      const errorBox = document.getElementById('interestsError');
      if (interests.length === 0) {
        if (errorBox) {
          errorBox.textContent = 'Please select at least one literary or linguistic area of interest.';
          errorBox.style.display = 'block';
        }
        isValid = false;
      } else {
        if (errorBox) errorBox.style.display = 'none';
      }
    }

    if (step === 3) {
      const statement = document.getElementById('statementOfPurpose');
      if (!statement.value.trim() || statement.value.trim().split(/\s+/).length < 15) {
        markError(statement, 'Please share at least a few sentences (minimum 15 words) describing your literary interests.');
        isValid = false;
      } else {
        clearError(statement);
      }
    }

    if (!isValid) {
      showToast('Please complete all required fields correctly before proceeding.', 'error');
    }

    return isValid;
  }

  function markError(input, message) {
    const parent = input.closest('.form-group');
    if (parent) {
      parent.classList.add('has-error');
      let errorEl = parent.querySelector('.form-error');
      if (errorEl) {
        errorEl.textContent = message;
        errorEl.style.display = 'block';
      }
    }
  }

  function clearError(input) {
    const parent = input.closest('.form-group');
    if (parent) {
      parent.classList.remove('has-error');
      let errorEl = parent.querySelector('.form-error');
      if (errorEl) {
        errorEl.style.display = 'none';
      }
    }
  }

  // Update Review Screen
  function updateReviewSummary() {
    const name = document.getElementById('fullName')?.value || 'Distinguished Scholar';
    const email = document.getElementById('emailAddress')?.value || '';
    const affiliation = document.getElementById('affiliation')?.value || '';
    const tier = document.getElementById('selectedTierInput')?.value || 'Student Fellow';

    const selectedInterests = Array.from(document.querySelectorAll('input[name="literaryInterests"]:checked'))
      .map(cb => cb.parentElement.textContent.trim())
      .join(', ') || 'Literary Arts & English Language';

    const reviewName = document.getElementById('reviewName');
    const reviewEmail = document.getElementById('reviewEmail');
    const reviewAffiliation = document.getElementById('reviewAffiliation');
    const reviewInterests = document.getElementById('reviewInterests');
    const reviewTier = document.getElementById('reviewTier');

    if (reviewName) reviewName.textContent = name;
    if (reviewEmail) reviewEmail.textContent = email;
    if (reviewAffiliation) reviewAffiliation.textContent = affiliation;
    if (reviewInterests) reviewInterests.textContent = selectedInterests;
    if (reviewTier) reviewTier.textContent = tier.toUpperCase();
  }

  // Form Submission
  wizardForm.addEventListener('submit', (e) => {
    e.preventDefault();

    if (!validateStep(1) || !validateStep(2) || !validateStep(3)) {
      goToStep(1);
      return;
    }

    const agreeCode = document.getElementById('agreeCodeOfConduct');
    if (agreeCode && !agreeCode.checked) {
      showToast('You must agree to the ELLS Club Code of Intellectual Discourse.', 'error');
      return;
    }

    // Simulate submission processing
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = `<span>Processing Application...</span>`;
    }

    setTimeout(() => {
      const fullName = document.getElementById('fullName')?.value.trim() || 'New Fellow';
      const tier = document.getElementById('selectedTierInput')?.value || 'Student Fellow';
      const memberId = 'ELLS-' + new Date().getFullYear() + '-' + Math.floor(1000 + Math.random() * 9000);
      const issueDate = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

      const memberData = {
        name: fullName,
        id: memberId,
        tier: tier,
        issued: issueDate
      };

      storeMember(memberData);
      renderMembershipPass(memberData);

      showToast(`Welcome to ELLS Club, ${fullName}! Your fellowship is confirmed.`, 'success');
    }, 900);
  });
}

function renderMembershipPass(memberData) {
  const formCard = document.getElementById('applicationFormCard');
  const passContainer = document.getElementById('membershipPassContainer');

  if (formCard) {
    formCard.hidden = true;
    formCard.classList.remove('is-active');
    formCard.style.display = 'none';
  }
  if (passContainer) {
    passContainer.style.display = 'block';

    const passName = document.getElementById('passMemberName');
    const passId = document.getElementById('passMemberId');
    const passTier = document.getElementById('passTier');
    const passDate = document.getElementById('passIssuedDate');

    if (passName) passName.textContent = memberData.name;
    if (passId) passId.textContent = memberData.id;
    if (passTier) passTier.textContent = memberData.tier.toUpperCase();
    if (passDate) passDate.textContent = memberData.issued;

    // Scroll smoothly to the pass
    passContainer.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  // Print button
  const printBtn = document.getElementById('printPassBtn');
  if (printBtn) {
    printBtn.addEventListener('click', () => {
      window.print();
    });
  }

  // Reset/Reapply button
  const reapplyBtn = document.getElementById('reapplyBtn');
  if (reapplyBtn) {
    reapplyBtn.addEventListener('click', () => {
      clearStoredMember();
      location.reload();
    });
  }
}

function checkExistingMembership() {
  const memberData = readStoredMember();
  if (memberData) {
    try {
      const viewExistingBtn = document.getElementById('viewExistingMemberNotice');
      if (viewExistingBtn) {
        viewExistingBtn.style.display = 'block';
        viewExistingBtn.innerHTML = `
          <div style="background: var(--accent-gold-light); border: 1px solid var(--accent-gold); padding: 1rem; border-radius: var(--radius-sm); margin-bottom: 2rem; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 1rem;">
            <div>
              <strong>Active Fellowship Found:</strong> You are registered as <em>${memberData.name}</em> (${memberData.id}).
            </div>
            <button type="button" class="btn btn-sm btn-primary" id="restorePassBtn">View Digital Pass</button>
          </div>
        `;
        document.getElementById('restorePassBtn')?.addEventListener('click', () => {
          renderMembershipPass(memberData);
        });
      }
    } catch (e) {
      console.error(e);
    }
  }
}
