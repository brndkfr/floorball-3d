// Modal dialogs backed by the native <dialog> element - replacement for
// blocking alert()/confirm()/prompt() calls (S-BACK-006), which read as
// prototype-grade and give the browser's own unstyled chrome instead of
// this app's look. <dialog>.showModal() gives focus trapping and
// Escape-to-cancel for free, addressing part of S-BACK-005 for these
// dialogs specifically (existing dialogs like help/export are untouched).

let styleInjected = false;
function ensureStyle() {
  if (styleInjected) return;
  styleInjected = true;
  const style = document.createElement('style');
  style.textContent = `
    dialog.app-dialog {
      max-width:min(420px, 92vw);
      background:rgba(20,16,10,0.97); color:#f7e6cf;
      border:1px solid rgba(255,179,71,0.5); border-radius:10px;
      padding:18px 20px; font-family:'Consolas','Courier New',monospace;
      line-height:1.5;
    }
    dialog.app-dialog::backdrop { background:rgba(0,0,0,0.55); }
    dialog.app-dialog form { margin:0; }
    dialog.app-dialog .app-dialog-msg { margin:0 0 14px; font-size:13px; }
    dialog.app-dialog .app-dialog-input {
      width:100%; box-sizing:border-box; margin-bottom:14px;
      background:rgba(0,0,0,0.3); color:#f7e6cf;
      border:1px solid rgba(255,179,71,0.35); border-radius:6px;
      padding:6px 8px; font-family:inherit; font-size:13px;
    }
    dialog.app-dialog .app-dialog-actions {
      display:flex; justify-content:flex-end; gap:8px; margin:0; padding:0;
    }
    dialog.app-dialog .app-dialog-actions button {
      background:transparent; color:#f7e6cf;
      border:1px solid rgba(255,179,71,0.35); border-radius:6px;
      padding:5px 14px; font-family:inherit; font-size:12px; cursor:pointer;
    }
    dialog.app-dialog .app-dialog-actions button[value="ok"] {
      border-color:#ffb347; color:#ffb347;
    }
  `;
  document.head.appendChild(style);
}

function buildDialog(message, { input = false, defaultValue = '', okOnly = false } = {}) {
  ensureStyle();
  const dialog = document.createElement('dialog');
  dialog.className = 'app-dialog';
  const cancelBtn = okOnly ? '' : '<button type="submit" value="cancel">Cancel</button>';
  dialog.innerHTML = `
    <form method="dialog">
      <p class="app-dialog-msg"></p>
      ${input ? '<input type="text" class="app-dialog-input">' : ''}
      <menu class="app-dialog-actions">
        ${cancelBtn}
        <button type="submit" value="ok" autofocus>OK</button>
      </menu>
    </form>
  `;
  dialog.querySelector('.app-dialog-msg').textContent = message;
  if (input) dialog.querySelector('.app-dialog-input').value = defaultValue;
  document.body.appendChild(dialog);
  return dialog;
}

export function showAlert(message) {
  return new Promise((resolve) => {
    const dialog = buildDialog(message, { okOnly: true });
    dialog.addEventListener('close', () => { dialog.remove(); resolve(); }, { once: true });
    dialog.showModal();
  });
}

export function showConfirm(message) {
  return new Promise((resolve) => {
    const dialog = buildDialog(message);
    dialog.addEventListener('close', () => {
      const ok = dialog.returnValue === 'ok';
      dialog.remove();
      resolve(ok);
    }, { once: true });
    dialog.showModal();
  });
}

export function showPrompt(message, defaultValue = '') {
  return new Promise((resolve) => {
    const dialog = buildDialog(message, { input: true, defaultValue });
    const input = dialog.querySelector('.app-dialog-input');
    dialog.addEventListener('close', () => {
      const ok = dialog.returnValue === 'ok';
      const value = ok ? input.value : null;
      dialog.remove();
      resolve(value);
    }, { once: true });
    dialog.showModal();
    input.select();
  });
}
