/**
 * ui.js — shared UI utilities
 * Toast notifications, escapeHtml, confirm dialogs.
 * Depends on: toast-container injected by layout.js
 */

'use strict';

// ── Toast ─────────────────────────────────────────────────────
const TOAST_DURATION_MS = 4000;

function showToast(message, type = 'info') {
    const icons = { success: '&#10003;', error: '&#10007;', info: '&#9432;' };
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
        <span class="toast-icon">${icons[type] ?? icons.info}</span>
        <span class="toast-msg">${escapeHtml(message)}</span>`;

    container.appendChild(toast);

    const dismiss = () => {
        toast.classList.add('removing');
        toast.addEventListener('animationend', () => toast.remove(), { once: true });
    };

    const timer = setTimeout(dismiss, TOAST_DURATION_MS);
    toast.addEventListener('click', () => { clearTimeout(timer); dismiss(); });
}

function showError(message)   { showToast(message, 'error'); }
function showSuccess(message) { showToast(message, 'success'); }
function showInfo(message)    { showToast(message, 'info'); }

// ── HTML escaping ─────────────────────────────────────────────
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text ?? '';
    return div.innerHTML;
}

// ── Confirm dialog (returns Promise<boolean>) ─────────────────
function confirmAsync(message) {
    return Promise.resolve(window.confirm(message));
}

// ── Loading state helpers ─────────────────────────────────────
function setLoading(btn, loading, originalText) {
    if (!btn) return;
    btn.disabled = loading;
    btn.textContent = loading ? 'Loading...' : originalText;
}

// Expose globally so feature scripts can call without imports
window.McpUI = { showError, showSuccess, showInfo, escapeHtml, confirmAsync, setLoading };
