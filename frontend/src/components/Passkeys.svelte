<script>
  // Settings > Sign-in and security: the passkeys list (rename, remove), adding one on this
  // device, and a one-time device code for adding one on another device (the workstation).
  // The last passkey can only be removed with a recovery code; the server enforces it too.
  import { onMount } from 'svelte';
  import Icon from './Icon.svelte';
  import Sheet from './Sheet.svelte';
  import { lastUsedText } from '../logic.js';
  import { checkAuth, createPasskeyWith, explain } from '../stores/auth.svelte.js';
  import { api } from '../stores/sync.svelte.js';

  let list = $state([]);
  let busy = $state(false);
  let error = $state('');
  let note = $state('');
  let renaming = $state(null); // { id, name } while the rename field is open
  let removing = $state(null); // the passkey row in the remove sheet
  let recovery = $state('');
  let device = $state(null); // { code, until } while a device code is showing
  let clock = $state(Date.now());

  const isLast = $derived(list.length === 1);
  const secondsLeft = $derived(device ? Math.max(0, Math.ceil((device.until - clock) / 1000)) : 0);

  async function run(step) {
    busy = true;
    error = '';
    note = '';
    try {
      await step();
    } catch (e) {
      error = explain(e);
    } finally {
      busy = false;
    }
  }

  async function load() {
    list = await api('GET', '/api/auth/passkeys');
  }

  onMount(() => {
    run(load);
    const timer = setInterval(() => {
      clock = Date.now();
      if (device && clock >= device.until) device = null;
    }, 1000);
    return () => clearInterval(timer);
  });

  const addHere = () => run(async () => {
    await createPasskeyWith({});
    await Promise.all([load(), checkAuth()]);
    note = 'Passkey added on this device.';
  });

  const saveName = () => run(async () => {
    await api('PATCH', `/api/auth/passkeys/${renaming.id}`, { name: renaming.name.trim() });
    renaming = null;
    await load();
  });

  function openRemove(p) {
    removing = p;
    recovery = '';
    error = '';
  }

  const confirmRemove = () => run(async () => {
    const body = isLast ? { recovery_code: recovery.trim() } : {};
    const r = await api('POST', `/api/auth/passkeys/${removing.id}/remove`, body);
    removing = null;
    if (r.signed_out) {
      // This device's session ended with the passkey: back to the sign-in screen. Changes not
      // yet sent stay queued on this device until the next sign-in.
      location.hash = '#/';
      location.reload();
      return;
    }
    await Promise.all([load(), checkAuth()]);
    note = 'Passkey removed.';
  });

  const newDeviceCode = () => run(async () => {
    const r = await api('POST', '/api/auth/device-code', {});
    clock = Date.now();
    device = { code: r.code, until: clock + r.expires_in * 1000 };
  });

  const mmss = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
</script>

<div class="stack" role="list" aria-label="Passkeys">
  {#each list as p (p.id)}
    <div class="passkey-row" role="listitem">
      {#if renaming?.id === p.id}
        <label for="passkey-name" class="hr-eyebrow">Name</label>
        <input id="passkey-name" class="text-field" maxlength="80" bind:value={renaming.name}>
        <div class="sheet-actions">
          <button class="hr-btn hr-btn--secondary hr-btn--compact" onclick={() => (renaming = null)}>Cancel</button>
          <button class="hr-btn hr-btn--primary hr-btn--compact" disabled={busy || !renaming.name.trim()} onclick={saveName}>Save</button>
        </div>
      {:else}
        <span class="passkey-row__name">
          <span class="body-strong">{p.name}</span>
          {#if p.current}<span class="hr-tag">This device</span>{/if}
        </span>
        <span class="meta">{lastUsedText(p.last_used_at)}</span>
        <span class="passkey-row__actions">
          <button class="hr-btn hr-btn--ghost hr-btn--compact" disabled={busy} onclick={() => (renaming = { id: p.id, name: p.name })}>Rename</button>
          <button class="hr-btn hr-btn--ghost hr-btn--compact" disabled={busy} onclick={() => openRemove(p)}>Remove</button>
        </span>
      {/if}
    </div>
  {/each}
</div>

<button class="hr-btn hr-btn--secondary" disabled={busy} onclick={addHere}>Add a passkey on this device</button>

{#if device}
  <div class="hr-note" role="status">
    <span class="hr-note__icon"><Icon name="pin" /></span>
    <span>
      <span class="hr-note__kind">Device code · expires in {mmss(secondsLeft)}</span>
      <span class="body hr-num note-block">{device.code}</span>
      <span class="hr-note__body note-block">
        On the other device, open this app, choose "New device or replaced phone?", enter the
        code, then create the passkey (Windows Hello on a PC). Works once.
      </span>
    </span>
  </div>
{:else}
  <button class="hr-btn hr-btn--secondary" disabled={busy} onclick={newDeviceCode}>Add a passkey on another device</button>
{/if}

{#if note}<span class="meta" role="status">{note}</span>{/if}
{#if error && !removing}<span class="body" role="alert">{error}</span>{/if}

{#if removing}
  <Sheet label="Remove passkey" onclose={() => (removing = null)}>
    <div class="stack-tight">
      <span class="hr-eyebrow">Remove passkey</span>
      <h2 class="hr-sheet__title">{removing.name}</h2>
    </div>
    {#if isLast}
      <p class="body hint">
        This is your only passkey. Removing it signs you out everywhere, and a new one can then be
        made only with the setup code from the server console. Enter a recovery code to confirm.
      </p>
      <input class="text-field" autocomplete="off" autocapitalize="characters" spellcheck="false"
        aria-label="Recovery code" placeholder="XXXX-XXXX-XXXX" bind:value={recovery}>
    {:else if removing.current}
      <p class="body hint">This device signed in with it, so you'll be signed out here. Other devices stay signed in.</p>
    {:else}
      <p class="body hint">It can't sign in any more, and the device it's on is signed out.</p>
    {/if}
    {#if error}<p class="body hint" role="alert">{error}</p>{/if}
    <div class="sheet-actions">
      <button class="hr-btn hr-btn--secondary" onclick={() => (removing = null)}>Cancel</button>
      <button class="hr-btn hr-btn--primary" disabled={busy || (isLast && recovery.trim().length < 12)} onclick={confirmRemove}>
        Remove
      </button>
    </div>
  </Sheet>
{/if}
