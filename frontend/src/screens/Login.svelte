<script>
  // Sign in with a passkey. First run: the setup code from the server console creates the first
  // passkey. New phone: an authenticator or recovery code creates a passkey here. Creating a
  // passkey never signs you in by itself; you then sign in with it.
  import Icon from '../components/Icon.svelte';
  import { auth, createPasskeyWith, enrollToken, explain, signIn } from '../stores/auth.svelte.js';
  import { sync } from '../stores/sync.svelte.js';
  import { supported } from '../webauthn.js';

  let busy = $state(false);
  let error = $state('');
  let note = $state('');
  let setupCode = $state('');
  let recoveryOpen = $state(false);
  let code = $state('');

  async function run(step) {
    busy = true;
    error = '';
    try {
      await step();
    } catch (e) {
      error = explain(e);
    } finally {
      busy = false;
    }
  }

  const done = () => {
    location.hash = '#/';
    location.reload();
  };

  const doSignIn = () => run(async () => {
    await signIn();
    done();
  });

  const doSetup = () => run(async () => {
    await createPasskeyWith({ setup_code: setupCode.trim() });
    auth.setupRequired = false;
    note = 'Passkey saved. Now sign in with it.';
  });

  const doRecover = () => run(async () => {
    const token = await enrollToken(code.trim());
    await createPasskeyWith({ enroll_token: token });
    recoveryOpen = false;
    code = '';
    note = 'Passkey saved on this phone. Now sign in with it.';
  });
</script>

<div class="app__scroll">
  <header class="stack-tight">
    <span class="hr-eyebrow">Heavenly Restriction</span>
    <h1 class="title screen-title">{auth.setupRequired ? 'Set up sign-in' : 'Sign in'}</h1>
  </header>

  {#if !supported()}
    <p class="body">This browser can't use passkeys. Open the app in Brave or Chrome on your phone.</p>
  {:else if auth.setupRequired}
    <section class="stack">
      <p class="body">
        First run. Enter the setup code shown in the server's console window, then create a passkey
        with your fingerprint. This works once, for your first passkey.
      </p>
      <div class="stack-tight">
        <label for="setup-code" class="hr-eyebrow">Setup code</label>
        <input id="setup-code" class="text-field" autocomplete="off" autocapitalize="characters"
          spellcheck="false" placeholder="XXXX-XXXX-XXXX" bind:value={setupCode}>
      </div>
      <button class="hr-btn hr-btn--primary hr-btn--hero" disabled={busy || setupCode.trim().length < 12} onclick={doSetup}>
        Create passkey
      </button>
    </section>
  {:else}
    <section class="stack">
      {#if sync.pending}
        <p class="body">
          {sync.pending === 1 ? '1 change is' : `${sync.pending} changes are`} waiting on this phone.
          {sync.pending === 1 ? 'It sends' : 'They send'} as soon as you sign in.
        </p>
      {/if}
      <button class="hr-btn hr-btn--primary hr-btn--hero" disabled={busy} onclick={doSignIn}>
        <Icon name="check" />Sign in with passkey
      </button>
    </section>

    <section class="stack">
      <button class="gear-head" aria-expanded={recoveryOpen} onclick={() => (recoveryOpen = !recoveryOpen)}>
        <span class="option-text">
          <span class="body-strong">New or replaced phone?</span>
          <span class="meta">Use an authenticator code or a recovery code to add a passkey here.</span>
        </span>
        <span class="meta-strong">{recoveryOpen ? 'Close' : 'Open'}</span>
      </button>
      {#if recoveryOpen}
        <div class="stack-tight">
          <label for="enroll-code" class="hr-eyebrow">Authenticator or recovery code</label>
          <input id="enroll-code" class="text-field" autocomplete="one-time-code" spellcheck="false"
            placeholder="123456 or XXXX-XXXX-XXXX" bind:value={code}>
          <span class="meta">A recovery code works once. This does not sign you in; the new passkey does.</span>
        </div>
        <button class="hr-btn hr-btn--secondary" disabled={busy || code.trim().length < 6} onclick={doRecover}>
          Create a passkey on this phone
        </button>
      {/if}
    </section>
  {/if}

  {#if note}<p class="hr-exrow__note sample-note" role="status">{note}</p>{/if}
  {#if error}<p class="body" role="alert">{error}</p>{/if}
</div>
