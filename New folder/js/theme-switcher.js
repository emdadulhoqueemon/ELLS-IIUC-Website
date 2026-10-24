/**
 * ELLS Website & Admin Console — Theme Switcher
 * Handles aesthetic theme toggling between 'modern-neo-glass' (default) and 'dark-academia'.
 * Persists user preference via localStorage with key 'theme' (and 'ells_theme').
 */
(function() {
  'use strict';

  var STORAGE_KEY = 'theme';
  var LEGACY_KEY = 'ells_theme';
  var DEFAULT_THEME = 'modern-neo-glass';
  var VALID_THEMES = ['modern-neo-glass', 'dark-academia'];

  /** Get current saved theme */
  function getSavedTheme() {
    try {
      var saved = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_KEY);
      if (saved && VALID_THEMES.indexOf(saved) !== -1) {
        return saved;
      }
    } catch (err) {
      /* localStorage might be restricted in some sandboxes */
    }
    return DEFAULT_THEME;
  }

  /** Apply theme to document and persist */
  function applyTheme(theme) {
    if (VALID_THEMES.indexOf(theme) === -1) {
      theme = DEFAULT_THEME;
    }
    document.documentElement.setAttribute('data-theme', theme);
    if (document.body) {
      document.body.setAttribute('data-theme', theme);
    }
    try {
      localStorage.setItem(STORAGE_KEY, theme);
      localStorage.setItem(LEGACY_KEY, theme);
    } catch (err) {
      /* ignore */
    }

    // Update meta theme-color for mobile browser status & navigation bars
    try {
      var metaThemeColor = document.querySelector('meta[name="theme-color"]');
      if (metaThemeColor) {
        metaThemeColor.setAttribute('content', theme === 'dark-academia' ? '#3B3F2F' : '#0A191E');
      }
    } catch (err) {}

    // Update all theme switchers on the page
    updateAllSwitchers(theme);

    // Dispatch event for any other components
    try {
      window.dispatchEvent(new CustomEvent('themechange', { detail: { theme: theme } }));
    } catch (e) {
      // old browser fallback
    }
  }

  /** Update UI state of all switcher elements */
  function updateAllSwitchers(activeTheme) {
    var switchers = document.querySelectorAll('.theme-switcher');
    var isNeoGlass = activeTheme === 'modern-neo-glass';
    var themeLabelText = isNeoGlass ? 'Neo-Glass' : 'Dark Academia';

    switchers.forEach(function(switcher) {
      var label = switcher.querySelector('.theme-switcher-text');
      if (label) {
        label.textContent = themeLabelText;
      }

      var toggle = switcher.querySelector('.theme-switcher-toggle');
      if (toggle) {
        toggle.setAttribute('title', 'Current theme: ' + (isNeoGlass ? 'Modern Neo-Glass' : 'Dark Academia') + ' (Click to change)');
        toggle.setAttribute('aria-label', 'Theme: ' + (isNeoGlass ? 'Modern Neo-Glass' : 'Dark Academia') + '. Click to switch.');
      }

      var options = switcher.querySelectorAll('.theme-option');
      options.forEach(function(opt) {
        var optVal = opt.getAttribute('data-theme-value');
        if (optVal === activeTheme) {
          opt.classList.add('is-active');
          opt.setAttribute('aria-selected', 'true');
        } else {
          opt.classList.remove('is-active');
          opt.setAttribute('aria-selected', 'false');
        }
      });
    });
  }

  /** Close all open theme dropdowns */
  function closeAllDropdowns() {
    var switchers = document.querySelectorAll('.theme-switcher.is-open');
    switchers.forEach(function(s) {
      s.classList.remove('is-open');
      var toggle = s.querySelector('.theme-switcher-toggle');
      if (toggle) toggle.setAttribute('aria-expanded', 'false');
      var dd = s.querySelector('.theme-dropdown');
      if (dd) dd.hidden = true;
    });
  }

  /** Initialize event listeners */
  function initThemeSwitcher() {
    var currentTheme = getSavedTheme();
    applyTheme(currentTheme);

    // Wire click events
    document.addEventListener('click', function(e) {
      var toggle = e.target.closest('.theme-switcher-toggle');
      var option = e.target.closest('.theme-option');

      if (toggle) {
        e.preventDefault();
        e.stopPropagation();
        var parentSwitcher = toggle.closest('.theme-switcher');
        var wasOpen = parentSwitcher.classList.contains('is-open');

        closeAllDropdowns();

        if (!wasOpen) {
          parentSwitcher.classList.add('is-open');
          toggle.setAttribute('aria-expanded', 'true');
          var dropdown = parentSwitcher.querySelector('.theme-dropdown');
          if (dropdown) dropdown.hidden = false;
        }
        return;
      }

      if (option) {
        e.preventDefault();
        e.stopPropagation();
        var selectedTheme = option.getAttribute('data-theme-value');
        if (selectedTheme && VALID_THEMES.indexOf(selectedTheme) !== -1) {
          applyTheme(selectedTheme);
        }
        closeAllDropdowns();
        return;
      }

      // Clicked outside
      closeAllDropdowns();
    });

    // Close on Escape key
    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape' || e.keyCode === 27) {
        closeAllDropdowns();
      }
    });
  }

  // Set theme attribute immediately if script is executed
  try {
    var immediateTheme = getSavedTheme();
    document.documentElement.setAttribute('data-theme', immediateTheme);
    var immMeta = document.querySelector('meta[name="theme-color"]');
    if (immMeta) {
      immMeta.setAttribute('content', immediateTheme === 'dark-academia' ? '#3B3F2F' : '#0A191E');
    }
  } catch (err) {}

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initThemeSwitcher);
  } else {
    initThemeSwitcher();
  }

  // Export helper globally
  window.ELLSTheme = {
    get: getSavedTheme,
    set: applyTheme
  };
})();
