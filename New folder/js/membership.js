/**
 * ELLS Club — Membership Status Lookup
 * ---------------------------------------------------------------------------
 * UI/UX layer for the public membership directory. The status card in
 * membership.html is hidden by default (inline `display: none`) and is
 * revealed only after a student searches for their IIUC ID.
 *
 * BACKEND INTEGRATION
 * -------------------
 * The lookup is wired to the club's Google Apps Script treasury
 * API (ELLS_STATUS_CONFIG.endpoint below; demoMode is off). The
 * endpoint is queried with the student ID under several common
 * parameter names (studentId, id, student_id, roll) so the Apps
 * Script can read whichever key it expects, and the response
 * parser accepts camelCase and snake_case field variants, flat
 * or nested under a data/student/result wrapper.
 *
 * Expected success fields:
 *   studentName/name, studentId/id, semester, tier,
 *   totalFee/total_fee, paidAmount/paid_amount,
 *   dueAmount/due_amount, membershipStatus/status
 *
 * An error payload (e.g. { "status": "error", "message":
 * "Student ID not found" }) or HTTP 404 both route to the
 * no-record state. Network failures and 15 s timeouts raise
 * an error banner.
 * ---------------------------------------------------------------------------
 */

const ELLS_STATUS_CONFIG = {
  // Google Apps Script Web App endpoint (GET).
  endpoint: 'https://script.google.com/macros/s/AKfycbweVB7pfq9ZMDIl6WBDsfv4vbTL9Fcj0qGxGeH_ydsYi_RCUlYWcN6Qpjn6BC2nbcW7/exec',
  // Set to true to preview the interface with the demo record below.
  demoMode: false
};

