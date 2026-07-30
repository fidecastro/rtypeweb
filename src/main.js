/**
 * App shell entry — game code lands under src/ in later work.
 * Proves the static ES-module deploy path loads without errors.
 */
const statusEl = document.getElementById('status');

if (statusEl) {
  statusEl.textContent = 'Shell ready.';
}

console.log('[rtypeweb] shell booted');
