// Load order matters: tokens, then components, then the app's own CSS.
import '@ds/tokens.css';
import '@ds/components/bundle.css';
import './app.css';

import { mount } from 'svelte';
import App from './App.svelte';

// "System" follows the phone; re-apply when it switches between light and dark.
window
  .matchMedia('(prefers-color-scheme: light)')
  .addEventListener('change', () => window.hrApplySettings());

mount(App, { target: document.getElementById('app') });
