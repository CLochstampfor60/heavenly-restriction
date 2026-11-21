// Sign-in state and actions. Real mode only; demo mode never talks to the server.
import { canWipe, deviceName } from '../logic.js';
import { isDemo } from '../mode.js';
import { createPasskey, usePasskey } from '../webauthn.js';
import { wipeLocalData } from './logout.js';
import { api, HttpError, syncNow } from './sync.svelte.js';

export const auth = $state({
  checked: false,
  authenticated: false,
  setupRequired: false,
  offline: false,
  info: null, // passkeys, totp, recovery_codes_left (when signed in)
});

export async function checkAuth() {
  if (isDemo()) {
    Object.assign(auth, { checked: true, authenticated: true });
    return;
  }
  try {
    const s = await api('GET', '/api/auth/status');
    Object.assign(auth, {
      authenticated: s.authenticated,
      setupRequired: s.setup_required,
      offline: false,
      info: s,
    });
  } catch (error) {
    // No connection: open from this phone's copy; changes queue until sign-in.
    auth.offline = !(error instanceof HttpError);
  }
  auth.checked = true;
}

// Sign-in is needed before anything loads (online, and no valid session).
export function needsSignIn() {
  return !isDemo() && auth.checked && !auth.offline && !auth.authenticated;
}

// A message that is safe to show for a failed step.
export function explain(error) {
  if (error instanceof HttpError) return error.detail || `The server said no (${error.status}).`;
  if (error?.name === 'NotAllowedError') return 'The passkey request was cancelled or timed out.';
  if (error?.name === 'InvalidStateError') return 'This phone already has a passkey for this app.';
  if (error instanceof TypeError) return 'Cannot reach the server.';
  return error?.message || 'Something went wrong.';
}

const post = (path, body = {}) => api('POST', path, body);

export async function signIn() {
  const { ceremony, options } = await post('/api/auth/login/options');
  const credential = await usePasskey(options);
  await post('/api/auth/login/verify', { ceremony, credential });
}

// reason: { setup_code } on first run, { enroll_token } from a code, or {} when signed in.
// The name starts as the kind of device (renamable in Settings).
export async function createPasskeyWith(reason, name = deviceName(navigator.userAgent)) {
  const { ceremony, options } = await post('/api/auth/register/options', reason);
  const credential = await createPasskey(options);
  await post('/api/auth/register/verify', { ceremony, credential, name });
}

export async function enrollToken(code) {
  return (await post('/api/auth/enroll/start', { code })).enroll_token;
}

// Sign out: send everything first and refuse while changes are waiting, unless told to discard
// them. Then end the server session, wipe this phone's copy, and start over.
export async function signOut({ discardUnsynced = false } = {}) {
  const left = await syncNow();
  if (!canWipe(left.total) && !discardUnsynced) return { signedOut: false, waiting: left.total };
  try {
    await post('/api/auth/logout');
  } catch (error) {
    if (!discardUnsynced) return { signedOut: false, waiting: left.total, error: explain(error) };
  }
  await wipeLocalData();
  location.hash = '#/';
  location.reload();
  return { signedOut: true, waiting: 0 };
}
