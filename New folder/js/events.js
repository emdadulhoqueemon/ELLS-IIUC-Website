/**
 * ELLS Club - Events Page Module
 * Dynamic search, category filtering, native <dialog> RSVP system & seat management
 */

/* Storage-safe RSVP helpers — never let blocked storage break the modal. */
const RSVP_STORAGE_KEY = 'ells-rsvps';

function readStoredRsvps() {
  try {
    const raw = window.localStorage ? window.localStorage.getItem(RSVP_STORAGE_KEY) : null;
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.warn('[ELLS] RSVP storage unavailable (read):', error);
    return [];
  }
}

function writeStoredRsvps(list) {
  try {
    if (window.localStorage) {
      window.localStorage.setItem(RSVP_STORAGE_KEY, JSON.stringify(list));
    }
  } catch (error) {
    console.warn('[ELLS] RSVP storage unavailable (write):', error);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  initEventFilters();
  initRsvpModal();
});

/* --------------------------------------------------------------------------
   1. Event Filtering (Categories + Search)
   -------------------------------------------------------------------------- */
function initEventFilters() {
  const filterBtns = document.querySelectorAll('.filter-btn');
  const searchInput = document.getElementById('eventSearchInput');
  const noResultsMsg = document.getElementById('noEventsMatch');

  // The Firestore feed (js/events-feed.js) replaces every card after load, so
  // always read the cards fresh instead of freezing a NodeList up front.
  const getEventCards = () => Array.from(document.querySelectorAll('.event-card'));

  let activeCategory = 'all';
  let searchQuery = '';

  function filterEvents() {
    let visibleCount = 0;

    getEventCards().forEach(card => {
      const category = (card.getAttribute('data-category') || '').toLowerCase();
      const title = (card.querySelector('h3')?.textContent || '').toLowerCase();
      const desc = (card.querySelector('p')?.textContent || '').toLowerCase();
      const meta = (card.querySelector('.event-meta')?.textContent || '').toLowerCase();

      const cardCategories = category.split(/\s+/);
      const matchesCategory = (activeCategory === 'all' || cardCategories.includes(activeCategory.toLowerCase()));
      const matchesSearch = !searchQuery || 
                            title.includes(searchQuery) || 
                            desc.includes(searchQuery) || 
                            meta.includes(searchQuery);

      if (matchesCategory && matchesSearch) {
        // Clear the inline style so the stylesheet decides: legacy cards are
        // flex columns, poster cards are grid (poster left / details right).
        card.style.display = '';
        visibleCount++;
      } else {
        card.style.display = 'none';
      }
    });

    /* With an empty Firestore collection the feed's own empty state is the
       message — "no events match your filters" would be a lie and a duplicate. */
    if (noResultsMsg) {
      const hasCards = getEventCards().length > 0;
      noResultsMsg.style.display = hasCards && visibleCount === 0 ? 'block' : 'none';
    }
  }

  // Category Pill Buttons
  filterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      filterBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeCategory = btn.getAttribute('data-filter') || 'all';
      filterEvents();
    });
  });

  // Search Input with Debounce
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      searchQuery = e.target.value.toLowerCase().trim();
      filterEvents();
    });
  }

  // The live feed re-renders #eventsGrid at any time; keep the active
  // category/search applied to the freshly built cards.
  document.addEventListener('ells:events-updated', filterEvents);
}

/* --------------------------------------------------------------------------
   2. Native <dialog> RSVP System
   -------------------------------------------------------------------------- */
