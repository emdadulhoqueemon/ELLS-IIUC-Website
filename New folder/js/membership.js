/**
 * ELLS Club - Membership Status Check Module
 * Resilient Google Apps Script integration with 6-second timeout fallback,
 * CORS protection, and theme-consistent fallback modals.
 */

document.addEventListener('DOMContentLoaded', () => {
  initMemberRecordSearch();
});

/* ==========================================================================
   Google Apps Script API Endpoint
   --------------------------------------------------------------------------
   Deployed Google Apps Script Web App URL.
   Accepts a "studentId" query parameter and returns a flat JSON object with
   student membership details, e.g.:
     {"Student_ID":"N241038","Name":"Md. Emdadul Hoque","Semester":"6th",
      "Total_Fee":2000,"Paid":2000,"Due":0,"Status":"Eligible"}
   On error it returns:
     {"error": "Student ID not found in our records"}
   ========================================================================== */
const MEMBER_API_ENDPOINT = 'https://script.google.com/macros/s/AKfycbweVB7pfq9ZMDIl6WBDsfv4vbTL9Fcj0qGxGeH_ydsYi_RCUlYWcN6Qpjn6BC2nbcW7/exec';
const API_TIMEOUT_MS = 6000;
const FALLBACK_EMAIL = 'ells@iiuc.ac.bd';

/* ==========================================================================
   Member Record Lookup (Google Apps Script API with 6-Second Timeout)
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
    showSearchStatus(statusEl, 'Searching master registry...', 'loading');
    resultsEl.innerHTML = '';

    searchMemberRecords(query)
      .then(data => {
        // Handle API-level error response (e.g. Student ID not found in sheet)
        if (data && data.error) {
          console.warn('[ELLS Lookup] API error response:', data.error);
          resultsEl.innerHTML = `
            <div class="card" style="padding: 1.5rem; text-align: center; border: 1px solid var(--accent-crimson, #dc2626); background: rgba(220, 38, 38, 0.06); border-radius: 10px;">
              <div style="font-size: 1.8rem; margin-bottom: 0.5rem;" aria-hidden="true">🔍</div>
              <p style="margin: 0; color: var(--accent-crimson, #dc2626); font-weight: 600;">
                ${escapeHtml(data.error)}
              </p>
              <p style="margin: 0.5rem 0 0; color: var(--text-secondary); font-size: 0.9rem;">
                Searched ID: <strong>${escapeHtml(query)}</strong>
              </p>
              <p style="margin: 0.75rem 0 0; font-size: 0.85rem; color: var(--text-secondary);">
                Need help? Email <a href="mailto:${FALLBACK_EMAIL}?subject=Student%20ID%20Not%20Found%20-%20${encodeURIComponent(query)}" style="color: var(--accent-primary); text-decoration: underline;">${FALLBACK_EMAIL}</a>
              </p>
            </div>`;
          showSearchStatus(statusEl, 'No matching record found in current term.', 'warning');
          return;
        }

        // Handle successful flat JSON response
        if (data && data.Student_ID) {
          renderMemberStatusCard(resultsEl, data);
          showSearchStatus(statusEl, 'Membership record retrieved successfully.', 'success');
        } else {
          console.error('[ELLS Lookup] Unexpected API response shape:', data);
          showSearchStatus(statusEl, 'Search returned an unexpected response. Please try again.', 'error');
          resultsEl.innerHTML = '';
        }
      })
      .catch(err => {
        console.error('[ELLS Lookup] Fetch error:', err);

        const isTimeout = err && (err.name === 'AbortError' || (err.message && err.message.includes('aborted')));
        const errorDesc = isTimeout 
          ? 'The request timed out after 6 seconds. Google Apps Script server is taking too long to respond.'
          : 'A network connectivity or CORS policy issue prevented connection to the records backend.';

        // 1. Show clean theme-consistent modal
        if (typeof window.showApiFallbackModal === 'function') {
          window.showApiFallbackModal({
            title: 'Membership Server Connectivity Notice',
            message: errorDesc,
            query: query,
            email: FALLBACK_EMAIL
          });
        }

        // 2. Display Toast
        if (typeof window.showToast === 'function') {
          window.showToast(`Server unreachable. Please email ${FALLBACK_EMAIL} for manual verification.`, 'error');
        }

        // 3. Render inline fallback card with 1-click email button
        renderFallbackErrorCard(resultsEl, query, isTimeout);
        showSearchStatus(statusEl, `Service unreachable. Please contact ${FALLBACK_EMAIL}`, 'error');
      })
      .finally(() => {
        setLookupLoading(false);
      });
  });

  function setLookupLoading(loading) {
    if (lookupBtn) lookupBtn.disabled = !!loading;
    if (lookupBtnText) {
      lookupBtnText.textContent = loading ? 'Searching...' : 'Check Status';
    }
    if (lookupInput) lookupInput.disabled = !!loading;
  }
}

/* --------------------------------------------------------------------------
   searchMemberRecords — Fetch with 6-second AbortController timeout
   -------------------------------------------------------------------------- */
