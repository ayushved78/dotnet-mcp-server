'use strict';

// ── State ─────────────────────────────────────────────────────
let allPackages = [];   // full list from API
let filtered    = [];   // after search

// ── DOM refs ──────────────────────────────────────────────────
let dom = {};

document.addEventListener('DOMContentLoaded', () => {
    dom = {
        pkgList:        document.getElementById('pkg-list'),
        nugetTable:     document.getElementById('nuget-table-wrap'),
        emptyState:     document.getElementById('empty-state'),
        pkgCount:       document.getElementById('pkg-count'),
        expiringCount:  document.getElementById('pkg-expiring-count'),
        clearAllBtn:    document.getElementById('clear-all-btn'),
        searchInput:    document.getElementById('pkg-search'),
        searchClear:    document.getElementById('search-clear'),
    };

    dom.clearAllBtn.addEventListener('click', clearAll);
    dom.searchInput.addEventListener('input', onSearch);
    dom.searchClear.addEventListener('click', clearSearch);

    loadPackages();
});

// ── API ───────────────────────────────────────────────────────
async function loadPackages() {
    try {
        const res = await fetch('/api/nuget-cache');
        if (!res.ok) throw new Error('Failed to load cache');
        allPackages = await res.json();
        applyFilter();
    } catch (err) {
        McpUI.showError('Failed to load NuGet cache: ' + err.message);
    }
}

async function deleteEntry(key) {
    try {
        const res = await fetch(`/api/nuget-cache/${encodeURIComponent(key)}`, { method: 'DELETE' });
        if (res.status === 404) { McpUI.showError('Entry not found — already evicted?'); return; }
        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.error || 'Delete failed');
        }
        McpUI.showSuccess('Cache entry removed');
        loadPackages();
    } catch (err) {
        McpUI.showError(err.message);
    }
}

async function clearAll() {
    const ok = await McpUI.confirmAsync(`Clear all ${allPackages.length} cached NuGet package(s)?\nThey will be re-fetched from NuGet.org on next use.`);
    if (!ok) return;
    try {
        const res = await fetch('/api/nuget-cache', { method: 'DELETE' });
        if (!res.ok) throw new Error('Clear all failed');
        const data = await res.json();
        McpUI.showSuccess(`Cleared ${data.cleared} cached package(s)`);
        loadPackages();
    } catch (err) {
        McpUI.showError(err.message);
    }
}

// ── Search / filter ───────────────────────────────────────────
function onSearch() {
    const q = dom.searchInput.value.trim();
    dom.searchClear.classList.toggle('hidden', q.length === 0);
    applyFilter();
}

function clearSearch() {
    dom.searchInput.value = '';
    dom.searchClear.classList.add('hidden');
    applyFilter();
    dom.searchInput.focus();
}

function applyFilter() {
    const q = dom.searchInput.value.toLowerCase().trim();
    filtered = q
        ? allPackages.filter(p =>
            p.packageId.toLowerCase().includes(q) ||
            p.version.toLowerCase().includes(q)   ||
            p.framework.toLowerCase().includes(q))
        : [...allPackages];
    renderPackages();
}

// ── Render ────────────────────────────────────────────────────
function renderPackages() {
    const expiringCount = allPackages.filter(p => {
        if (!p.expiresAt) return false;
        const h = (new Date(p.expiresAt) - Date.now()) / 36e5;
        return h >= 0 && h < 6;
    }).length;

    dom.pkgCount.textContent      = allPackages.length;
    dom.expiringCount.textContent = expiringCount;
    dom.clearAllBtn.classList.toggle('hidden', allPackages.length === 0);

    if (filtered.length === 0) {
        dom.nugetTable.classList.add('hidden');
        dom.emptyState.classList.remove('hidden');
        return;
    }

    dom.nugetTable.classList.remove('hidden');
    dom.emptyState.classList.add('hidden');

    dom.pkgList.innerHTML = filtered.map((p, idx) => `
        <div class="nuget-row" style="animation-delay:${idx * 20}ms">
            <span class="nuget-pkg" title="${McpUI.escapeHtml(p.key)}">${McpUI.escapeHtml(p.packageId)}</span>
            <span class="nuget-badge version-badge">${McpUI.escapeHtml(p.version)}</span>
            <span class="nuget-badge framework-badge">${McpUI.escapeHtml(p.framework)}</span>
            <span class="ttl-badge ${ttlClass(p.expiresAt)}">${formatTtl(p.expiresAt)}</span>
            <button class="btn btn-danger btn-row-delete" onclick="deleteEntry('${McpUI.escapeHtml(p.key)}')" title="Remove from cache">&#10005;</button>
        </div>
    `).join('');
}

// ── TTL helpers ───────────────────────────────────────────────
function ttlClass(expiresAt) {
    if (!expiresAt) return 'ttl-none';
    const hours = (new Date(expiresAt) - Date.now()) / 36e5;
    if (hours < 0)  return 'ttl-red';    // expired
    if (hours < 6)  return 'ttl-red';
    if (hours < 48) return 'ttl-orange';
    return 'ttl-green';
}

function formatTtl(expiresAt) {
    if (!expiresAt) return 'No expiry';
    const ms = new Date(expiresAt) - Date.now();
    if (ms <= 0) return 'Expired';
    const d = Math.floor(ms / 864e5);
    const h = Math.floor((ms % 864e5) / 36e5);
    const m = Math.floor((ms % 36e5) / 6e4);
    if (d > 0) return `${d}d ${h}h`;
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
}
