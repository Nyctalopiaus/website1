/** ThreatPulse Tailwind build config.
 *
 * This project no longer loads Tailwind from the cdn.tailwindcss.com script (that CDN
 * build ships the full JIT compiler + Play CDN warning banner to every visitor and is a
 * runtime dependency on a third-party host). Instead this config is compiled ahead of
 * time into css/tailwind.generated.css via the Tailwind CLI, and index.html links that
 * generated stylesheet directly.
 *
 * If you add new utility classes to index.html or any js/*.js file, or change this
 * config, rebuild with:
 *
 *   npx tailwindcss -c tailwind.config.js -i input.css -o css/tailwind.generated.css --minify
 *
 * (requires `npm install -D tailwindcss@3` once, since this project has no other
 * npm/build dependency today).
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
          'card-hover': '#1e293b',
          border: '#1f2937',
          subtle: '#374151',
          accent: '#38bdf8',
          critical: '#f43f5e',
          warning: '#fbbf24',
          success: '#34d399'
        }
      },
      fontFamily: {
        // Inter (Google Fonts) removed -- see css/style.css's @font-face comments for why.
        // Native OS UI font stack: San Francisco on macOS/iOS, Segoe UI on Windows,
        // Roboto on Android/Chrome OS, with sensible Linux/fallback entries.
        sans: ['-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'Helvetica Neue', 'Arial', 'sans-serif'],
        // JetBrains Mono is now self-hosted (assets/fonts/) instead of loaded from Google Fonts.
        mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'Consolas', 'monospace']
      }
    }
  },
  plugins: []
}
