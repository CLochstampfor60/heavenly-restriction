// Browser side of WebAuthn: turns the server's JSON options into what navigator.credentials
// expects, and the resulting credential back into JSON (base64url fields).

function fromB64url(value) {
  const b64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0)).buffer;
}

function toB64url(buffer) {
  let bin = '';
  for (const byte of new Uint8Array(buffer)) bin += String.fromCharCode(byte);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

const descriptors = (list) => (list ?? []).map((c) => ({ ...c, id: fromB64url(c.id) }));

export function supported() {
  return typeof window.PublicKeyCredential === 'function' && !!navigator.credentials;
}

export async function createPasskey(options) {
  const publicKey = {
    ...options,
    challenge: fromB64url(options.challenge),
    user: { ...options.user, id: fromB64url(options.user.id) },
    excludeCredentials: descriptors(options.excludeCredentials),
  };
  const cred = await navigator.credentials.create({ publicKey });
  return {
    id: cred.id,
    rawId: toB64url(cred.rawId),
    type: cred.type,
    response: {
      clientDataJSON: toB64url(cred.response.clientDataJSON),
      attestationObject: toB64url(cred.response.attestationObject),
      transports: cred.response.getTransports?.() ?? [],
    },
    clientExtensionResults: cred.getClientExtensionResults?.() ?? {},
  };
}

export async function usePasskey(options) {
  const publicKey = {
    ...options,
    challenge: fromB64url(options.challenge),
    allowCredentials: descriptors(options.allowCredentials),
  };
  const cred = await navigator.credentials.get({ publicKey });
  const r = cred.response;
  return {
    id: cred.id,
    rawId: toB64url(cred.rawId),
    type: cred.type,
    response: {
      clientDataJSON: toB64url(r.clientDataJSON),
      authenticatorData: toB64url(r.authenticatorData),
      signature: toB64url(r.signature),
      userHandle: r.userHandle ? toB64url(r.userHandle) : null,
    },
    clientExtensionResults: cred.getClientExtensionResults?.() ?? {},
  };
}
