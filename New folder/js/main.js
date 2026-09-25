/**
 * ELLS Club - Main JavaScript Module
 * Handles Theme Toggling, Mobile Navigation Drawer, Toasts, and Global Interactions
 */

document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  initNavigation();
  initHeaderScroll();
  initNewsletterForms();
  highlightActiveLink();
  initSocialLinks();
  initCommitteeFilter();
  initNoticeBoard();
});

/* --------------------------------------------------------------------------
   1. Theme Toggle (Light / Dark Mode)
   -------------------------------------------------------------------------- */
function initTheme() {
  const themeToggleBtn = document.getElementById('themeToggleBtn');
  const storedTheme = localStorage.getItem('ells-theme');
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

  // Determine initial theme
  const initialTheme = storedTheme || (prefersDark ? 'dark' : 'light');
  setTheme(initialTheme);

  if (themeToggleBtn) {
    themeToggleBtn.addEventListener('click', () => {
      const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
      const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
      setTheme(newTheme);
      showToast(`Switched to ${newTheme} mode`, 'info');
    });
  }
}

function setTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('ells-theme', theme);

  const themeToggleBtn = document.getElementById('themeToggleBtn');
  if (themeToggleBtn) {
    const isDark = theme === 'dark';
    themeToggleBtn.setAttribute('aria-label', `Switch to ${isDark ? 'light' : 'dark'} mode`);
    themeToggleBtn.innerHTML = isDark
      ? `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>`
      : `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>`;
  }
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
    if (header) header.classList.remove('header-hidden');
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
   3. Smart Sticky Header (Auto-hide on Scroll Down, Reveal on Scroll Up)
   -------------------------------------------------------------------------- */
function initHeaderScroll() {
  const header = document.querySelector('.site-header');
  const mainNav = document.getElementById('mainNav');
  if (!header) return;

  let lastScrollY = Math.max(0, window.scrollY);
  let ticking = false;

  window.addEventListener('scroll', () => {
    if (!ticking) {
      window.requestAnimationFrame(() => {
        const currentScrollY = Math.max(0, window.scrollY);
        const scrollDelta = currentScrollY - lastScrollY;
        const isMenuOpen = (mainNav && mainNav.classList.contains('open')) ||
                           document.body.classList.contains('nav-open');

        // Scrolled styling & shadow toggle
        if (currentScrollY > 20) {
          header.classList.add('scrolled');
        } else {
          header.classList.remove('scrolled');
        }

        // Smart Sticky Header behavior
        if (isMenuOpen) {
          // Keep header always visible when mobile navigation drawer is active
          header.classList.remove('header-hidden');
        } else if (currentScrollY <= 80) {
          // Always visible at or near the top of the page
          header.classList.remove('header-hidden');
        } else if (scrollDelta > 6) {
          // Scrolling down: hide header to save mobile viewport space
          header.classList.add('header-hidden');
        } else if (scrollDelta < -6) {
          // Scrolling up: smoothly reveal header
          header.classList.remove('header-hidden');
        }

        lastScrollY = currentScrollY;
        ticking = false;
      });
      ticking = true;
    }
  }, { passive: true });
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

