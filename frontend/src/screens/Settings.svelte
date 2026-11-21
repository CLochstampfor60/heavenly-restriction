<script>
  import Icon from '../components/Icon.svelte';
  import Nav from '../components/Nav.svelte';
  import Passkeys from '../components/Passkeys.svelte';
  import { setAccent, setTheme, settings } from '../settings.svelte.js';
  import { DEMO_ONLY, setDemo } from '../mode.js';
  import { source } from '../stores/source.svelte.js';
  import { requestPersistence, storage } from '../stores/storage.svelte.js';
  import { auth, checkAuth, explain, signOut } from '../stores/auth.svelte.js';
  import { api } from '../stores/sync.svelte.js';

  // ---------- Security (real mode) ----------
  let secBusy = $state(false);
  let secError = $state('');
  let totp = $state(null); // { secret, otpauth_uri } while setting up
  let totpCode = $state('');
  let codes = $state(null); // recovery codes, shown once
  let waiting = $state(0); // set when sign-out found unsent changes

  async function secRun(step) {
    secBusy = true;
    secError = '';
    try {
      await step();
    } catch (e) {
      secError = explain(e);
    } finally {
      secBusy = false;
    }
  }

  const startTotp = () => secRun(async () => {
    totp = await api('POST', '/api/auth/totp/setup', {});
  });
  const confirmTotp = () => secRun(async () => {
    codes = (await api('POST', '/api/auth/totp/confirm', { code: totpCode.trim() })).recovery_codes;
    totp = null;
    totpCode = '';
    await checkAuth();
  });
  const newCodes = () => secRun(async () => {
    codes = (await api('POST', '/api/auth/recovery/regenerate', {})).recovery_codes;
    await checkAuth();
  });
  const doSignOut = (discardUnsynced = false) => secRun(async () => {
    const r = await signOut({ discardUnsynced });
    if (!r.signedOut) {
      waiting = r.waiting;
      if (r.error) secError = r.error;
    }
  });
  const grouped = (secret) => secret.match(/.{1,4}/g).join(' ');
  import { resetToday } from '../stores/workout.svelte.js';

  const THEMES = [
    { id: 'system', label: 'System' },
    { id: 'dark', label: 'Dark' },
    { id: 'light', label: 'Light' },
  ];
  const ACCENTS = [
    { id: 'green', label: 'Green', jjk: 'Cursed Energy' },
    { id: 'plum', label: 'Plum', jjk: 'Toji' },
    { id: 'blue', label: 'Blue', jjk: 'Six Eyes' },
  ];

  // Two taps, so a stray touch can't wipe the session.
  let confirmReset = $state(false);
</script>

