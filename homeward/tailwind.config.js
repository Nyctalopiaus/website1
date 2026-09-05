/**
 * Local Tailwind build config for homeward (Phase 6 of the improvement
 * plan — replaces the Play CDN <script> in index.html, which JIT-compiles
 * in the browser on every page load and can't work offline).
 *
 * This mirrors the inline `tailwind.config` object that currently sits in
 * index.html's <head> (darkMode + the brand.* color extension) — if you
 * ever add more theme customization to the CDN config, mirror it here too
 * so the two don't drift while both exist during the transition.
 */
module.exports = {
  darkMode: 'class',
  content: [
    './index.html',
    './js/**/*.js'
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          bg: '#0b0f19',
          card: '#111827',
          border: '#1f2937',
          accent: '#38bdf8'
        }
      }
    }
  },
  plugins: []
};
