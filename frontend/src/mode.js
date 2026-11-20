// Demo mode: made-up program and history for screenshots, kept apart from real data.
// Real mode reads the program from the API. Stored per device.
// A build or dev server in `--mode demo` (the only mode allowed on the LAN) is always demo.
export const DEMO_ONLY = import.meta.env.MODE === 'demo';

export function isDemo() {
  if (DEMO_ONLY) return true;
  try {
    return localStorage.getItem('hr-demo') === '1';
  } catch {
    return false;
  }
}

export function setDemo(on) {
  if (DEMO_ONLY) return;
  try {
    if (on) localStorage.setItem('hr-demo', '1');
    else localStorage.removeItem('hr-demo');
  } catch {
    // Storage blocked: the choice cannot stick, so stay as we are.
    return;
  }
  location.hash = '#/';
  location.reload();
}
