/**
 * ELLS Club — Public Events Feed (Cloud Firestore, real-time)
 * ---------------------------------------------------------------------------
 * Replaces the previously hardcoded event cards inside the "Upcoming Events &
 * Competitions" grid (events.html, #eventsGrid) with live documents from the
 * Firestore `events` collection.
 *
 * Firestore document shape written by admin.html:
 *   {
 *     title:            string,   // e.g. "Lexicon Mastery"
 *     category:         string,   // e.g. "Organizing Track"  (badge label)
 *     description:      string,   // short text shown on the card
 *     date:             string,   // display date, e.g. "Wed, Oct 14"
 *     time:             string,   // display time, e.g. "2:00 PM - 2:30 PM"
 *     venue:            string,
 *     registrationLink: string,   // URL behind the "Reg Now" button
 *     posterUrl:        string?,   // optional ImgBB https URL (square poster)
 *     status:           string?,   // 'open' | 'closed' | 'completed'
 *     createdAt:        Timestamp // serverTimestamp()
 *   }
 *
 * The feed subscribes with onSnapshot(), so an event published from the admin
 * console appears on events.html instantly — no reload required. Rendered
 * cards reuse the exact existing UI (dark green .event-card, gold/crimson/navy
 * badges, date badge, meta icons, RSVP button) so dynamic and static markup
 * are visually identical.
 *
 * After every render a `ells:events-updated` event is dispatched on document
 * so js/events.js can re-apply the category/search filters and the local RSVP
 * "Reserved" state to the fresh cards.
 * ---------------------------------------------------------------------------
 */

import {
  db,
  auth,
  EVENTS_COLLECTION,
  collection,
  onSnapshot,
  onAuthStateChanged
} from './firebase-config.js';

/* ---------------------------------------------------------------------------
   Registration status — drives the public "Reg Now" control.
   ---------------------------------------------------------------------------
   'open'      → a live link / RSVP button
   'closed'    → a disabled chip reading "Reg Closed"
   'completed' → a disabled chip reading "Completed"
   Documents written before the field existed have no `status` key; they are
   treated as open.
   --------------------------------------------------------------------------- */

const EVENT_STATUS = {
  open: {
    key: 'open',
    label: 'Registration Open',
    cta: 'Reg Now',
    badge: 'status-open'
  },
  closed: {
    key: 'closed',
    label: 'Registration Closed',
    cta: 'Reg Closed',
    badge: 'status-closed'
  },
  completed: {
    key: 'completed',
    label: 'Completed',
    cta: 'Completed',
    badge: 'status-completed'
  }
};

function normalizeEventStatus(value) {
  const raw = safeText(value).toLowerCase();
  return Object.prototype.hasOwnProperty.call(EVENT_STATUS, raw) ? raw : 'open';
}

/* ---------------------------------------------------------------------------
   Category/Track taxonomy — badge label written by the admin form is mapped
   to the filter-pill keys used by js/events.js and to a badge colour that
   matches the original static cards.
   --------------------------------------------------------------------------- */

const CATEGORY_TAXONOMY = {
  'Organizing Track':        { keys: 'organizing',          badge: 'badge-gold' },
  'Creative Writing':        { keys: 'literary organizing', badge: 'badge-crimson' },
  'Literary Challenge':      { keys: 'literary',            badge: 'badge-gold' },
  'Debate Track':            { keys: 'debate',              badge: 'badge-navy' },
  'Workshop':                { keys: 'workshops',           badge: 'badge-navy' },
  'Career Guidance':         { keys: 'workshops',           badge: 'badge-navy' },
  'Professional Track':      { keys: 'workshops',           badge: 'badge-navy' },
  'Sports & Strategy':       { keys: 'sports',              badge: 'badge-gold' },
  'Sports Track':            { keys: 'sports',              badge: 'badge-crimson' },
  'Cultural Evening':        { keys: 'cultural',            badge: 'badge-gold' },
  'Annual Excursion':        { keys: 'cultural',            badge: 'badge-crimson' },
  'International Conference':{ keys: 'conference',          badge: 'badge-gold' }
};

const BADGE_BY_KEY = {
  organizing: 'badge-gold',
  literary: 'badge-gold',
  debate: 'badge-navy',
  workshops: 'badge-navy',
  sports: 'badge-crimson',
  cultural: 'badge-gold',
  conference: 'badge-gold'
};

