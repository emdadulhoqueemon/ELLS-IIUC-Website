/**
 * ELLS Club - Main JavaScript Module
 * Handles the locked Midnight theme, Mobile Navigation Drawer, Toasts and Global Interactions
 */

document.addEventListener('DOMContentLoaded', () => {
  lockMidnightTheme();
  initNavigation();
  initHeaderScroll();
  initNewsletterForms();
  highlightActiveLink();
  initSocialLinks();
  initCommitteeFilter();
  initNoticeBoard();
});

/* --------------------------------------------------------------------------
   1. Theme Lock — "Midnight Blue & Soft Gold" is permanent (no switcher)
   --------------------------------------------------------------------------
   The stylesheet now declares the Midnight palette on :root only: there is no
   light token set, no toggle button and no listener, so dark cannot be turned
   off. The only job left for JavaScript is housekeeping after the removed
   control — a visitor who chose a theme during an older visit can still have a
   stale "ells-theme" entry in localStorage, which is dropped here so it can
   never leak back, while <html> is pinned to data-theme="dark".
   -------------------------------------------------------------------------- */
function lockMidnightTheme() {
  const root = document.documentElement;

  try {
    localStorage.removeItem('ells-theme');
  } catch (err) {
    /* Storage unavailable (private mode / blocked cookies): the hardcoded
       data-theme="dark" attribute in the markup already keeps the site dark. */
  }

  root.setAttribute('data-theme', 'dark');
  root.style.colorScheme = 'dark';
}

/* --------------------------------------------------------------------------
   2. Responsive Navigation Drawer & Background Scroll Lock
   -------------------------------------------------------------------------- */
function initNavigation() {
  const toggleBtn = document.getElementById('mobileNavToggle');
  const mainNav = document.getElementById('mainNav');
  const backdrop = document.getElementById('navBackdrop');
  const header = document.querySelector('.site-header');

  if (!toggleBtn || !mainNav) return;

  function openMenu() {
    toggleBtn.classList.add('active');
    toggleBtn.setAttribute('aria-expanded', 'true');
    mainNav.classList.add('open');
    if (backdrop) backdrop.classList.add('open');
    document.body.classList.add('nav-open');
    document.documentElement.classList.add('nav-open');
    if (header) {
      header.classList.remove('header-hidden', 'is-hidden');
      header.style.top = '0px';
    }
  }

  function closeMenu() {
    toggleBtn.classList.remove('active');
    toggleBtn.setAttribute('aria-expanded', 'false');
    mainNav.classList.remove('open');
    if (backdrop) backdrop.classList.remove('open');
    document.body.classList.remove('nav-open');
    document.documentElement.classList.remove('nav-open');
  }

  toggleBtn.addEventListener('click', () => {
    const isOpen = mainNav.classList.contains('open');
    isOpen ? closeMenu() : openMenu();
  });

  if (backdrop) {
    backdrop.addEventListener('click', closeMenu);
  }

  // Close on Escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && mainNav.classList.contains('open')) {
      closeMenu();
    }
  });

  // Close menu when a navigation link is clicked
  const links = mainNav.querySelectorAll('.nav-link, .btn');
  links.forEach(link => {
    link.addEventListener('click', () => {
      if (window.innerWidth <= 768) {
        closeMenu();
      }
    });
  });

  // Automatically reset menu state if window is resized above mobile breakpoint
  window.addEventListener('resize', () => {
    if (window.innerWidth > 768 && mainNav.classList.contains('open')) {
      closeMenu();
    }
  }, { passive: true });
}

/* --------------------------------------------------------------------------
   3. Smart Sticky Header — explicit show/hide on scroll direction
   --------------------------------------------------------------------------
   Contract with css/polish.css (.site-header):
     position: fixed; top: 0; width: 100%; z-index: 9999;
     transition: top 0.3s ease-in-out;

   Behaviour (required):
     • scrolling DOWN  → header.style.top = '-<header height>px'  (hide)
     • scrolling UP    → header.style.top = '0'                   (reveal)
     • at the very top → always visible

   Implementation notes:
     • `lastScrollTop` tracks the previous position; the delta drives the
       direction decision, so a 1px rubber-band wobble cannot flicker the bar.
     • scroll events are coalesced into one requestAnimationFrame tick.
     • the bar is always shown when the mobile drawer is open, when something
       inside it receives focus, and when the page is restored from the
       back/forward cache or resized back to the top.
   -------------------------------------------------------------------------- */
