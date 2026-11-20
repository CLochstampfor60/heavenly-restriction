// Load order matters: tokens, then components, then the app's own CSS.
import '@ds/tokens.css';
import '@ds/components/bundle.css';
import './app.css';

import { mount } from 'svelte';
import App from './App.svelte';
import { watchSystemTheme } from './settings.svelte.js';
import { loadToday } from './stores/workout.svelte.js';

watchSystemTheme();

// Load today's program (API, or demo data) and resume the session before the first render.
loadToday().then(() => mount(App, { target: document.getElementById('app') }));