async function searchMemberRecords(query) {
  const url = `${MEMBER_API_ENDPOINT}?studentId=${encodeURIComponent(query)}`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      headers: {
        'Accept': 'application/json'
      },
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`Server responded with status ${response.status} (${response.statusText})`);
    }

    const data = await response.json();
    return data;
  } finally {
    clearTimeout(timeoutId);
  }
}

/* --------------------------------------------------------------------------
   renderMemberStatusCard — Displays the flat student record
   -------------------------------------------------------------------------- */
function renderMemberStatusCard(container, record) {
  const studentId  = escapeHtml(record.Student_ID || 'N/A');
  const name       = escapeHtml(record.Name || 'N/A');
  const semester   = escapeHtml(record.Semester || 'N/A');
  const totalFee   = record.Total_Fee != null ? Number(record.Total_Fee) : null;
  const paid       = record.Paid != null      ? Number(record.Paid)      : null;
  const due        = record.Due != null       ? Number(record.Due)       : null;
  const status     = escapeHtml(record.Status || 'N/A');

  let statusBadgeColor, statusBadgeBg, statusBadgeIcon;
  const isEligible = (record.Status && /eligible/i.test(record.Status) && !/not\s*eligible/i.test(record.Status))
                     || (due !== null && due === 0);
  const isIneligible = record.Status && /not\s*eligible|ineligible|defaulter/i.test(record.Status);

  if (isEligible) {
    statusBadgeColor = '#10B981';   // Emerald / Green
    statusBadgeBg    = 'rgba(16, 185, 129, 0.15)';
    statusBadgeIcon  = '✓';
  } else if (isIneligible || (due !== null && due > 0)) {
    statusBadgeColor = '#EF4444';   // Crimson / Red
    statusBadgeBg    = 'rgba(239, 68, 68, 0.12)';
    statusBadgeIcon  = '✕';
  } else {
    statusBadgeColor = '#F59E0B';   // Amber / Gold
    statusBadgeBg    = 'rgba(245, 158, 11, 0.12)';
    statusBadgeIcon  = '⚠';
  }

  const fmtBDT = (n) => n != null ? n.toLocaleString('en-BD') + ' TK' : 'N/A';

  container.innerHTML = `
    <div style="
      border: 1px solid var(--border-color, rgba(255, 255, 255, 0.12));
      border-radius: var(--card-radius, 10px);
      overflow: hidden;
      background: var(--bg-card, #112733);
      box-shadow: 0 4px 20px rgba(0,0,0,0.2);
    ">
      <!-- Card Header -->
      <div style="
        background: rgba(255, 255, 255, 0.03);
        border-bottom: 1px solid var(--border-color, rgba(255, 255, 255, 0.1));
        padding: 1.35rem 1.6rem;
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        flex-wrap: wrap;
        gap: 0.8rem;
      ">
        <div>
          <p style="margin: 0 0 0.25rem; font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-secondary);">Member Record</p>
          <h4 style="margin: 0; font-size: 1.25rem; line-height: 1.3; color: var(--text-primary); font-family: 'Asul', serif !important;">${name}</h4>
          <p style="margin: 0.25rem 0 0; font-size: 0.9rem; color: var(--text-secondary);">Student ID: <strong style="color: var(--accent-primary);">${studentId}</strong> · Semester: ${semester}</p>
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
        grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
        gap: 0;
      ">
        <div style="padding: 1.1rem 1.6rem; border-right: 1px solid var(--border-color, rgba(255, 255, 255, 0.08)); border-bottom: 1px solid var(--border-color, rgba(255, 255, 255, 0.08));">
          <p style="margin: 0 0 0.25rem; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-secondary);">Total Fee</p>
          <p style="margin: 0; font-size: 1.15rem; font-weight: 700; color: var(--text-primary);">${fmtBDT(totalFee)}</p>
        </div>
        <div style="padding: 1.1rem 1.6rem; border-right: 1px solid var(--border-color, rgba(255, 255, 255, 0.08)); border-bottom: 1px solid var(--border-color, rgba(255, 255, 255, 0.08));">
          <p style="margin: 0 0 0.25rem; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-secondary);">Paid Amount</p>
          <p style="margin: 0; font-size: 1.15rem; font-weight: 700; color: #10B981;">${fmtBDT(paid)}</p>
        </div>
        <div style="padding: 1.1rem 1.6rem; border-bottom: 1px solid var(--border-color, rgba(255, 255, 255, 0.08));">
          <p style="margin: 0 0 0.25rem; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-secondary);">Due Amount</p>
          <p style="margin: 0; font-size: 1.15rem; font-weight: 700; color: ${due !== null && due > 0 ? '#EF4444' : '#10B981'};">${fmtBDT(due)}</p>
        </div>
      </div>
    </div>`;
}