/** Map any category label (known or hand-written) to filter keys + badge. */
function taxonomyFor(categoryLabel) {
  const label = safeText(categoryLabel);
  const known = CATEGORY_TAXONOMY[label];
  if (known) return known;

  // Keyword fallback so hand-crafted docs still filter and colour sensibly.
  const l = label.toLowerCase();
  const keys = [];
  if (/organiz|committee/.test(l)) keys.push('organizing');
  if (/writ|liter|poetry|prose|novel|story/.test(l)) keys.push('literary');
  if (/debat|quiz|declam/.test(l)) keys.push('debate');
  if (/workshop|career|professional|masterclass|training|seminar/.test(l)) keys.push('workshops');
  if (/sport|chess|football|cricket|esport|game|tournament/.test(l)) keys.push('sports');
  if (/cultur|tour|excursion|reunion|qawwali|festival|night/.test(l)) keys.push('cultural');
  if (/conference|symposium|congress/.test(l)) keys.push('conference');

  const firstKey = keys[0] || 'literary';
  return {
    keys: keys.length ? keys.join(' ') : 'literary',
    badge: BADGE_BY_KEY[firstKey] || 'badge-gold'
  };
}

/* ---------------------------------------------------------------------------
   Feed subscription
   --------------------------------------------------------------------------- */

function initEventsFeed(gridEl, options = {}) {
  let hasRendered = false;
  let unsubscribeAuth = null;

  const statusPanelId = options.statusPanelId || 'eventsFeedStatus';
  const maxCards = Number.isFinite(options.limit) ? options.limit : Infinity;
  const variant = options.variant || '';

  setFeedState('loading', statusPanelId);

  // No orderBy on purpose: the display `date` is free text ("Wed, Oct 14"),
  // so the schedule order is computed client-side (see compareEvents).
  const unsubscribeSnapshot = onSnapshot(
    collection(db, EVENTS_COLLECTION),
    (snapshot) => {
      const events = snapshot.docs.map((docSnap) => {
        const data = docSnap.data() || {};
        return {
          id: docSnap.id,
          title: safeText(data.title),
          category: safeText(data.category),
          description: safeText(data.description),
          date: safeText(data.date),
          time: safeText(data.time),
          venue: safeText(data.venue),
          registrationLink: safeText(data.registrationLink),
          posterUrl: safeText(data.posterUrl),
          status: normalizeEventStatus(data.status),
          createdAt: toMillis(data.createdAt)
        };
      });

      events.sort(compareEvents);

      /* The homepage strip is titled "Upcoming…", so finished events are
         pushed behind everything still to come before the cap is applied. */
      const ordered = variant === 'home'
        ? [
            ...events.filter((evt) => evt.status !== 'completed'),
            ...events.filter((evt) => evt.status === 'completed')
          ]
        : events;

      const visible = maxCards === Infinity ? ordered : ordered.slice(0, maxCards);
      renderEvents(gridEl, visible, variant);
      setFeedState(visible.length ? 'ready' : 'empty', statusPanelId, variant);
      hasRendered = true;
    },
    (error) => {
      console.error('[ELLS] Events feed subscription failed:', error);

      // A signed-in administrator can retry the read once the token is fresh;
      // everyone else simply sees the offline message.
      if (!hasRendered && error && error.code === 'permission-denied' && !unsubscribeAuth) {
        unsubscribeAuth = onAuthStateChanged(auth, (user) => {
          if (unsubscribeAuth) {
            unsubscribeAuth();
            unsubscribeAuth = null;
          }
          if (!user) setFeedState('error', statusPanelId, variant);
        });
      }

      if (!hasRendered) setFeedState('error', statusPanelId, variant);
    }
  );

  window.addEventListener('pagehide', () => {
    unsubscribeSnapshot();
    if (unsubscribeAuth) unsubscribeAuth();
  });
}

/* ---------------------------------------------------------------------------
   Rendering — byte-for-byte the same structure as the old hardcoded cards.
   --------------------------------------------------------------------------- */

function renderEvents(gridEl, events, variant = '') {
  gridEl.textContent = '';

  events.forEach((evt) => {
    gridEl.appendChild(buildEventCard(evt, variant));
  });

  // Let js/events.js re-apply filters/booked state to the fresh cards.
  document.dispatchEvent(new CustomEvent('ells:events-updated', { detail: { count: events.length } }));
}

