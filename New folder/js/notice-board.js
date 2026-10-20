/**
 * ELLS Club — Public Notice Board (Cloud Firestore, real-time)
 * ---------------------------------------------------------------------------
 * Replaces the previously hardcoded event cards inside the homepage
 * "Event & Notice Schedule" section (index.html, #noticeBoardGrid) with live
 * documents from the Firestore `notices` collection.
 *
 * Firestore document shape written by admin.html:
 *   {
 *     title:       string,
 *     date:        "YYYY-MM-DD",     // date the notice applies to
 *     description: string,
 *     createdAt:   Timestamp         // serverTimestamp()
 *   }
 *
 * The board subscribes with onSnapshot(), so a notice published from the
 * admin console appears on the homepage instantly — no reload required.
 *
 * The same snapshot also feeds the top scrolling ticker (#noticeTicker):
 * the four newest notices are rendered twice so the marquee loops
 * seamlessly. With zero notices both the ticker and the board show a
 * purpose-built ELLS empty state — there is no hardcoded copy anywhere.
 * ---------------------------------------------------------------------------
 */

import {
  db,
  auth,
  NOTICES_COLLECTION,
  collection,
  onSnapshot,
  query,
  orderBy,
  onAuthStateChanged
} from './firebase-config.js';

function initNoticeBoard(gridEl) {
  // Rendered cards carry [data-notice-id]; the static skeleton is removed once
  // the first snapshot arrives so Firestore is the only source of notices.
  //
  // gridEl is null on the pages that only carry the ticker (about, membership,
  // events) — the same subscription still feeds them.
  let hasRendered = false;
  let unsubscribeAuth = null;

  setBoardState('loading');

  const noticesQuery = query(
    collection(db, NOTICES_COLLECTION),
    orderBy('date', 'desc')
  );

  const unsubscribeSnapshot = onSnapshot(
    noticesQuery,
    (snapshot) => {
      const notices = snapshot.docs.map((docSnap) => {
        const data = docSnap.data() || {};
        return {
          id: docSnap.id,
          title: safeText(data.title),
          description: safeText(data.description),
          date: normalizeDate(data.date)
        };
      });

      if (gridEl) renderNotices(gridEl, notices);
      renderTicker(notices);
      setBoardState(notices.length ? 'ready' : 'empty');
      setLivePill(notices.length > 0);
      hasRendered = true;
    },
    (error) => {
      console.error('[ELLS] Notice board subscription failed:', error);

      // A signed-in administrator can retry the read once the token is fresh;
      // everyone else simply sees the offline message.
      if (!hasRendered && error && error.code === 'permission-denied' && !unsubscribeAuth) {
        unsubscribeAuth = onAuthStateChanged(auth, (user) => {
          if (unsubscribeAuth) {
            unsubscribeAuth();
            unsubscribeAuth = null;
          }
          if (!user) setBoardState('error');
        });
      }

      if (!hasRendered) setBoardState('error');
    }
  );

  window.addEventListener('pagehide', () => {
    unsubscribeSnapshot();
    if (unsubscribeAuth) unsubscribeAuth();
  });
}

/* ---------------------------------------------------------------------------
   Rendering — reuses the existing .event-card / .badge / .event-meta styles so
   dynamic notices are visually identical to the rest of the site.
   --------------------------------------------------------------------------- */

function renderNotices(gridEl, notices) {
  gridEl.textContent = '';

  notices.forEach((notice, index) => {
    gridEl.appendChild(buildNoticeCard(notice, index));
  });
}

function buildNoticeCard(notice, index) {
  const { month, day } = splitDate(notice.date);

  const card = document.createElement('article');
  card.className = 'event-card notice-card';
  card.dataset.noticeId = notice.id;
  card.setAttribute('aria-labelledby', `noticeTitle-${notice.id}`);

  /* Header: date badge + category badge */
  const header = document.createElement('div');
  header.className = 'event-card-header';

  const dateBadge = document.createElement('div');
  dateBadge.className = 'event-date-badge';
  dateBadge.setAttribute('aria-label', formatDate(notice.date));

  const monthEl = document.createElement('span');
  monthEl.className = 'event-date-month';
  monthEl.textContent = month;

  const dayEl = document.createElement('span');
  dayEl.className = 'event-date-day';
  dayEl.textContent = day;

  dateBadge.append(monthEl, dayEl);

  const badge = document.createElement('span');
  badge.className = `badge ${index === 0 ? 'badge-gold' : 'badge-navy'}`;
  badge.textContent = index === 0 ? 'Latest Notice' : 'Notice';

  header.append(dateBadge, badge);

  /* Body: title + description + date meta line */
  const body = document.createElement('div');
  body.className = 'event-card-body';

  const title = document.createElement('h3');
  title.id = `noticeTitle-${notice.id}`;
  title.textContent = notice.title;

  const description = document.createElement('p');
  description.className = 'notice-card-desc';
  description.textContent = notice.description;

  const meta = document.createElement('div');
  meta.className = 'event-meta';
  meta.appendChild(buildMetaItem(formatDate(notice.date), 'calendar'));

  /* Footer: published stamp + link to the notices archive */
  const footer = document.createElement('div');
  footer.className = 'event-card-footer';

  const stamp = document.createElement('span');
  stamp.className = 'seats-indicator notice-card-stamp';
  stamp.textContent = 'Official ELLS Notice';

  const link = document.createElement('a');
  link.href = 'events.html';
  link.className = 'notice-card-link';
  link.textContent = 'View Events →';

  footer.append(stamp, link);

  body.append(title, description, meta, footer);
  card.append(header, body);

  return card;
}

