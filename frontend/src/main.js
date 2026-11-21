// Load order matters: tokens, then components, then the app's own CSS.
import '@ds/tokens.css';
import '@ds/components/bundle.css';
import './app.css';

import { mount } from 'svelte';
import App from './App.svelte';
import { checkAuth, needsSignIn } from './stores/auth.svelte.js';
import { watchSystemTheme } from './settings.svelte.js';
import { checkPersistence } from './stores/storage.svelte.js';
import { registerServiceWorker } from './stores/updates.svelte.js';
import { loadToday } from './stores/workout.svelte.js';

watchSystemTheme();
checkPersistence();
registerServiceWorker();

// Sign in first when online without a session (nothing loads before that). Offline, the app
// opens from this phone's copy and changes queue until sign-in. Then load today's program (API,
// or demo data) and resume the session before the first render.
const target = document.getElementById('app');
checkAuth().then(async () => {
  if (needsSignIn()) {
    location.hash = '#/login';
    mount(App, { target });
    return;
  }
  await loadToday();
  mount(App, { target });
});