function buildEventCard(evt, variant = '') {
  const taxonomy = taxonomyFor(evt.category);
  const badgeParts = splitDisplayDate(evt.date);
  const status = EVENT_STATUS[normalizeEventStatus(evt.status)];

  const card = document.createElement('article');
  card.className = 'event-card event-card--poster';
  if (variant) card.classList.add(`event-card--${variant}`);
  card.dataset.status = status.key;
  if (status.key !== 'open') card.classList.add('is-registration-closed');
  card.dataset.category = taxonomy.keys;
  card.dataset.eventId = evt.id;
  card.setAttribute('aria-labelledby', `eventTitle-${evt.id}`);

  /* ---- 1. Square poster (left on desktop, on top on mobile) ---- */
  const poster = document.createElement('div');
  poster.className = 'event-card__poster';

  const posterUrl = normalizeHttpUrl(evt.posterUrl);
  const titleText = evt.title || 'Untitled Event';

  if (posterUrl) {
    const img = document.createElement('img');
    img.className = 'event-card__poster-img';
    img.src = posterUrl;
    img.alt = `${titleText} — ELLS event poster`;
    img.setAttribute('loading', 'lazy');
    img.setAttribute('decoding', 'async');
    img.setAttribute('referrerpolicy', 'no-referrer');
    // A dead/blocked URL must never leave a broken-image icon on the card.
    img.addEventListener('error', () => {
      poster.removeChild(img);
      poster.appendChild(buildPosterPlaceholder(evt.category));
    }, { once: true });
    poster.appendChild(img);
  } else {
    poster.appendChild(buildPosterPlaceholder(evt.category));
  }

  /* ---- 2. Details column ---- */
  const details = document.createElement('div');
  details.className = 'event-card__details';

  /* Header: date badge + category badge */
  const header = document.createElement('div');
  header.className = 'event-card-header';

  const dateBadge = document.createElement('div');
  dateBadge.className = 'event-date-badge';
  dateBadge.setAttribute('aria-label', [evt.date, evt.time].filter(Boolean).join(' • ') || 'Date to be announced');

  const monthEl = document.createElement('span');
  monthEl.className = 'event-date-month';
  monthEl.textContent = badgeParts.month;

  const dayEl = document.createElement('span');
  dayEl.className = 'event-date-day';
  dayEl.textContent = badgeParts.day;
  if (badgeParts.day.length > 2) {
    // Long values ("21-28", "TBD") shrink exactly like the original cards.
    dayEl.style.fontSize = badgeParts.day.length > 5 ? '1.0rem' : '1.15rem';
    dayEl.style.lineHeight = '1.2';
  }

  dateBadge.append(monthEl, dayEl);

  const badges = document.createElement('span');
  badges.className = 'event-card__badges';

  const badge = document.createElement('span');
  badge.className = `badge ${taxonomy.badge}`;
  badge.textContent = evt.category || 'Event';
  badges.appendChild(badge);

  /* Registration state is only advertised when it is NOT open — an "Open"
     chip on every card would just be noise. */
  if (status.key !== 'open') {
    const statusChip = document.createElement('span');
    statusChip.className = `badge event-status-badge ${status.badge}`;
    statusChip.textContent = status.label;
    badges.appendChild(statusChip);
  }

  header.append(dateBadge, badges);

  /* Body: title + description + meta + footer */
  const body = document.createElement('div');
  body.className = 'event-card-body';

  const title = document.createElement('h3');
  title.id = `eventTitle-${evt.id}`;
  title.textContent = titleText;

  const description = document.createElement('p');
  description.textContent = evt.description;

  const meta = document.createElement('div');
  meta.className = 'event-meta';
  meta.appendChild(buildMetaItem([evt.date, evt.time].filter(Boolean).join(' • ') || 'Schedule TBA', 'clock'));
  meta.appendChild(buildMetaItem(evt.venue || 'Venue TBA', 'pin'));
  meta.appendChild(buildMetaItem(`Track: ${evt.category || 'ELLS Committee'}`, 'person'));

  const footer = document.createElement('div');
  footer.className = 'event-card-footer';

  const seats = document.createElement('span');
  seats.className = `seats-indicator seats-indicator--${status.key}`;
  seats.textContent = status.key === 'open' ? 'Open Registration' : status.label;

  footer.append(seats, buildRsvpControl(evt));

  body.append(title, description, meta, footer);
  details.append(header, body);
  card.append(poster, details);

  return card;
}

