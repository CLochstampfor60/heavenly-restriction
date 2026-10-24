<script>
  import Icon from '../components/Icon.svelte';
  import Nav from '../components/Nav.svelte';
  import { setAccent, setTheme, settings } from '../settings.svelte.js';
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
      <span class="body-strong">Made by Carl Lochstampfor</span>
      <a class="about-link small" href="https://github.com/CLochstampfor60" target="_blank" rel="noopener noreferrer">
        CLochstampfor60 on GitHub<Icon name="external" />
      </a>
      <span class="meta">Heavenly Restriction 0.1.0 · MIT License</span>
    </div>
  </section>

  <section class="stack" aria-labelledby="demo-label">
    <span id="demo-label" class="hr-eyebrow">Demo data</span>
    <span class="meta">Clears today's session from this device and starts the demo again.</span>
    {#if confirmReset}
      <div class="stop-actions">
        <button class="hr-btn hr-btn--secondary" onclick={() => (confirmReset = false)}>Cancel</button>
        <button class="hr-btn hr-btn--primary" onclick={resetToday}>Clear today's session</button>
      </div>
    {:else}
      <button class="hr-btn hr-btn--secondary" onclick={() => (confirmReset = true)}>Reset today's session</button>
    {/if}
  </section>
</div>
<Nav current={null} />