function initHeaderScroll() {
  const header = document.querySelector('.site-header') || document.querySelector('header');
  if (!header) return;

  const HIDE_CLASS = 'is-hidden';
  const JITTER = 6; // px of movement before we react (kills touch jitter)
  let lastScrollTop = Math.max(
    window.pageYOffset || document.documentElement.scrollTop || 0,
    0
  );
  let ticking = false;

  function headerHeight() {
    // 70px on phones (responsive.css), 80px on desktop — used only when the
    // element cannot report its own height (e.g. before layout).
    return header.offsetHeight || (window.innerWidth <= 768 ? 70 : 80);
  }

  function showHeader() {
    header.style.top = '0px';
    header.classList.remove(HIDE_CLASS, 'header-hidden');
  }

  function hideHeader() {
    header.style.top = `-${headerHeight()}px`;
    header.classList.add(HIDE_CLASS);
  }

  function currentScrollTop() {
    return Math.max(
      window.pageYOffset || document.documentElement.scrollTop || 0,
      0
    );
  }

  function updateHeader() {
    ticking = false;

    const scrollTop = currentScrollTop();
    const delta = scrollTop - lastScrollTop;

    // Shadow once the page has moved a little.
    header.classList.toggle('scrolled', scrollTop > 8);

    // Never hide the bar while the mobile drawer is open.
    if (document.body.classList.contains('nav-open')) {
      showHeader();
      lastScrollTop = scrollTop;
      return;
    }

    if (scrollTop <= 0) {
      // Pinned at the top of the page — the header always belongs here.
      showHeader();
    } else if (delta > JITTER && scrollTop > headerHeight()) {
      // Scrolling DOWN → slide the bar out of view.
      hideHeader();
    } else if (delta < -JITTER) {
      // Scrolling UP → bring it straight back.
      showHeader();
    }

    lastScrollTop = scrollTop;
  }

  function onScroll() {
    if (ticking) return;
    ticking = true;
    window.requestAnimationFrame(updateHeader);
  }

  window.addEventListener('scroll', onScroll, { passive: true });

  // Re-reveal the bar in the situations where hiding it would strand the user.
  window.addEventListener('resize', () => {
    if (currentScrollTop() <= 0) showHeader();
  }, { passive: true });

  header.addEventListener('focusin', showHeader);
  window.addEventListener('hashchange', showHeader);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) showHeader();
  });

  // Start visible, even when the browser restores a scrolled position.
  showHeader();
}

/* --------------------------------------------------------------------------
   4. Active Page Link Highlighting
   -------------------------------------------------------------------------- */
function highlightActiveLink() {
  const currentPath = window.location.pathname;
  const pageName = currentPath.substring(currentPath.lastIndexOf('/') + 1) || 'index.html';
  const navLinks = document.querySelectorAll('.nav-link');

  navLinks.forEach(link => {
    const href = link.getAttribute('href');
    if (href === pageName || (pageName === '' && href === 'index.html')) {
      link.classList.add('active');
      link.setAttribute('aria-current', 'page');
    } else {
      link.classList.remove('active');
      link.removeAttribute('aria-current');
    }
  });
}

/* --------------------------------------------------------------------------
   5. Newsletter Form Handling
   -------------------------------------------------------------------------- */
function initNewsletterForms() {
  const forms = document.querySelectorAll('.newsletter-form');
  forms.forEach(form => {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const input = form.querySelector('input[type="email"]');
      if (input && input.value) {
        const email = input.value.trim();
        if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          showToast(`Thank you! ${email} has been subscribed to The Scribe Gazette.`, 'success');
          input.value = '';
        } else {
          showToast('Please provide a valid email address.', 'error');
        }
      }
    });
  });
}

/* --------------------------------------------------------------------------
   6. Global Toast Notification System
   -------------------------------------------------------------------------- */
