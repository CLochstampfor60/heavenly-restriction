// Demo mode: made-up program and history for screenshots, kept apart from real data.
// Real mode reads the program from the API. Stored per device.
export function isDemo() {
  try {
    return localStorage.getItem('hr-demo') === '1';
  } catch {
    return false;
  }
}

export function setDemo(on) {
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
