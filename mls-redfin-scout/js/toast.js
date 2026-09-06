/**
 * MLS & Redfin Property Scout - Toast Notifications
 */
import { elements } from './state.js';
import { escapeHtml } from './properties.js';


    export function showToast(message, type = 'info') {
        if (!elements.toastContainer) return;
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        
        let icon = 'info';
        if (type === 'success') icon = 'circle-check';
        if (type === 'warning') icon = 'triangle-alert';
        if (type === 'error') icon = 'circle-x';

        toast.innerHTML = `<span><i data-lucide="${icon}"></i></span> <span>${escapeHtml(message)}</span>`;
        elements.toastContainer.appendChild(toast);
        if (window.lucide) window.lucide.createIcons();

        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(10px)';
            toast.style.transition = 'all 0.3s ease';
            setTimeout(() => toast.remove(), 300);
        }, 3500);
    }
