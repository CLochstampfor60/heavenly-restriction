// Hash routes: #/ (Today), #/log/<slot>, #/exercise/<id>, #/library, #/progress, #/settings.
export const route = $state({ path: current() });

function current() {
  return location.hash.slice(1) || '/';
}

window.addEventListener('hashchange', () => {
  route.path = current();
});

export function go(path) {
  location.hash = path;
}

// Changes the route without a new history entry: moving between pager pages, so the back
// gesture still returns to Today in one step.
export function replace(path) {
  history.replaceState(history.state, '', `#${path}`);
  route.path = path;
}
