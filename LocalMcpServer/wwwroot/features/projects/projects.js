'use strict';

// ── State ─────────────────────────────────────────────────────
let projects = [];
let editingProjectId = null;

// ── DOM refs (resolved after DOMContentLoaded) ────────────────
let dom = {};

document.addEventListener('DOMContentLoaded', () => {
    dom = {
        projectsList:      document.getElementById('projects-list'),
        emptyState:        document.getElementById('empty-state'),
        projectCount:      document.getElementById('project-count'),
        projectEnabledCount: document.getElementById('project-enabled-count'),
        addProjectBtn:     document.getElementById('add-project-btn'),
        modal:             document.getElementById('project-modal'),
        modalTitle:        document.getElementById('modal-title'),
        modalClose:        document.getElementById('modal-close'),
        modalCancel:       document.getElementById('modal-cancel'),
        modalSave:         document.getElementById('modal-save'),
        projectName:       document.getElementById('project-name'),
        projectPath:       document.getElementById('project-path'),
        projectDescription:document.getElementById('project-description'),
        projectEnabled:    document.getElementById('project-enabled'),
        validatePathBtn:   document.getElementById('validate-path-btn'),
        validationResult:  document.getElementById('validation-result'),
    };

    attachEventListeners();
    loadProjects();
});

// ── Event wiring ──────────────────────────────────────────────
function attachEventListeners() {
    dom.addProjectBtn.addEventListener('click', openAddModal);
    dom.modalClose.addEventListener('click', closeModal);
    dom.modalCancel.addEventListener('click', closeModal);
    dom.modalSave.addEventListener('click', saveProject);
    dom.validatePathBtn.addEventListener('click', validatePath);

    // Close modal on backdrop click
    dom.modal.querySelector('.modal-backdrop').addEventListener('click', closeModal);

    // Keyboard: Escape to close, Enter to save
    document.addEventListener('keydown', e => {
        if (dom.modal.classList.contains('hidden')) return;
        if (e.key === 'Escape') closeModal();
        if (e.key === 'Enter' && e.target.tagName === 'INPUT') saveProject();
    });
}

// ── API ───────────────────────────────────────────────────────
async function loadProjects() {
    try {
        const res = await fetch('/api/projects');
        if (!res.ok) throw new Error('Failed to load projects');
        const config = await res.json();
        projects = config.projects || [];
        renderProjects();
    } catch (err) {
        McpUI.showError('Failed to load projects: ' + err.message);
    }
}

async function saveProject() {
    const name        = dom.projectName.value.trim();
    const path        = dom.projectPath.value.trim();
    const description = dom.projectDescription.value.trim();
    const enabled     = dom.projectEnabled.checked;

    if (!name || !path) {
        McpUI.showError('Project name and path are required');
        return;
    }

    const project = { id: editingProjectId || '', name, path, description, enabled };
    const url     = editingProjectId ? `/api/projects/${editingProjectId}` : '/api/projects';
    const method  = editingProjectId ? 'PUT' : 'POST';

    McpUI.setLoading(dom.modalSave, true, 'Save Project');

    try {
        const res = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(project),
        });

        if (!res.ok) {
            const error = await res.json();
            throw new Error(error.error || 'Failed to save project');
        }

        McpUI.showSuccess(editingProjectId ? 'Project updated' : 'Project added');
        closeModal();
        loadProjects();
    } catch (err) {
        McpUI.showError(err.message);
    } finally {
        McpUI.setLoading(dom.modalSave, false, 'Save Project');
    }
}

async function deleteProject(id) {
    const ok = await McpUI.confirmAsync('Delete this project? This cannot be undone.');
    if (!ok) return;

    try {
        const res = await fetch(`/api/projects/${id}`, { method: 'DELETE' });
        if (!res.ok) {
            const error = await res.json();
            throw new Error(error.error || 'Failed to delete project');
        }
        McpUI.showSuccess('Project deleted');
        loadProjects();
    } catch (err) {
        McpUI.showError(err.message);
    }
}

async function reindexProject(id) {
    const project = projects.find(p => p.id === id);
    const name    = project ? project.name : id;
    const ok      = await McpUI.confirmAsync(`Re-index '${name}'?\nThis will purge the cache and re-analyse all C# files.`);
    if (!ok) return;

    try {
        const res = await fetch(`/api/projects/${id}/reindex`, { method: 'POST' });
        if (!res.ok) {
            const error = await res.json();
            throw new Error(error.error || 'Re-index request failed');
        }
        const data = await res.json();
        McpUI.showSuccess(data.message || `Re-indexing started for '${name}'`);
    } catch (err) {
        McpUI.showError('Re-index failed: ' + err.message);
    }
}

