/**
 * MLS & Redfin Property Scout - Theme Switcher
 */
import { elements, mapState } from './state.js';
import { updateMapTileLayer } from './map.js';
import { showToast } from './toast.js';


    export function initTheme() {
        const savedTheme = localStorage.getItem('scout_theme') || 'dark';
        setTheme(savedTheme);
    }
    export function setTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('scout_theme', theme);
        if (elements.themeIcon) elements.themeIcon.innerText = theme === 'light' ? '☀️' : '🌙';
        if (elements.themeLabel) elements.themeLabel.innerText = theme === 'light' ? 'Light' : 'Dark';
        if (mapState.leafletMap) updateMapTileLayer();
    }
    export function toggleTheme() {
        const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        setTheme(newTheme);
        showToast(`Switched to ${newTheme === 'light' ? 'Light' : 'Dark'} Theme`, 'info');
    }
