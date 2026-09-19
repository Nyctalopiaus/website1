import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    path.join(__dirname, 'index.html'),
    path.join(__dirname, 'src/**/*.{js,ts,jsx,tsx}')
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        studio: {
          50: '#f6f6f7',
          100: '#e3e3e7',
          200: '#c7c7d0',
          300: '#a1a1b1',
          400: '#797990',
          500: '#5e5e74',
          600: '#48485b',
          700: '#3a3a49',
          800: '#23232c',
          900: '#14141a',
          950: '#0b0b0e',
        }
      }
    }
  },
  plugins: []
};
