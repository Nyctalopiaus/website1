// Registers the Housenomics service worker (sw.js). Kept as its own file,
// not an inline <script>, because this site's CSP is script-src 'self'
// with no 'unsafe-inline' — an inline registration script is silently
// blocked by the browser and the service worker never installs.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js', { scope: './' }).catch((err) => {
      console.error('Service worker registration failed:', err);
    });
  });
}
