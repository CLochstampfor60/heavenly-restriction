// Per-device appearance settings. public/theme-init.js owns the keys and applies them;
// this module keeps a reactive copy for the Settings screen.
export const settings = $state({ ...window.hrReadSettings(), shown: shownTheme() });

function shownTheme() {
  return document.documentElement.getAttribute('data-theme');
}

function save(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage blocked (private window): the choice lasts until the page closes.
  }
  apply();
}

function apply() {
  window.hrApplySettings({ theme: settings.theme, accent: settings.accent });
  settings.shown = shownTheme();
}

export function setTheme(theme) {
  settings.theme = theme;
  save('hr-theme', theme);
}

export function setAccent(accent) {
  settings.accent = accent;
  save('hr-accent', accent);
}

// "System" follows the phone; re-apply when it switches between light and dark.
export function watchSystemTheme() {
  window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', apply);
}
