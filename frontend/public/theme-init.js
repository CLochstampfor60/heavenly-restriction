// Applies the stored theme and accent to the app shell (<html>) before first paint.
// Settings store "hr-theme" (system | dark | light) and "hr-accent" (green | plum | blue)
// per device, then call window.hrApplySettings() again.
(function () {
  function read(key, allowed, fallback) {
    try {
      var value = localStorage.getItem(key);
      return allowed.indexOf(value) === -1 ? fallback : value;
    } catch (e) {
      return fallback;
    }
  }

  window.hrApplySettings = function () {
    var theme = read('hr-theme', ['system', 'dark', 'light'], 'system');
    if (theme === 'system') {
      theme = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    }
    var root = document.documentElement;
    root.setAttribute('data-theme', theme);
    root.setAttribute('data-accent', read('hr-accent', ['green', 'plum', 'blue'], 'green'));
  };

  window.hrApplySettings();
})();