/**
 * Poster placeholder — midnight-blue panel with the soft-gold ELLS mark.
 * Used when an event has no posterUrl, and as the graceful fallback when an
 * uploaded poster fails to load.
 */
function buildPosterPlaceholder(category) {
  const placeholder = document.createElement('div');
  placeholder.className = 'event-card__poster-placeholder';
  placeholder.setAttribute('aria-hidden', 'true');

  const mark = document.createElement('span');
  mark.className = 'event-card__poster-mark';
  mark.textContent = 'ELLS';

  const caption = document.createElement('span');
  caption.className = 'event-card__poster-caption';
  caption.textContent = category ? String(category) : 'Literary Society';

  placeholder.append(mark, caption);
  return placeholder;
}

/**
 * "Reg Now/RSVP" control — a direct link to the registration URL entered in
 * the admin form (opens in a new tab). Only when an event genuinely has no
 * link does it fall back to the on-page RSVP dialog.
 */
function buildRsvpControl(evt) {
  const status = EVENT_STATUS[normalizeEventStatus(evt.status)];

  /* Closed / completed events keep their card, but the call to action is a
     non-interactive chip: no href, no click target, still readable. Rather
     than a disabled <a> (which is not a real thing in HTML) this is a plain
     <span> with aria-disabled, so screen readers and keyboards skip it. */
  if (status.key !== 'open') {
    const chip = document.createElement('span');
    chip.className = `btn btn-sm event-cta-disabled is-${status.key}`;
    chip.setAttribute('role', 'button');
    chip.setAttribute('aria-disabled', 'true');
    chip.setAttribute('tabindex', '-1');
    chip.title = status.key === 'closed'
      ? 'Registration for this event has closed.'
      : 'This event has already taken place.';
    chip.textContent = status.cta;
    return chip;
  }

  const url = normalizeHttpUrl(evt.registrationLink);

  if (url) {
    const link = document.createElement('a');
    link.href = url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.className = 'btn btn-primary btn-sm';
    link.textContent = status.cta;
    return link;
  }

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'btn btn-primary btn-sm open-rsvp-modal';
  button.textContent = status.cta;
  return button;
}

function buildMetaItem(text, iconName) {
  const item = document.createElement('div');
  item.className = 'event-meta-item';
  item.insertAdjacentHTML('beforeend', ICONS[iconName] || ICONS.clock);

  const span = document.createElement('span');
  span.textContent = text;

  item.appendChild(span);
  return item;
}

const ICONS = {
  clock:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>',
  pin:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>',
  person:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>'
};

/* ---------------------------------------------------------------------------
   Feed states (loading / empty / error) — the status panel is only shown
   while the grid has no events to display.
   --------------------------------------------------------------------------- */

const FEED_STATE_COPY = {
  loading: {
    eyebrow: 'One moment',
    title: 'Loading upcoming events…',
    text: 'Fetching the latest schedule from ELLS Club.',
    spinner: true
  },
  empty: {
    eyebrow: 'Stay tuned',
    title: 'No Upcoming Events Right Now',
    text: 'New competitions and workshops will be announced soon! Keep an eye on this page and on the ELLS notice board.',
    spinner: false
  },
  error: {
    eyebrow: 'Offline',
    title: 'Events feed is temporarily unavailable',
    text: 'We could not reach the ELLS events archive. Please refresh the page in a moment.',
    spinner: false
  }
};

/** Compact copy for the homepage strip, which is deliberately shorter. */
const HOME_STATE_COPY = {
  loading: FEED_STATE_COPY.loading,
  empty: {
    eyebrow: 'Stay tuned',
    title: 'No Upcoming Events Right Now',
    text: 'New competitions and workshops will be announced soon!',
    spinner: false
  },
  error: FEED_STATE_COPY.error
};

function setFeedState(state, panelId = 'eventsFeedStatus', variant = '') {
  const panel = document.getElementById(panelId);
  if (!panel) return;

  const gridEl = document.getElementById(variant === 'home' ? 'homeEventsGrid' : 'eventsGrid');
  if (gridEl) gridEl.setAttribute('aria-busy', state === 'loading' ? 'true' : 'false');

  panel.dataset.state = state;

  if (state === 'ready') {
    panel.hidden = true;
    return;
  }

  const copy = (variant === 'home' ? HOME_STATE_COPY : FEED_STATE_COPY)[state];
  if (!copy) return;

  panel.hidden = false;

  const eyebrowEl = panel.querySelector('[data-event-status-eyebrow]');
  const titleEl = panel.querySelector('[data-event-status-title]');
  const textEl = panel.querySelector('[data-event-status-text]');
  if (eyebrowEl && copy.eyebrow) eyebrowEl.textContent = copy.eyebrow;
  if (titleEl) titleEl.textContent = copy.title;
  if (textEl) textEl.textContent = copy.text;

  const spinner = panel.querySelector('.notice-board-state__spinner');
  if (spinner) spinner.hidden = !copy.spinner;
}

