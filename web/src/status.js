const statusEl = document.getElementById('status');

// rink + goals + ball + 2x goalie models + grid tiles + tactical zones
let pending = 7;

export function loaded(name) {
  pending--;
  statusEl.textContent = `loaded ${name}`;
  if (pending <= 0) setTimeout(() => statusEl.style.display = 'none', 1500);
}

export function failed(name, err) {
  console.error(`Failed to load ${name}`, err);
  statusEl.textContent = `failed to load ${name} - see console`;
}
