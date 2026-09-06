/**
 * MLS & Redfin Property Scout - Theme Switcher
 */
import { elements, mapState } from './state.js';
import { updateMapTileLayer } from './map.js';
import { showToast } from './toast.js';


    export function initTheme() {
        document.documentElement.setAttribute('data-theme', 'dark');
    }
    export function setTheme(theme) {
        document.documentElement.setAttribute('data-theme', 'dark');
    }
    export function toggleTheme() {
        // Theme is locked onto signature Obsidian Luxury theme
    }
