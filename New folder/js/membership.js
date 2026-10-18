/**
 * ELLS Club — Membership Status Lookup
 * ---------------------------------------------------------------------------
 * UI/UX layer for the public membership directory. The status card in
 * membership.html is hidden by default (inline `display: none`) and is
 * revealed only after a student searches for their IIUC ID.
 *
 * BACKEND INTEGRATION
 * -------------------
 * 1. Set ELLS_STATUS_CONFIG.endpoint to the live status API, e.g.
 *      endpoint: '/api/membership/status'
 *    and set demoMode to false.
 * 2. The expected JSON response for a match is:
 *      {
 *        "studentName": "Ayesha Rahman",
 *        "studentId": "C2012345",
 *        "tier": "Student Fellow",
 *        "totalPaid": 1250,
 *        "dueAmount": 0,
 *        "assessmentTotal": 1250,          // optional
 *        "eligibleForFreeEntry": true       // optional; derived when omitted
 *      }
 *    Return HTTP 404 when no record exists. The lookup function already
 *    handles 404 (no-record state), other non-2xx responses (error message),
 *    and network failures.
 * ---------------------------------------------------------------------------
 */

const ELLS_STATUS_CONFIG = {
  // Example: 'https://api.ells-iiuc.com/membership/status'
  endpoint: null,
  // While true (or while no endpoint is configured), the demo record below is
  // returned so the interface can be reviewed without a backend.
  demoMode: true
};

const ELLS_DEMO_RECORD = {
  studentName: 'Ayesha Rahman',
  tier: 'Student Fellow',
  totalPaid: 1250,
  dueAmount: 0,
  assessmentTotal: 1250
};

// IIUC IDs look like C2012345: a letter followed by at least three digits.
const ELLS_ID_PATTERN = /^[A-Z]\d{3,}$/;

document.addEventListener('DOMContentLoaded', initMembershipStatusChecker);