function showToast(message, type = 'info') {
  let container = document.querySelector('.toast-container');
  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-container';
    container.setAttribute('aria-live', 'polite');
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;

  const iconSvg = type === 'success' 
    ? `<svg class="toast-icon" viewBox="0 0 24 24"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>`
    : type === 'error'
    ? `<svg class="toast-icon" viewBox="0 0 24 24" style="fill:none;stroke:currentColor;stroke-width:2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>`
    : `<svg class="toast-icon" viewBox="0 0 24 24" style="fill:none;stroke:currentColor;stroke-width:2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`;

  toast.innerHTML = `
    ${iconSvg}
    <span>${message}</span>
  `;

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => {
      if (toast.parentElement) toast.parentElement.removeChild(toast);
    }, 300);
  }, 4200);
}

// Expose globally
window.showToast = showToast;

/* --------------------------------------------------------------------------
   7. Social Media Link Handling
   -------------------------------------------------------------------------- */
function initSocialLinks() {
  document.querySelectorAll('a[href*="apnar FB link ekhane din"]').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      window.open('https://www.facebook.com/ELLS.IIUC/', '_blank', 'noopener,noreferrer');
    });
  });
}

/* --------------------------------------------------------------------------
   8. Committee Directory Filter & Search (About Page)
   -------------------------------------------------------------------------- */
function initCommitteeFilter() {
  const pills = document.querySelectorAll('.committee-pill');
  const searchInput = document.getElementById('committeeSearchInput');
  const cards = document.querySelectorAll('.committee-card');
  const subheadings = document.querySelectorAll('.committee-subheading');

  if (!cards.length) return;

  let activeCategory = 'all';
  let searchQuery = '';

  function filterDirectory() {
    cards.forEach(card => {
      const category = card.getAttribute('data-category') || '';
      const text = card.textContent.toLowerCase();

      const matchesCat = (activeCategory === 'all' || category === activeCategory);
      const matchesSearch = !searchQuery || text.includes(searchQuery);

      if (matchesCat && matchesSearch) {
        card.style.display = 'flex';
      } else {
        card.style.display = 'none';
      }
    });

    // Toggle subheadings if all cards under it are hidden
    subheadings.forEach(sub => {
      const targetCat = sub.getAttribute('data-category');
      if (activeCategory === 'all') {
        const nextGrid = sub.nextElementSibling;
        if (nextGrid && nextGrid.classList.contains('committee-grid')) {
          const visible = Array.from(nextGrid.querySelectorAll('.committee-card')).some(c => c.style.display !== 'none');
          sub.style.display = visible ? 'flex' : 'none';
        }
      } else {
        sub.style.display = (targetCat === activeCategory) ? 'flex' : 'none';
      }
    });
  }

  pills.forEach(pill => {
    pill.addEventListener('click', () => {
      pills.forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      activeCategory = pill.getAttribute('data-filter') || 'all';
      filterDirectory();
    });
  });

  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      searchQuery = e.target.value.toLowerCase().trim();
      filterDirectory();
    });
  }
}

/* --------------------------------------------------------------------------
   9. Dynamic Notice Board Interactions (Pause on Hover/Touch/Focus)
   -------------------------------------------------------------------------- */
function initNoticeBoard() {
  // Support News Ticker Bar touch pause/resume on mobile
  const tickerBar = document.querySelector('.news-ticker-bar');
  const tickerTrack = document.querySelector('.news-ticker-track');
  if (tickerBar && tickerTrack) {
    let tickerResumeTimer = null;
    tickerBar.addEventListener('touchstart', () => {
      tickerTrack.style.animationPlayState = 'paused';
      if (tickerResumeTimer) clearTimeout(tickerResumeTimer);
    }, { passive: true });

    tickerBar.addEventListener('touchend', () => {
      tickerResumeTimer = setTimeout(() => {
        tickerTrack.style.animationPlayState = 'running';
      }, 2500);
    }, { passive: true });
  }

  // Legacy notice banner support if present
  const banner = document.querySelector('.notice-board-banner');
  const track = document.querySelector('.notice-marquee-track');
  if (!banner || !track) return;

  // On touch screens, touchstart pauses scrolling, touchend resumes after a brief delay
  let resumeTimer = null;
  banner.addEventListener('touchstart', () => {
    track.style.animationPlayState = 'paused';
    if (resumeTimer) clearTimeout(resumeTimer);
  }, { passive: true });

  banner.addEventListener('touchend', () => {
    resumeTimer = setTimeout(() => {
      track.style.animationPlayState = 'running';
    }, 2500);
  }, { passive: true });
}
