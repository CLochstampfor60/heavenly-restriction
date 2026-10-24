// Hash routes: #/ (Today), #/log/<slot>, #/library, #/progress.
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