async function validatePath() {
    const path = dom.projectPath.value.trim();
    if (!path) { McpUI.showError('Please enter a path first'); return; }

    const vr = dom.validationResult;
    vr.classList.remove('success', 'error', 'hidden');
    vr.innerHTML = '<p>&#9203; Validating...</p>';

    try {
        const res    = await fetch('/api/projects/validate', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ path }),
        });
        const result = await res.json();

        if (result.isValid) {
            const meta = result.metadata;
            vr.classList.add('success');
            vr.innerHTML = `
                <h4>&#9989; Valid Project Path</h4>
                <ul>
                    <li>Solution files: ${meta.hasSolutionFile ? McpUI.escapeHtml(meta.solutionFiles.join(', ')) : 'None'}</li>
                    <li>Project files: ${meta.csprojCount} .csproj file(s)</li>
                    ${meta.detectedFramework ? `<li>Framework: ${McpUI.escapeHtml(meta.detectedFramework)}</li>` : ''}
                </ul>`;
        } else {
            vr.classList.add('error');
            vr.innerHTML = `<h4>&#10060; Invalid Path</h4><p>${McpUI.escapeHtml(result.error)}</p>`;
        }
    } catch (err) {
        vr.classList.add('error');
        vr.innerHTML = `<h4>&#10060; Validation Failed</h4><p>${McpUI.escapeHtml(err.message)}</p>`;
    }
}

// ── Render ────────────────────────────────────────────────────
function renderProjects() {
    const enabledCount = projects.filter(p => p.enabled).length;
    dom.projectCount.textContent        = projects.length;
    dom.projectEnabledCount.textContent = enabledCount;

    if (projects.length === 0) {
        dom.projectsList.classList.add('hidden');
        dom.emptyState.classList.remove('hidden');
        return;
    }

    dom.projectsList.classList.remove('hidden');
    dom.emptyState.classList.add('hidden');

    dom.projectsList.innerHTML = projects.map((p, idx) => `
        <div class="project-card" id="card-${McpUI.escapeHtml(p.id)}" style="animation-delay:${idx * 40}ms">
            <div class="project-card-header" onclick="toggleCard('${McpUI.escapeHtml(p.id)}')">
                <div class="project-card-left">
                    <span class="project-card-title">${McpUI.escapeHtml(p.name)}</span>
                    <span class="status-badge ${p.enabled ? 'enabled' : 'disabled'}">
                        ${p.enabled ? '&#9679; Enabled' : '&#9679; Disabled'}
                    </span>
                </div>
                <div class="project-card-actions" onclick="event.stopPropagation()">
                    <button class="btn btn-reindex btn-sm" onclick="reindexProject('${McpUI.escapeHtml(p.id)}')">
                        <span class="spin-icon">&#8635;</span> Re-index
                    </button>
                    <button class="btn btn-edit btn-sm" onclick="openEditModal('${McpUI.escapeHtml(p.id)}')">Edit</button>
                    <button class="btn btn-danger btn-sm" onclick="deleteProject('${McpUI.escapeHtml(p.id)}')">Delete</button>
                </div>
                <span class="card-chevron">&#9660;</span>
            </div>
            <div class="project-card-body">
                <div class="project-card-details">
                    <div class="detail-row">
                        <span class="detail-label">Path</span>
                        <span class="path-chip">${McpUI.escapeHtml(p.path)}</span>
                    </div>
                    ${p.description ? `
                    <div class="detail-row">
                        <span class="detail-label">About</span>
                        <span>${McpUI.escapeHtml(p.description)}</span>
                    </div>` : ''}
                    <div class="detail-row">
                        <span class="detail-label">Added</span>
                        <span>${new Date(p.addedDate).toLocaleDateString(undefined, { year:'numeric', month:'short', day:'numeric' })}</span>
                    </div>
                </div>
            </div>
        </div>
    `).join('');
}

// ── Card collapse ─────────────────────────────────────────────
function toggleCard(id) {
    const card = document.getElementById(`card-${id}`);
    if (!card) return;
    card.classList.toggle('open');
}

// ── Modal ─────────────────────────────────────────────────────
function openAddModal() {
    editingProjectId = null;
    dom.modalTitle.textContent = 'Add New Project';
    resetForm();
    dom.modal.classList.remove('hidden');
    setTimeout(() => dom.projectName.focus(), 50);
}

function openEditModal(id) {
    const project = projects.find(p => p.id === id);
    if (!project) return;

    editingProjectId = id;
    dom.modalTitle.textContent         = 'Edit Project';
    dom.projectName.value              = project.name;
    dom.projectPath.value              = project.path;
    dom.projectDescription.value       = project.description || '';
    dom.projectEnabled.checked         = project.enabled;
    dom.validationResult.classList.add('hidden');

    dom.modal.classList.remove('hidden');
    setTimeout(() => dom.projectName.focus(), 50);
}

function closeModal() {
    dom.modal.classList.add('hidden');
    resetForm();
}

function resetForm() {
    dom.projectName.value        = '';
    dom.projectPath.value        = '';
    dom.projectDescription.value = '';
    dom.projectEnabled.checked   = true;
    dom.validationResult.classList.add('hidden');
    dom.validationResult.className = 'validation-result hidden';
}