function initMembershipStatusChecker() {
  const form = document.getElementById('statusCheckForm');
  if (!form) return;

  const input = document.getElementById('studentIdInput');
  const button = document.getElementById('checkStatusBtn');
  const buttonLabel = button ? button.querySelector('.status-search-submit__label') : null;
  const field = form.querySelector('.status-search-field');
  const errorEl = document.getElementById('statusSearchError');
  const card = document.getElementById('statusCard');
  const notFound = document.getElementById('statusNotFound');
  const notFoundId = document.getElementById('statusNotFoundId');
  const resetBtn = document.getElementById('statusResetBtn');

  if (!input || !button || !card) return;

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearError();

    const rawValue = input.value.trim();
    const studentId = rawValue.toUpperCase().replace(/\s+/g, '');

    if (!studentId) {
      showError('Please enter your IIUC Student ID to continue.');
      return;
    }

    if (!ELLS_ID_PATTERN.test(studentId)) {
      showError('That does not look like a valid IIUC ID. Use the format C2012345 (a letter followed by digits).');
      return;
    }

    setLoading(true);
    form.setAttribute('aria-busy', 'true');

    try {
      const record = await lookupMembership(studentId);

      if (!record) {
        showNotFound(studentId);
        return;
      }

      renderStatusCard(record);
    } catch (error) {
      console.error('[ELLS] Membership status lookup failed:', error);
      showError('We could not reach the membership directory right now. Please try again in a moment.');
    } finally {
      setLoading(false);
      form.removeAttribute('aria-busy');
    }
  });

  input.addEventListener('input', clearError);

  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      card.style.display = 'none';
      if (notFound) notFound.style.display = 'none';
      form.reset();
      clearError();
      const searchCard = form.closest('.status-search-card');
      if (searchCard) {
        window.scrollTo({
          top: searchCard.getBoundingClientRect().top + window.scrollY - 120,
          behavior: 'smooth'
        });
      }
      setTimeout(() => input.focus(), 300);
    });
  }

  /* ------------------------------------------------------------------------
     Backend bridge
     ------------------------------------------------------------------------ */
  async function lookupMembership(studentId) {
    const endpoint = ELLS_STATUS_CONFIG.endpoint;

    if (!ELLS_STATUS_CONFIG.demoMode && endpoint) {
      const url = `${endpoint}?studentId=${encodeURIComponent(studentId)}`;
      const response = await fetch(url, {
        headers: { Accept: 'application/json' }
      });

      if (response.status === 404) return null;
      if (!response.ok) {
        throw new Error(`Membership status request failed with ${response.status}`);
      }

      return normalizeRecord(await response.json(), studentId);
    }

    // Demo mode: keep the lookup asynchronous so the loading state is visible.
    await new Promise((resolve) => setTimeout(resolve, 650));

    return normalizeRecord(
      { ...ELLS_DEMO_RECORD, studentId },
      studentId
    );
  }

  function normalizeRecord(raw, fallbackId) {
    const totalPaid = toNumber(raw.totalPaid);
    const dueAmount = toNumber(raw.dueAmount);
    const assessmentTotal = toNumber(raw.assessmentTotal) || totalPaid + dueAmount;

    return {
      studentName: raw.studentName || raw.name || 'ELLS Member',
      studentId: raw.studentId || fallbackId,
      tier: raw.tier || 'Student Fellow',
      totalPaid,
      dueAmount,
      assessmentTotal,
      eligibleForFreeEntry:
        typeof raw.eligibleForFreeEntry === 'boolean'
          ? raw.eligibleForFreeEntry
          : dueAmount <= 0
    };
  }

  /* ------------------------------------------------------------------------
     Rendering
     ------------------------------------------------------------------------ */
  function renderStatusCard(record) {
    if (notFound) notFound.style.display = 'none';

    setText('statusStudentName', record.studentName);
    setText('statusStudentId', record.studentId);
    setText('statusTier', record.tier);
    setText('statusTotalPaid', formatMoney(record.totalPaid));
    setText('statusDueAmount', formatMoney(record.dueAmount));

    const eligible = record.eligibleForFreeEntry;
    const eligibilityEl = document.getElementById('statusEligibility');
    const eligibilityText = document.getElementById('statusEligibilityText');
    const eligibilityNote = document.getElementById('statusEligibilityNote');
    const entryMetric = document.getElementById('statusEntryMetric');

    if (eligibilityEl) {
      eligibilityEl.classList.toggle('is-eligible', eligible);
      eligibilityEl.classList.toggle('is-ineligible', !eligible);
    }

    if (entryMetric) {
      entryMetric.classList.toggle('is-ineligible', !eligible);
    }

    if (eligibilityText) {
      eligibilityText.textContent = eligible ? 'Eligible for Free Entry' : 'Not Eligible Yet';
    }

    if (eligibilityNote) {
      eligibilityNote.textContent = eligible
        ? 'All dues cleared'
        : `Clear ${formatMoney(record.dueAmount)} BDT to unlock free entry`;
    }

    const dueNote = document.getElementById('statusDueNote');
    if (dueNote) {
      dueNote.textContent = record.dueAmount > 0
        ? 'Please clear this outstanding balance'
        : 'No outstanding balance';
    }

    // Payment progress (paid vs. total assessment)
    const total = record.assessmentTotal > 0
      ? record.assessmentTotal
      : record.totalPaid + record.dueAmount;
    const percent = total > 0
      ? Math.max(0, Math.min(100, Math.round((record.totalPaid / total) * 100)))
      : 100;

    setText('statusProgressLabel', `${percent}%`);

    const progressBar = document.getElementById('statusProgressBar');
    const progressFill = document.getElementById('statusProgressFill');
    if (progressBar) progressBar.setAttribute('aria-valuenow', String(percent));
    if (progressFill) progressFill.style.width = `${percent}%`;

    const progressNote = document.getElementById('statusProgressNote');
    if (progressNote) {
      progressNote.textContent = `${formatMoney(record.totalPaid)} of ${formatMoney(total)} BDT membership assessment settled.`;
    }

    // Reveal (and replay the entrance animation on repeat searches)
    card.style.display = 'block';
    card.style.animation = 'none';
    void card.offsetWidth;
    card.style.animation = '';

    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function showNotFound(studentId) {
    card.style.display = 'none';

    if (notFoundId) notFoundId.textContent = studentId;
    if (notFound) {
      notFound.style.display = 'flex';
      notFound.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  /* ------------------------------------------------------------------------
     UI helpers
     ------------------------------------------------------------------------ */
  function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  }

  function formatMoney(value) {
    return Number(value || 0).toLocaleString('en-US', {
      maximumFractionDigits: 0
    });
  }

  function toNumber(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
  }

  function setLoading(isLoading) {
    button.disabled = isLoading;
    button.classList.toggle('is-loading', isLoading);
    if (buttonLabel) {
      buttonLabel.textContent = isLoading ? 'Checking...' : 'Check Status';
    }
  }

  function showError(message) {
    if (errorEl) {
      errorEl.textContent = message;
      errorEl.classList.add('is-visible');
    }
    if (field) field.classList.add('has-error');
    input.setAttribute('aria-invalid', 'true');
    input.focus();
  }

  function clearError() {
    if (errorEl) {
      errorEl.textContent = '';
      errorEl.classList.remove('is-visible');
    }
    if (field) field.classList.remove('has-error');
    input.removeAttribute('aria-invalid');
  }
}