function initRsvpModal() {
  const modal = document.getElementById('rsvpModal');
  const rsvpForm = document.getElementById('rsvpForm');

  const modalCloseBtn = document.getElementById('closeRsvpModal');
  const modalCancelBtn = document.getElementById('cancelRsvpModal');
  const modalEventTitle = document.getElementById('modalEventTitle');
  const modalEventDate = document.getElementById('modalEventDate');
  const modalEventIdInput = document.getElementById('modalEventId');

  if (!modal || !rsvpForm) return;

  // Track RSVPs locally (storage-safe: private modes may throw)
  const savedRsvps = readStoredRsvps();

  // Update UI for previously booked events
  updateBookedEvents(savedRsvps);

  // …and again whenever the live feed rebuilds the cards.
  document.addEventListener('ells:events-updated', () => updateBookedEvents(savedRsvps));

  /* Open Modal — delegated, because js/events-feed.js rebuilds every card
     from Firestore after this module has already run. */
  document.addEventListener('click', (event) => {
    const btn = event.target.closest('.open-rsvp-modal');
    if (!btn) return;

    const card = btn.closest('.event-card');
    if (!card) return;

    const eventId = card.getAttribute('data-event-id');
    const eventTitle = card.querySelector('h3')?.textContent || 'Society Event';
    const eventDate = card.querySelector('.event-meta-item:first-child')?.textContent || '';

    // Closed / completed events never open the RSVP dialog (the button is
    // normally rendered non-interactive; this is the belt-and-braces guard).
    const status = card.getAttribute('data-status') || 'open';
    if (status === 'closed' || status === 'completed') {
      showToast(
        status === 'closed'
          ? 'Registration for this event has closed.'
          : 'This event has already taken place.',
        'info'
      );
      return;
    }

    if (savedRsvps.includes(eventId)) {
      showToast('You have already reserved seats for this event!', 'info');
      return;
    }

    if (modalEventTitle) modalEventTitle.textContent = eventTitle;
    if (modalEventDate) modalEventDate.textContent = eventDate.trim();
    if (modalEventIdInput) modalEventIdInput.value = eventId;

    modal.showModal();
  });

  // Close handlers
  function closeModal() {
    modal.close();
    rsvpForm.reset();
  }

  if (modalCloseBtn) modalCloseBtn.addEventListener('click', closeModal);
  if (modalCancelBtn) modalCancelBtn.addEventListener('click', closeModal);

  // Backdrop click to close
  modal.addEventListener('click', (e) => {
    const dialogDimensions = modal.getBoundingClientRect();
    if (
      e.clientX < dialogDimensions.left ||
      e.clientX > dialogDimensions.right ||
      e.clientY < dialogDimensions.top ||
      e.clientY > dialogDimensions.bottom
    ) {
      closeModal();
    }
  });

  // Form submission
  rsvpForm.addEventListener('submit', (e) => {
    e.preventDefault();

    const eventId = modalEventIdInput ? modalEventIdInput.value : '';
    const name = (document.getElementById('rsvpName')?.value || '').trim();
    const email = (document.getElementById('rsvpEmail')?.value || '').trim();
    const guests = document.getElementById('rsvpGuests')?.value || '1';

    if (!name || !email) {
      showToast('Please fill out all required fields.', 'error');
      return;
    }

    // Save to local storage
    if (eventId && !savedRsvps.includes(eventId)) {
      savedRsvps.push(eventId);
      writeStoredRsvps(savedRsvps);
    }

    closeModal();
    updateBookedEvents(savedRsvps);

    showToast(`RSVP Confirmed for ${name}! Check ${email} for your invitation pass.`, 'success');
  });

  function updateBookedEvents(rsvps) {
    rsvps.forEach(id => {
      const card = document.querySelector(`.event-card[data-event-id="${id}"]`);
      if (card && card.getAttribute('data-status') !== 'closed'
        && card.getAttribute('data-status') !== 'completed') {
        const btn = card.querySelector('.open-rsvp-modal');
        if (btn) {
          btn.textContent = 'Reserved ✓';
          btn.classList.remove('btn-primary');
          btn.classList.add('btn-secondary');
          btn.style.borderColor = '#2e7d32';
          btn.style.color = '#2e7d32';
          btn.disabled = true;
          btn.style.cursor = 'default';
        }
        const seatIndicator = card.querySelector('.seats-indicator');
        if (seatIndicator) {
          seatIndicator.textContent = 'Your seat is saved';
          seatIndicator.style.color = '#2e7d32';
        }
      }
    });
  }
}
