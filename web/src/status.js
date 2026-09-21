const statusEl = document.getElementById('status');

// Callers register each in-flight load via expectLoad() before starting it,
// so `pending` always matches the real number of outstanding loads instead
// of a hardcoded count that silently drifts when a loader is added/removed
// (previously a literal `7` here undercounted the real 8 loaders, so the
// indicator could clear before everything had actually finished).
let pending = 0;

export function expectLoad(name) {
  pending++;
}

export function loaded(name) {
  pending--;
  statusEl.textContent = `loaded ${name}`;
  if (pending <= 0) setTimeout(() => statusEl.style.display = 'none', 1500);
}

export function failed(name, err) {
  console.error(`Failed to load ${name}`, err);
  statusEl.textContent = `failed to load ${name} - see console`;
}
