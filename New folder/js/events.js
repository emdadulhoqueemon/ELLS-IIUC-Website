/**
 * ELLS Club - Events Page Module
 * Dynamic search, category filtering, native <dialog> RSVP system & seat management
 */

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
  const eventCards = document.querySelectorAll('.event-card');
  const noResultsMsg = document.getElementById('noEventsMatch');

  let activeCategory = 'all';
  let searchQuery = '';

  function filterEvents() {
    let visibleCount = 0;

    eventCards.forEach(card => {
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
        card.style.display = 'flex';
        visibleCount++;
      } else {
        card.style.display = 'none';
      }
    });

    if (noResultsMsg) {
      noResultsMsg.style.display = visibleCount === 0 ? 'block' : 'none';
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
}

/* --------------------------------------------------------------------------
   2. Native <dialog> RSVP System
   -------------------------------------------------------------------------- */
function initRsvpModal() {
  const modal = document.getElementById('rsvpModal');
  const rsvpForm = document.getElementById('rsvpForm');
  const rsvpBtns = document.querySelectorAll('.open-rsvp-modal');
  const modalCloseBtn = document.getElementById('closeRsvpModal');
  const modalCancelBtn = document.getElementById('cancelRsvpModal');
  const modalEventTitle = document.getElementById('modalEventTitle');
  const modalEventDate = document.getElementById('modalEventDate');
  const modalEventIdInput = document.getElementById('modalEventId');

  if (!modal || !rsvpForm) return;

  // Track RSVPs in localStorage
  const savedRsvps = JSON.parse(localStorage.getItem('ells-rsvps') || '[]');

  // Update UI for previously booked events
  updateBookedEvents(savedRsvps);

  // Open Modal
  rsvpBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const card = btn.closest('.event-card');
      if (!card) return;

      const eventId = card.getAttribute('data-event-id');
      const eventTitle = card.querySelector('h3')?.textContent || 'Society Event';
      const eventDate = card.querySelector('.event-meta-item:first-child')?.textContent || '';

      if (savedRsvps.includes(eventId)) {
        showToast('You have already reserved seats for this event!', 'info');
        return;
      }

      if (modalEventTitle) modalEventTitle.textContent = eventTitle;
      if (modalEventDate) modalEventDate.textContent = eventDate.trim();
      if (modalEventIdInput) modalEventIdInput.value = eventId;

      modal.showModal();
    });
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
      localStorage.setItem('ells-rsvps', JSON.stringify(savedRsvps));
    }

    closeModal();
    updateBookedEvents(savedRsvps);

    showToast(`RSVP Confirmed for ${name}! Check ${email} for your invitation pass.`, 'success');
  });

  function updateBookedEvents(rsvps) {
    rsvps.forEach(id => {
      const card = document.querySelector(`.event-card[data-event-id="${id}"]`);
      if (card) {
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