/* ---------------------------------------------------------------------------
   Top scrolling ticker — the same live notices, no static copy.
   --------------------------------------------------------------------------- */

function renderTicker(notices) {
  const bar = document.getElementById('noticeTicker');
  const track = document.getElementById('noticeTickerTrack');
  if (!bar || !track) return;

  track.textContent = '';

  // Four newest notices keep the loop short enough to read comfortably.
  const latest = notices.slice(0, 4);

  if (!latest.length) {
    bar.hidden = true;
    return;
  }

  /* Two identical segments: the marquee translates -50%, so the second copy
     slides in exactly where the first one started. */
  [false, true].forEach((isDuplicate) => {
    const segment = document.createElement('div');
    segment.className = 'news-ticker-content';
    if (isDuplicate) segment.setAttribute('aria-hidden', 'true');

    latest.forEach((notice) => {
      const item = document.createElement('span');
      item.className = 'ticker-item';

      const highlight = document.createElement('strong');
      highlight.className = 'ticker-highlight';
      highlight.textContent = `${notice.title}:`;

      item.append(highlight, document.createTextNode(` ${truncate(notice.description, 140)}`));
      segment.appendChild(item);

      const divider = document.createElement('span');
      divider.className = 'ticker-divider';
      divider.setAttribute('aria-hidden', 'true');
      divider.textContent = '✦';
      segment.appendChild(divider);
    });

    track.appendChild(segment);
  });

  bar.hidden = false;
}

/** Keeps one ticker entry to a readable length without cutting mid-word. */
function truncate(text, max) {
  const value = safeText(text);
  if (value.length <= max) return value;

  const cut = value.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

function buildMetaItem(text, iconName) {
  const item = document.createElement('div');
  item.className = 'event-meta-item';
  item.insertAdjacentHTML('beforeend', ICONS[iconName] || ICONS.calendar);

  const span = document.createElement('span');
  span.textContent = text;

  item.appendChild(span);
  return item;
}

const ICONS = {
  calendar:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>',
  pin:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>'
};

/* ---------------------------------------------------------------------------
   Board states (loading / empty / error) — the status panel is only shown
   while the grid has no notices to display.
   --------------------------------------------------------------------------- */

const BOARD_STATE_COPY = {
  loading: {
    eyebrow: 'One moment',
    title: 'Loading the notice board…',
    text: 'Fetching the latest official announcements from ELLS Club.',
    spinner: true
  },
  empty: {
    eyebrow: 'Stay tuned',
    title: 'No Notices Right Now',
    text: 'Announcements from the IT Secretary will appear here the moment they are published. New competitions and workshops are on the way!',
    spinner: false
  },
  error: {
    eyebrow: 'Offline',
    title: 'Notice board is temporarily unavailable',
    text: 'We could not reach the ELLS notice archive. Please refresh the page in a moment.',
    spinner: false
  }
};

function setBoardState(state) {
  const panel = document.getElementById('noticeBoardStatus');
  if (!panel) return;


  const gridEl = document.getElementById('noticeBoardGrid');
  if (gridEl) gridEl.setAttribute('aria-busy', state === 'loading' ? 'true' : 'false');

  panel.dataset.state = state;

  if (state === 'ready') {
    panel.hidden = true;
    return;
  }

  const copy = BOARD_STATE_COPY[state];
  if (!copy) return;

  panel.hidden = false;

  const eyebrowEl = panel.querySelector('[data-notice-status-eyebrow]');
  const titleEl = panel.querySelector('[data-notice-status-title]');
  const textEl = panel.querySelector('[data-notice-status-text]');
  if (eyebrowEl && copy.eyebrow) eyebrowEl.textContent = copy.eyebrow;
  if (titleEl) titleEl.textContent = copy.title;
  if (textEl) textEl.textContent = copy.text;

  const spinner = panel.querySelector('.notice-board-state__spinner');
  if (spinner) spinner.hidden = !copy.spinner;
}

function setLivePill(isLive) {
  const pill = document.getElementById('noticeLivePill');
  if (pill) pill.hidden = !isLive;
}

/* ---------------------------------------------------------------------------
   Helpers
   --------------------------------------------------------------------------- */

/** Firestore may return a Timestamp, an ISO string, or a Date — accept all. */
function normalizeDate(value) {
  if (value && typeof value.toDate === 'function') {
    return value.toDate();
  }
  if (value && typeof value === 'object' && typeof value.seconds === 'number') {
    return new Date(value.seconds * 1000);
  }
  if (value instanceof Date) {
    return value;
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = new Date(`${value.trim()}T00:00:00`);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return null;
}

function safeText(value) {
  if (typeof value === 'string') return value.trim();
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function splitDate(date) {
  if (!date) return { month: '—', day: '•' };

  return {
    month: date.toLocaleDateString('en-US', { month: 'short' }).toUpperCase(),
    day: String(date.getDate()).padStart(2, '0')
  };
}

function formatDate(date) {
  if (!date) return 'Date to be announced';

  return date.toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  });
}

/* ---------------------------------------------------------------------------
   Bootstrap — runs after every declaration above is initialised.
   --------------------------------------------------------------------------- */

const boardGrid = document.getElementById('noticeBoardGrid');
const tickerBar = document.getElementById('noticeTicker');
if (boardGrid || tickerBar) {
  initNoticeBoard(boardGrid);
}