/* --------------------------------------------------------------------------
   renderFallbackErrorCard — Graceful inline error fallback with mailto button
   -------------------------------------------------------------------------- */
function renderFallbackErrorCard(container, query, isTimeout) {
  const cleanQuery = escapeHtml(query);
  const subject = encodeURIComponent(`Membership Status Inquiry - Student ID ${query}`);
  const body = encodeURIComponent(`Hello ELLS Executive Committee,\n\nMy Student ID is ${query}. I was unable to verify my membership status online due to a server connection timeout.\n\nPlease verify my record manually.\n\nThank you!`);
  const mailtoUrl = `mailto:${FALLBACK_EMAIL}?subject=${subject}&body=${body}`;

  container.innerHTML = `
    <div class="card" style="padding: 1.6rem; text-align: center; border: 1px solid var(--border-color, rgba(255, 255, 255, 0.15)); background: rgba(220, 38, 38, 0.06); border-radius: 10px;">
      <div style="font-size: 2rem; margin-bottom: 0.5rem;" aria-hidden="true">📡</div>
      <h4 style="margin: 0 0 0.4rem; color: var(--text-primary); font-family: 'Asul', serif !important;">
        ${isTimeout ? 'Database Connection Timed Out' : 'Server Connectivity Notice'}
      </h4>
      <p style="margin: 0 0 0.8rem; color: var(--text-secondary); font-size: 0.92rem; line-height: 1.5;">
        We could not connect to the membership database within 6 seconds. This is usually caused by network latency or institutional firewall restrictions.
      </p>
      <p style="margin: 0 0 1.2rem; font-size: 0.9rem; color: var(--text-secondary);">
        Queried Student ID: <strong style="color: var(--accent-primary);">${cleanQuery}</strong>
      </p>
      <div style="display: flex; gap: 0.75rem; justify-content: center; flex-wrap: wrap;">
        <a href="${mailtoUrl}" class="btn btn-primary btn-sm">
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 5px;" aria-hidden="true">
            <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
            <polyline points="22,6 12,13 2,6"></polyline>
          </svg>
          Email Committee (${FALLBACK_EMAIL})
        </a>
      </div>
    </div>
  `;
}

/* --------------------------------------------------------------------------
   showSearchStatus — Displays status / loading / error messages to the user
   -------------------------------------------------------------------------- */
function showSearchStatus(element, message, type) {
  if (!element) return;
  element.style.display = 'block';

  const colorMap = {
    loading: 'var(--text-secondary, #8a8fa3)',
    success: 'var(--accent-primary, #10B981)',
    error: '#EF4444',
    warning: 'var(--accent-primary, #c9a227)',
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
   escapeHtml — Prevents XSS when inserting user/server data into the DOM
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
