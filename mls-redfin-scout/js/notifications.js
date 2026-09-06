/**
 * MLS & Redfin Property Scout - Notifications Module
 * Handles fetching, rendering, unread count badge updates, and mark-as-read for notifications.
 */
import { apiFetch } from './api.js';
import { CONFIG, state } from './state.js';
import { escapeHtml } from './properties.js';

let notificationsList = [];
let unreadCount = 0;

export async function fetchNotifications() {
    if (!state.authenticated) return;
    try {
        const res = await apiFetch(CONFIG.API_URL + '?action=get_notifications');
        if (res && res.success && Array.isArray(res.notifications)) {
            notificationsList = res.notifications;
            unreadCount = res.unread_count || 0;
            updateNotificationBadge(unreadCount);
            renderNotificationDropdown();
        }
    } catch (e) {
        console.warn('Error fetching notifications:', e);
    }
}

export function updateNotificationBadge(count) {
    const badge = document.getElementById('notification-badge');
    if (!badge) return;
    if (count > 0) {
        badge.innerText = count > 99 ? '99+' : count;
        badge.style.display = 'inline-flex';
    } else {
        badge.style.display = 'none';
    }
}

export function toggleNotificationDropdown() {
    const dropdown = document.getElementById('notification-dropdown');
    if (!dropdown) return;
    const isActive = dropdown.classList.contains('active');
    if (isActive) {
        closeNotificationDropdown();
    } else {
        dropdown.classList.add('active');
        fetchNotifications();
    }
}

export function closeNotificationDropdown() {
    const dropdown = document.getElementById('notification-dropdown');
    if (dropdown) dropdown.classList.remove('active');
}

export function renderNotificationDropdown() {
    const container = document.getElementById('notification-list-container');
    if (!container) return;

    if (!notificationsList.length) {
        container.innerHTML = `
            <div style="padding:1.5rem; text-align:center; color:var(--text-muted); font-size:0.85rem;">
                <i data-lucide="bell-off" style="width:24px; height:24px; opacity:0.6; margin-bottom:0.4rem;"></i>
                <p>No notifications yet</p>
            </div>
        `;
        if (window.lucide) window.lucide.createIcons();
        return;
    }

    container.innerHTML = notificationsList.map(n => {
        const isUnread = !n.is_read;
        const timeAgo = formatTimeAgo(n.created_at);
        let iconName = 'bell';
        if (n.type === 'playlist') iconName = 'bookmark';
        else if (n.type === 'realtor_note') iconName = 'message-square';
        else if (n.type === 'favorite') iconName = 'star';

        return `
            <div class="notification-item ${isUnread ? 'unread' : ''}" data-id="${n.id}" style="padding:0.75rem 1rem; border-bottom:1px solid var(--border-color); display:flex; gap:0.75rem; align-items:flex-start; cursor:pointer; background:${isUnread ? 'var(--bg-input)' : 'transparent'};">
                <div style="background:var(--bg-card); padding:0.4rem; border-radius:50%; display:flex; align-items:center; justify-content:center; color:var(--accent-gold); border:1px solid var(--border-color);">
                    <i data-lucide="${iconName}" style="width:16px; height:16px;"></i>
                </div>
                <div style="flex:1;">
                    <div style="display:flex; justify-content:space-between; align-items:baseline;">
                        <strong style="font-size:0.85rem; color:var(--text-main);">${escapeHtml(n.title)}</strong>
                        <span style="font-size:0.72rem; color:var(--text-muted);">${timeAgo}</span>
                    </div>
                    <p style="font-size:0.8rem; color:var(--text-muted); margin-top:2px; line-height:1.3;">${escapeHtml(n.message)}</p>
                </div>
            </div>
        `;
    }).join('');

    if (window.lucide) window.lucide.createIcons();

    // Attach click listeners to notification items
    container.querySelectorAll('.notification-item').forEach(el => {
        el.addEventListener('click', async () => {
            const id = parseInt(el.dataset.id, 10);
            await markNotificationAsRead(id);
            closeNotificationDropdown();
        });
    });
}

export async function markNotificationAsRead(id) {
    try {
        await apiFetch(CONFIG.API_URL + '?action=mark_notification_read', {
            method: 'POST',
            body: JSON.stringify({ notification_id: id })
        });
        fetchNotifications();
    } catch (e) {
        console.warn('Error marking notification read:', e);
    }
}

export async function markAllNotificationsAsRead() {
    try {
        await apiFetch(CONFIG.API_URL + '?action=mark_notification_read', {
            method: 'POST',
            body: JSON.stringify({ mark_all: true })
        });
        fetchNotifications();
    } catch (e) {
        console.warn('Error marking all notifications read:', e);
    }
}

function formatTimeAgo(dateStr) {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const now = new Date();
    const diffSec = Math.floor((now - date) / 1000);
    if (diffSec < 60) return 'Just now';
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
    if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
    return `${Math.floor(diffSec / 86400)}d ago`;
}
