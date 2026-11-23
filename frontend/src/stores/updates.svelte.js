// Registers the service worker (production builds in a secure context only: the installed app
// over HTTPS, or http://localhost) and reports when a new version is waiting. While the app is
// open, the page shows "Update available · Reload" and never switches on its own (that could
// interrupt a set). At launch, before anything is on screen to interrupt, a version that is
// already waiting (found on an earlier run, never applied) takes over at once.
export const updates = $state({ available: false });

let registration = null;
let reloading = false;

function watch(worker) {
  worker.addEventListener('statechange', () => {
    // "installed" with a controller present = an update waiting (not the very first install).
    if (worker.state === 'installed' && navigator.serviceWorker.controller) updates.available = true;
  });
}

export async function registerServiceWorker() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator) || !window.isSecureContext) return;
  try {
    registration = await navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' });
  } catch (error) {
    console.warn('Service worker not registered; the app needs a connection to open.', error);
    return;
  }
  if (registration.waiting && navigator.serviceWorker.controller) {
    applyUpdate(); // next launch: switch now, nothing logged is lost (it is all in IndexedDB)
    return;
  }
  if (registration.installing) watch(registration.installing); // an update already on its way
  registration.addEventListener('updatefound', () => {
    if (registration.installing) watch(registration.installing);
  });
  // Look for a new version when the app comes back to the foreground, and every 30 minutes.
  const check = () => registration.update().catch(() => {});
  check(); // also at launch, so a deploy is noticed without waiting for the next foreground
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && check());
  setInterval(check, 30 * 60 * 1000);
}

// "Reload": let the waiting version take over, then reload once it controls the page.
export function applyUpdate() {
  const waiting = registration?.waiting;
  if (!waiting) {
    location.reload();
    return;
  }
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading) return;
    reloading = true;
    location.reload();
  });
  waiting.postMessage('skip-waiting');
}

// Sign-out: drop every cached copy of the app and the worker itself. The next online load
// registers it again and caches the current version.
export async function clearServiceWorker() {
  if ('caches' in window) {
    for (const key of await caches.keys()) await caches.delete(key);
  }
  if ('serviceWorker' in navigator) {
    for (const reg of await navigator.serviceWorker.getRegistrations()) await reg.unregister();
  }
}
