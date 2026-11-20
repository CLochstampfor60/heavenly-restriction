// Persistent storage: asks the browser once, on first run, not to clear IndexedDB under storage
// pressure (unsynced sets live there). Settings shows whether it was granted.
export const storage = $state({ supported: false, persisted: null });

export async function checkPersistence() {
  const api = navigator.storage;
  if (!api?.persist || !api?.persisted) return;
  storage.supported = true;
  try {
    storage.persisted = await api.persisted();
    let asked = false;
    try {
      asked = localStorage.getItem('hr-persist-asked') === '1';
      localStorage.setItem('hr-persist-asked', '1');
    } catch {
      // storage blocked: ask every run instead
    }
    if (!storage.persisted && !asked) storage.persisted = await api.persist();
  } catch {
    storage.persisted = false;
  }
}

export async function requestPersistence() {
  try {
    storage.persisted = await navigator.storage.persist();
  } catch {
    storage.persisted = false;
  }
}