// Give slow Apps Script cold starts a chance before failing.
const ELLS_REQUEST_TIMEOUT_MS = 15000;

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
      showError('We could not reach the membership directory right now. Please try again in a moment, or contact the club cashier for confirmation.');
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
      // Send the ID under every common parameter name so the Apps
      // Script endpoint can read whichever key it expects.
      const params = new URLSearchParams({
        studentId,
        id: studentId,
        student_id: studentId,
        roll: studentId
      });

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), ELLS_REQUEST_TIMEOUT_MS);

      try {
        const response = await fetch(`${endpoint}?${params.toString()}`, {
          method: 'GET',
          headers: { Accept: 'application/json' },
          signal: controller.signal
        });

        if (response.status === 404) return null;
        if (!response.ok) {
          throw new Error(`Membership status request failed with ${response.status}`);
        }

        const payload = await parseJSONResponse(response);

        // Apps Script scripts report misses as a 200 error payload
        // (e.g. { status: "error", message: "Student ID not found" }).
        if (isErrorPayload(payload)) return null;

        return normalizeRecord(unwrapRecord(payload), studentId, payload);
      } catch (error) {
        if (error && error.name === 'AbortError') {
          throw new Error('The membership directory is taking too long to respond.');
        }
        throw error;
      } finally {
        clearTimeout(timer);
      }
    }

    // Demo mode: keep the lookup asynchronous so the loading state is visible.
    await new Promise((resolve) => setTimeout(resolve, 650));

    return normalizeRecord(
      { ...ELLS_DEMO_RECORD, studentId },
      studentId
    );
  }

  function normalizeRecord(raw, fallbackId, root) {
    const pick = (keys) => pickField(raw, root, keys);

    const totalPaid = toNumber(pick(['totalPaid', 'total_paid', 'paidAmount', 'paid_amount', 'amountPaid', 'amount_paid', 'paid']));
    const dueAmount = toNumber(pick(['dueAmount', 'due_amount', 'amountDue', 'amount_due', 'due', 'balance', 'outstanding', 'dues']));
    const assessmentTotal =
      toNumber(pick(['assessmentTotal', 'assessment_total', 'totalFee', 'total_fee', 'feeTotal', 'fee_total', 'totalAmount', 'total_amount', 'grandTotal', 'grand_total'])) ||
      totalPaid + dueAmount;

    // Semester / term, when the ledger provides it.
    const semester = pick(['semester', 'semesterName', 'semester_name', 'currentSemester', 'current_semester', 'term', 'year']) || '';

    // Explicit eligibility flag wins; otherwise derive it from the
    // outstanding balance and any status/verdict text.
    const explicitEligible = pick(['eligibleForFreeEntry', 'eligible_for_free_entry', 'eligible', 'isEligible', 'is_eligible']);
    const statusText = String(pick(['membershipStatus', 'membership_status', 'statusText', 'status_text', 'verdict', 'status']) || '');
    const eligible =
      typeof explicitEligible === 'boolean' ? explicitEligible
      : String(explicitEligible) === 'true' ? true
      : String(explicitEligible) === 'false' ? false
      : dueAmount > 0 ? false
      : /due|pending|unpaid|overdue|outstanding|arrear|incomplete|partial/i.test(statusText) && !/eligib|clear|active|verified|settled/i.test(statusText) ? false
      : dueAmount <= 0;

    return {
      studentName: pick(['studentName', 'student_name', 'name', 'fullName', 'full_name', 'memberName']) || 'ELLS Member',
      studentId: pick(['studentId', 'student_id', 'studentID', 'id', 'roll', 'rollNo', 'roll_no']) || fallbackId,
      semester,
      tier: pick(['tier', 'membershipTier', 'membership_tier', 'plan']) || 'Student Fellow',
      statusText,
      totalPaid,
      dueAmount,
      assessmentTotal,
      eligibleForFreeEntry: eligible
    };
  }

  /* ------------------------------------------------------------------------
     Apps Script response tolerance helpers
     ------------------------------------------------------------------------ */

  // Apps Script may wrap the record in a data/student/result envelope
  // or return an array with a single entry.
  function unwrapRecord(payload) {
    if (!payload || typeof payload !== 'object') return {};
    const wrappers = ['data', 'student', 'result', 'member', 'record', 'details', 'info'];
    for (const key of wrappers) {
      const inner = payload[key];
      if (inner && typeof inner === 'object' && !Array.isArray(inner)) return inner;
    }
    if (Array.isArray(payload) && payload.length && typeof payload[0] === 'object') return payload[0];
    return payload;
  }

  function isErrorPayload(payload) {
    if (!payload || typeof payload !== 'object') return false;
    if (payload.error === true || payload.ok === false || payload.success === false) return true;
    if (String(payload.status || '').toLowerCase() === 'error') return true;

    const message = String(
      payload.message || payload.msg || payload.error || payload.errorMessage || payload.details || ''
    ).toLowerCase();
    return /not found|no record|no data|not a member|invalid|unregistered|not registered|does not exist|not exist|not available/i.test(message);
  }

  function pickField(record, root, keys) {
    for (const key of keys) {
      const inRecord = record ? record[key] : undefined;
      const inRoot = root && root !== record ? root[key] : undefined;
      const value = (inRecord !== undefined && inRecord !== null && String(inRecord).trim() !== '')
        ? inRecord
        : (inRoot !== undefined && inRoot !== null && String(inRoot).trim() !== '' ? inRoot : null);
      if (value !== null) return value;
    }
    return null;
  }

  // Apps Script returns text/plain even for JSON output, and some
  // deployments pad the payload — extract the outermost {...} block.
  async function parseJSONResponse(response) {
    const text = await response.text();
    try {
      return JSON.parse(text);
    } catch (err) {
      const start = text.indexOf('{');
      const end = text.lastIndexOf('}');
      if (start !== -1 && end > start) {
        try { return JSON.parse(text.slice(start, end + 1)); } catch (err2) { /* fall through */ }
      }
      throw new Error('The membership directory returned an unreadable response.');
    }
  }

  /* ------------------------------------------------------------------------
     Rendering
     ------------------------------------------------------------------------ */
  function renderStatusCard(record) {
    if (notFound) notFound.style.display = 'none';

    setText('statusStudentName', record.studentName);
    setText('statusStudentId', record.studentId);
    setText('statusSemester', record.semester || '—');
    setText('statusTier', record.tier);
    setText('statusTotalFee', formatMoney(record.assessmentTotal));
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
      buttonLabel.textContent = isLoading ? 'Searching records…' : 'Check Status';
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
