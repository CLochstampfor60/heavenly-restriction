// Logout wipe, for when login lands (phase 4). Nothing calls this yet.
//
// Logging out removes this phone's copy of the data (IndexedDB) so a lost or shared phone
// keeps nothing, but only once the server has everything: it syncs first and refuses to wipe
// while changes are still waiting. `discardUnsynced` is for an explicit "log out anyway and
// lose N changes" confirmation, never a default.
import { db } from '../db.js';
import { canWipe } from '../logic.js';
import { syncNow } from './sync.svelte.js';

export async function wipeOnLogout({ discardUnsynced = false } = {}) {
  const { total, offline } = await syncNow();
  if (!canWipe(total) && !discardUnsynced) return { wiped: false, waiting: total, offline };
  db.close();
  await db.delete();
  // Appearance settings (theme, accent) stay; they are not personal data.
  return { wiped: true, waiting: 0, offline };
}