/* ---------------------------------------------------------------------------
   Helpers
   --------------------------------------------------------------------------- */

const MONTH_INDEX = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11
};

/**
 * Split a display date ("Wed, Oct 14", "Oct 21 – Oct 28", "Nov 26 – 27, 2026",
 * "Last Week of November 2026", "Schedule TBA") into the month/day slots of
 * the .event-date-badge.
 */
function splitDisplayDate(dateStr) {
  const raw = safeText(dateStr);
  if (!raw) return { month: 'TBA', day: 'TBA', monthIndex: 12, dayNumber: 99 };

  const lower = raw.toLowerCase();
  let monthIndex = 12;
  for (const name of Object.keys(MONTH_INDEX)) {
    const match = lower.match(new RegExp(`\\b${name}[a-z]*\\b`));
    if (match) {
      monthIndex = MONTH_INDEX[name];
      break;
    }
  }

  const monthLabel = monthIndex < 12
    ? Object.keys(MONTH_INDEX)[monthIndex].toUpperCase()
    : 'TBA';

  // Ignore 4-digit years before hunting for day numbers ("… November 2026").
  const withoutYears = raw.replace(/\b(19|20)\d{2}\b/g, ' ');

  let dayLabel = '';
  const range = withoutYears.match(/(\d{1,2})\s*(?:[-–—]|to)\s*(?:[A-Za-z]{3,9}\s*)?(\d{1,2})/);
  if (range) {
    dayLabel = `${range[1]}-${range[2]}`;
  } else {
    const single = withoutYears.match(/\b(\d{1,2})\b/);
    if (single) dayLabel = single[1];
  }

  if (!dayLabel) dayLabel = 'TBD';

  const dayNumber = parseInt(dayLabel, 10);
  return {
    month: monthLabel,
    day: dayLabel,
    monthIndex,
    dayNumber: Number.isNaN(dayNumber) ? 99 : dayNumber
  };
}

/** Schedule order: by month/day of the display date, then publish time. */
function compareEvents(a, b) {
  const dateA = splitDisplayDate(a.date);
  const dateB = splitDisplayDate(b.date);

  if (dateA.monthIndex !== dateB.monthIndex) return dateA.monthIndex - dateB.monthIndex;
  if (dateA.dayNumber !== dateB.dayNumber) return dateA.dayNumber - dateB.dayNumber;
  return (a.createdAt || 0) - (b.createdAt || 0);
}

/** Firestore may return a Timestamp, an ISO string, or a Date — accept all. */
function toMillis(value) {
  if (!value) return 0;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (typeof value.toDate === 'function') return value.toDate().getTime();
  if (typeof value === 'object' && typeof value.seconds === 'number') return value.seconds * 1000;
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return 0;
}

function safeText(value) {
  if (typeof value === 'string') return value.trim();
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

/** Registration links must be plain http(s) URLs — anything else is ignored. */
function normalizeHttpUrl(value) {
  const raw = safeText(value);
  if (!raw) return '';
  try {
    const url = new URL(raw);
    return (url.protocol === 'http:' || url.protocol === 'https:') ? url.href : '';
  } catch {
    return '';
  }
}

/* ---------------------------------------------------------------------------
   Bootstrap — runs after every declaration above is initialised.
   --------------------------------------------------------------------------- */

/* Full events page */
const grid = document.getElementById('eventsGrid');
if (grid) {
  initEventsFeed(grid, {
    statusPanelId: 'eventsFeedStatus',
    variant: 'full'
  });
}

/* Homepage strip — same Firestore feed, capped at the three next events */
const homeGrid = document.getElementById('homeEventsGrid');
if (homeGrid) {
  initEventsFeed(homeGrid, {
    statusPanelId: 'homeEventsStatus',
    variant: 'home',
    limit: 3
  });
}
