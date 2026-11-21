// Wipes this phone's copy of the data (IndexedDB) and the service worker's cached app files at
// sign-out, so a lost or shared phone keeps nothing. Only called by signOut() in auth.svelte.js, after it has confirmed nothing is
// waiting for the server (or you chose to discard it). Theme and accent settings stay.
import { db } from '../db.js';
import { clearServiceWorker } from './updates.svelte.js';

export async function wipeLocalData() {
  db.close();
  await db.delete();
  await clearServiceWorker().catch(() => {});
}
