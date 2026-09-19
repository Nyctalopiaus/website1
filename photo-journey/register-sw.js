// Kept as its own same-origin file (not an inline <script>) so it isn't
// blocked by the shared vm_code .htaccess CSP's script-src policy.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}
