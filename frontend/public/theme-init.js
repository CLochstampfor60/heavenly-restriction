// Applies the stored theme and accent to the app shell (<html>) before first paint.
// Settings are per device: "hr-theme" (system | dark | light), "hr-accent" (green | plum | blue).
// The Settings screen writes them and calls window.hrApplySettings() again.
(function () {
  function read(key, allowed, fallback) {
    try {
      var value = localStorage.getItem(key);
      return allowed.indexOf(value) === -1 ? fallback : value;
    } catch (e) {
      return fallback;
    }
  }

  window.hrReadSettings = function () {
    return {
      theme: read('hr-theme', ['system', 'dark', 'light'], 'system'),
      accent: read('hr-accent', ['green', 'plum', 'blue'], 'green'),
    };
  };

  // Pass {theme, accent} to apply values directly (still works when storage is blocked).
  window.hrApplySettings = function (s) {
    s = s || window.hrReadSettings();
    var theme = s.theme;
    if (theme === 'system') {
      theme = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    }
    var root = document.documentElement;
    root.setAttribute('data-theme', theme);
    root.setAttribute('data-accent', s.accent);
  };

  window.hrApplySettings();
})();