<div class="app__scroll">
  <header class="exh-row">
    <a href="#/" class="hr-icon-btn" aria-label="Back to today's workout"><Icon name="back" /></a>
    <h1 class="title screen-title">Settings</h1>
  </header>

  <section class="stack" aria-labelledby="theme-label">
    <span id="theme-label" class="hr-eyebrow">Theme</span>
    <div class="hr-seg" role="group" aria-labelledby="theme-label">
      {#each THEMES as t (t.id)}
        <button class="hr-seg__btn" aria-pressed={settings.theme === t.id} onclick={() => setTheme(t.id)}>
          {t.label}
        </button>
      {/each}
    </div>
    <span class="meta">
      {settings.theme === 'system' ? `Follows the phone, now ${settings.shown}.` : 'Saved on this device.'}
    </span>
  </section>

  <section class="stack" aria-labelledby="accent-label">
    <span id="accent-label" class="hr-eyebrow">Accent</span>
    <div class="stack" role="radiogroup" aria-labelledby="accent-label">
      {#each ACCENTS as a (a.id)}
        <button
          class="choice"
          role="radio"
          aria-checked={settings.accent === a.id}
          onclick={() => setAccent(a.id)}
        >
          <!-- Re-declaring data-theme here resets --accent to the token, then data-accent picks the preset. -->
          <span class="swatch" data-theme={settings.shown} data-accent={a.id} aria-hidden="true"></span>
          <span class="option-text">
            <span class="option-name">{a.label}</span>
            <span class="hr-jjk">{a.jjk}</span>
          </span>
          {#if settings.accent === a.id}<span class="choice-check"><Icon name="check" /></span>{/if}
        </button>
      {/each}
    </div>
  </section>

  <section class="stack" aria-labelledby="about-label">
    <span id="about-label" class="hr-eyebrow">About</span>
    <div class="about-card">
      <span class="body-strong">Design and development by Carl Lochstampfor (CLochstampfor60).</span>
      <a class="about-link small" href="https://github.com/CLochstampfor60" target="_blank" rel="noopener noreferrer">
        CLochstampfor60 on GitHub<Icon name="external" />
      </a>
      <span class="small muted">Built with help from Claude by Anthropic.</span>
      <span class="meta">Heavenly Restriction 0.1.0 · MIT License</span>
    </div>
  </section>

  {#if !source.demo && auth.authenticated}
    <section class="stack" aria-labelledby="security-label">
      <span id="security-label" class="hr-eyebrow">Sign-in and security</span>
      <Passkeys />

      {#if codes}
        <div class="hr-note">
          <span class="hr-note__icon"><Icon name="pin" /></span>
          <span>
            <span class="hr-note__kind">Recovery codes: shown only now</span>
            <span class="hr-note__body note-block">
              Save these somewhere safe, off this phone. Each one works once, and only to add a
              passkey on a new phone.
            </span>
            <span class="recovery-codes">
              {#each codes as c (c)}<span class="body hr-num">{c}</span>{/each}
            </span>
          </span>
        </div>
        <button class="hr-btn hr-btn--primary" onclick={() => (codes = null)}>I've saved them</button>
      {:else if totp}
        <span class="body">
          Add this key to your authenticator app (or open the link on this phone), then enter the
          6-digit code it shows.
        </span>
        <span class="body hr-num">{grouped(totp.secret)}</span>
        <a class="meta" href={totp.otpauth_uri}>Open in authenticator app</a>
        <input class="text-field" inputmode="numeric" autocomplete="one-time-code" placeholder="123456" bind:value={totpCode}>
        <button class="hr-btn hr-btn--primary" disabled={secBusy || totpCode.trim().length !== 6} onclick={confirmTotp}>Confirm</button>
      {:else if auth.info?.totp}
        <span class="meta">
          Authenticator app set up · {auth.info.recovery_codes_left} recovery code{auth.info.recovery_codes_left === 1 ? '' : 's'} left.
          These only add a passkey on a new phone; they never sign you in.
        </span>
        <button class="hr-btn hr-btn--secondary" disabled={secBusy} onclick={newCodes}>New recovery codes</button>
      {:else}
        <span class="meta">
          Set up an authenticator app and recovery codes, so a new or replaced phone can get a passkey.
        </span>
        <button class="hr-btn hr-btn--secondary" disabled={secBusy} onclick={startTotp}>Set up authenticator app</button>
      {/if}

      {#if waiting}
        <span class="body" role="alert">
          {waiting} change{waiting === 1 ? ' has' : 's have'} not reached the server, so this phone was not wiped.
          Connect and try again, or sign out anyway and lose {waiting === 1 ? 'it' : 'them'}.
        </span>
        <button class="hr-btn hr-btn--secondary" disabled={secBusy} onclick={() => doSignOut(true)}>
          Sign out anyway
        </button>
      {:else}
        <button class="hr-btn hr-btn--secondary" disabled={secBusy} onclick={() => doSignOut(false)}>
          Sign out and clear this phone
        </button>
      {/if}
      {#if secError}<span class="body" role="alert">{secError}</span>{/if}
    </section>
  {/if}

  <section class="stack" aria-labelledby="storage-label">
    <span id="storage-label" class="hr-eyebrow">Storage on this phone</span>
    {#if !storage.supported}
      <span class="body">This browser can't keep storage persistent.</span>
      <span class="meta">Sets not yet sent to the server could be cleared if the phone runs low on space.</span>
    {:else if storage.persisted}
      <span class="body"><Icon name="check" /> Persistent storage granted</span>
      <span class="meta">The browser won't clear this app's data to free up space.</span>
    {:else}
      <span class="body">Persistent storage not granted</span>
      <span class="meta">The browser may clear unsynced sets if space runs low. Installing the app usually lets it grant this.</span>
      <button class="hr-btn hr-btn--secondary" onclick={requestPersistence}>Ask again</button>
    {/if}
  </section>

  <section class="stack" aria-labelledby="demo-label">
    <span id="demo-label" class="hr-eyebrow">Demo data</span>
    {#if DEMO_ONLY}<span class="meta">This copy runs in demo-only mode (shared on the network), so real data is off.</span>{/if}
    <button class="hr-toggle" role="switch" aria-checked={source.demo} disabled={DEMO_ONLY} onclick={() => setDemo(!source.demo)}>
      <span class="option-text">
        <span>Use demo data</span>
        <span class="meta">Made-up program and history, for screenshots. Kept apart from your real sessions.</span>
      </span>
      <span class="hr-toggle__switch"></span>
    </button>
    <span class="meta">Reset clears today's session from this device{source.demo ? ' and starts the demo again' : ''}.{source.demo ? '' : ' Anything already sent to the server stays there.'}</span>
    {#if confirmReset}
      <div class="sheet-actions">
        <button class="hr-btn hr-btn--secondary" onclick={() => (confirmReset = false)}>Cancel</button>
        <button class="hr-btn hr-btn--primary" onclick={resetToday}>Clear today's session</button>
      </div>
    {:else}
      <button class="hr-btn hr-btn--secondary" onclick={() => (confirmReset = true)}>Reset today's session</button>
    {/if}
  </section>
</div>
<Nav current={null} />
