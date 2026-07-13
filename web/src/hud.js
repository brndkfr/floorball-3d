// HUD panels collapse to just their header via the icon button in the corner
export function initHud() {
  document.querySelectorAll('.hud-toggle').forEach((btn) => {
    btn.addEventListener('click', () => {
      const panel = document.getElementById(btn.dataset.panel);
      const collapsed = panel.classList.toggle('collapsed');
      btn.textContent = collapsed ? '+' : '−';
    });
  });
}
