/**
 * Location Master - location.js
 * Server-side search + pagination. No simpleDatatables dependency.
 */

document.addEventListener('DOMContentLoaded', function () {

    // ── State ────────────────────────────────────────────────
    let deleteLocationId = null;
    let currentPage   = 1;
    let currentSearch = '';
    let currentSize   = 10;
    let currentSort   = 'locationName';
    let currentDir    = 'asc';
    let searchTimer   = null;

    // ── DOM refs ─────────────────────────────────────────────
    const locationModal  = new bootstrap.Modal(document.getElementById('locationModal'));
    const deleteModal    = new bootstrap.Modal(document.getElementById('deleteModal'));
    const locationForm   = document.getElementById('locationForm');
    const saveBtn        = document.getElementById('saveLocationBtn');
    const saveBtnSpinner = document.getElementById('saveBtnSpinner');
    const modalAlert     = document.getElementById('modalAlert');
    const searchInput    = document.getElementById('gridSearch');
    const pageSizeSelect = document.getElementById('pageSizeSelect');

    // ── Auth helpers ──────────────────────────────────────────
    function getToken()    { return localStorage.getItem('zentrackToken') || ''; }
    function authHeaders() {
        return { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + getToken() };
    }

    // ── Modal helpers ─────────────────────────────────────────
    function showModalAlert(msg) { modalAlert.textContent = msg; modalAlert.classList.remove('d-none'); }
    function hideModalAlert()    { modalAlert.classList.add('d-none'); modalAlert.textContent = ''; }
    function setSaveBusy(busy)   { saveBtn.disabled = busy; saveBtnSpinner.classList.toggle('d-none', !busy); }

    function escHtml(str) {
        const d = document.createElement('div');
        d.textContent = String(str ?? '');
        return d.innerHTML;
    }

    // ── Validation ────────────────────────────────────────────
    function setFieldError(inputId, errorId, msg) {
        document.getElementById(inputId).classList.add('is-invalid');
        document.getElementById(errorId).textContent = msg;
    }
    function clearFieldError(inputId, errorId) {
        document.getElementById(inputId).classList.remove('is-invalid');
        const el = document.getElementById(errorId);
        if (el) el.textContent = '';
    }
    function clearAllErrors() {
        ['locationName','city','state','county'].forEach(id =>
            document.getElementById(id).classList.remove('is-invalid','is-valid'));
        ['locationNameError','cityError','stateError','countyError'].forEach(id => {
            const el = document.getElementById(id); if (el) el.textContent = '';
        });
        hideModalAlert();
    }
    function validateForm() {
        clearAllErrors();
        let valid   = true;
        const name  = document.getElementById('locationName').value.trim();
        const city  = document.getElementById('city').value.trim();
        const state = document.getElementById('state').value.trim();
        const county = document.getElementById('county').value.trim();
        if (!name)              { setFieldError('locationName','locationNameError','Location name is required.'); valid = false; }
        else if (name.length>100){ setFieldError('locationName','locationNameError','Max 100 characters.'); valid = false; }
        if (city.length > 50)   { setFieldError('city','cityError','Max 50 characters.'); valid = false; }
        if (state.length > 50)  { setFieldError('state','stateError','Max 50 characters.'); valid = false; }
        if (county.length > 50) { setFieldError('county','countyError','Max 50 characters.'); valid = false; }
        return valid;
    }

    // ── Modal reset / populate ────────────────────────────────
    function resetModal() {
        locationForm.reset();
        document.getElementById('locationID').value = '';
        document.getElementById('isActiveWrapper').classList.add('d-none');
        document.getElementById('isActive').checked = true;
        document.getElementById('locationModalLabel').textContent = 'Add New Location';
        clearAllErrors();
    }
    function populateModal(l) {
        document.getElementById('locationModalLabel').textContent = 'Edit Location';
        document.getElementById('locationID').value               = l.locationID;
        document.getElementById('locationName').value             = l.locationName   || '';
        document.getElementById('city').value                     = l.city           || '';
        document.getElementById('state').value                    = l.state          || '';
        document.getElementById('county').value                   = l.county         || '';
        document.getElementById('isActive').checked               = l.isActive;
        document.getElementById('isActiveWrapper').classList.remove('d-none');
    }

    // ── Sortable columns config ───────────────────────────────
    const COLUMNS = [
        { key: null,           label: '#',             sortable: false },
        { key: 'locationName', label: 'Location Name', sortable: true  },
        { key: 'city',         label: 'City',          sortable: true  },
        { key: 'state',        label: 'State',         sortable: true  },
        { key: 'county',       label: 'County',        sortable: true  },
        { key: 'isActive',     label: 'Status',        sortable: true  },
        { key: null,           label: 'Action',        sortable: false },
    ];

    function renderHeader() {
        const thead = document.querySelector('#table1 thead tr');
        thead.innerHTML = COLUMNS.map(col => {
            if (!col.sortable) return `<th>${col.label}</th>`;
            const isActive = currentSort === col.key;
            const icon = isActive
                ? (currentDir === 'asc' ? ' <i class="bi bi-caret-up-fill text-primary small"></i>'
                                        : ' <i class="bi bi-caret-down-fill text-primary small"></i>')
                : ' <i class="bi bi-arrow-down-up text-muted small"></i>';
            return `<th class="sortable-col" data-col="${col.key}" style="cursor:pointer;user-select:none;">${col.label}${icon}</th>`;
        }).join('');

        // Attach sort click
        thead.querySelectorAll('.sortable-col').forEach(th => {
            th.addEventListener('click', () => {
                const col = th.dataset.col;
                if (currentSort === col) {
                    currentDir = currentDir === 'asc' ? 'desc' : 'asc';
                } else {
                    currentSort = col;
                    currentDir  = 'asc';
                }
                currentPage = 1;
                loadLocations();
            });
        });
    }

    // ── Render table + pagination ─────────────────────────────
    function renderTable(result) {
        renderHeader();   // re-render header with current sort indicators
        const tbody      = document.getElementById('locationTableBody');
        const pagination = document.getElementById('pagination');
        const infoLabel  = document.getElementById('gridInfo');
        const locations  = result.data;
        const total      = result.totalRecords;
        const totalPages = result.totalPages;
        const page       = result.page;
        const size       = result.pageSize;

        // Rows
        if (!locations || locations.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted py-3">No locations found.</td></tr>';
        } else {
            tbody.innerHTML = locations.map((l, i) => `
                <tr>
                    <td>${(page - 1) * size + i + 1}</td>
                    <td>${escHtml(l.locationName)}</td>
                    <td>${escHtml(l.city || '-')}</td>
                    <td>${escHtml(l.state || '-')}</td>
                    <td>${escHtml(l.county || '-')}</td>
                    <td><span class="badge ${l.isActive ? 'bg-success' : 'bg-secondary'}">${l.isActive ? 'Active' : 'Inactive'}</span></td>
                    <td>
                        <button class="btn btn-sm btn-outline-primary me-1 edit-btn" data-id="${l.locationID}" title="Edit"><i class="bi bi-pencil"></i></button>
                        <button class="btn btn-sm btn-outline-danger delete-btn" data-id="${l.locationID}" data-name="${escHtml(l.locationName)}" title="Delete"><i class="bi bi-trash"></i></button>
                    </td>
                </tr>`).join('');
        }

        // Info label
        if (total === 0) {
            infoLabel.textContent = 'No entries found';
        } else {
            const from = (page - 1) * size + 1;
            const to   = Math.min(page * size, total);
            infoLabel.textContent = `Showing ${from} to ${to} of ${total} entries`;
        }

        // Pagination buttons
        pagination.innerHTML = '';
        if (totalPages <= 1) return;

        const mkBtn = (label, pg, disabled, active) => {
            const li  = document.createElement('li');
            li.className = `page-item${disabled ? ' disabled' : ''}${active ? ' active' : ''}`;
            const a   = document.createElement('a');
            a.className = 'page-link';
            a.href      = '#';
            a.innerHTML = label;
            if (!disabled && !active) {
                a.addEventListener('click', e => { e.preventDefault(); currentPage = pg; loadLocations(); });
            }
            li.appendChild(a);
            pagination.appendChild(li);
        };

        mkBtn('&laquo;', page - 1, page === 1, false);

        // Show max 5 page buttons around current
        const start = Math.max(1, page - 2);
        const end   = Math.min(totalPages, page + 2);
        if (start > 1) { mkBtn('1', 1, false, false); if (start > 2) mkBtn('…', null, true, false); }
        for (let pg = start; pg <= end; pg++) mkBtn(pg, pg, false, pg === page);
        if (end < totalPages) { if (end < totalPages - 1) mkBtn('…', null, true, false); mkBtn(totalPages, totalPages, false, false); }

        mkBtn('&raquo;', page + 1, page === totalPages, false);
    }

    // ── API: Load paged ───────────────────────────────────────
    function loadLocations() {
        document.getElementById('locationTableBody').innerHTML =
            '<tr><td colspan="7" class="text-center py-3"><div class="spinner-border spinner-border-sm"></div> Loading...</td></tr>';

        const params = new URLSearchParams({
            page:     currentPage,
            pageSize: currentSize,
            search:   currentSearch,
            sortBy:   currentSort,
            sortDir:  currentDir
        });

        fetch(`${CONFIG.API_BASE_URL}/Location?${params}`, { method: 'GET', headers: authHeaders() })
            .then(r => r.json())
            .then(res => {
                if (res.success) renderTable(res.data);
                else document.getElementById('locationTableBody').innerHTML =
                    `<tr><td colspan="7" class="text-center text-danger">${escHtml(res.message)}</td></tr>`;
            })
            .catch(() => {
                document.getElementById('locationTableBody').innerHTML =
                    '<tr><td colspan="7" class="text-center text-danger">Failed to connect to API.</td></tr>';
            });
    }

    // ── API: Save ─────────────────────────────────────────────
    function saveLocation() {
        if (!validateForm()) return;
        const id     = document.getElementById('locationID').value;
        const isEdit = !!id;
        const body   = {
            locationName: document.getElementById('locationName').value.trim(),
            city:         document.getElementById('city').value.trim() || null,
            state:        document.getElementById('state').value.trim() || null,
            county:       document.getElementById('county').value.trim() || null,
        };
        if (isEdit) body.isActive = document.getElementById('isActive').checked;

        setSaveBusy(true);
        fetch(isEdit ? `${CONFIG.API_BASE_URL}/Location/${id}` : `${CONFIG.API_BASE_URL}/Location`, {
            method:  isEdit ? 'PUT' : 'POST',
            headers: authHeaders(),
            body:    JSON.stringify(body)
        })
        .then(r => r.json())
        .then(res => {
            setSaveBusy(false);
            if (res.success) {
                locationModal.hide();
                showToast(`Location ${isEdit ? 'updated' : 'created'} successfully.`, 'success');
                loadLocations();
            } else {
                showModalAlert(res.message || 'Something went wrong.');
            }
        })
        .catch(() => { setSaveBusy(false); showModalAlert('Failed to connect to API.'); });
    }

    // ── API: Delete ───────────────────────────────────────────
    function deleteLocation() {
        if (!deleteLocationId) return;
        fetch(`${CONFIG.API_BASE_URL}/Location/${deleteLocationId}`, { method: 'DELETE', headers: authHeaders() })
            .then(r => r.json())
            .then(res => {
                deleteModal.hide();
                if (res.success) { showToast('Location deleted successfully.', 'success'); loadLocations(); }
                else showToast(res.message || 'Delete failed.', 'error');
            })
            .catch(() => { deleteModal.hide(); showToast('Failed to connect to API.', 'error'); });
    }

    // ── Event delegation for edit/delete buttons ──────────────
    document.querySelector('.card-body').addEventListener('click', function (e) {
        const editBtn   = e.target.closest('.edit-btn');
        const deleteBtn = e.target.closest('.delete-btn');
        if (editBtn) {
            fetch(`${CONFIG.API_BASE_URL}/Location/${editBtn.dataset.id}`, { method: 'GET', headers: authHeaders() })
                .then(r => r.json())
                .then(res => {
                    if (res.success) { resetModal(); populateModal(res.data); locationModal.show(); }
                    else showToast(res.message, 'error');
                })
                .catch(() => showToast('Failed to load location details.', 'error'));
        }
        if (deleteBtn) {
            deleteLocationId = deleteBtn.dataset.id;
            document.getElementById('deleteLocationName').textContent = deleteBtn.dataset.name;
            deleteModal.show();
        }
    });

    // ── Top-level events ──────────────────────────────────────
    document.getElementById('addNewBtn').addEventListener('click', () => { resetModal(); locationModal.show(); });
    saveBtn.addEventListener('click', saveLocation);
    document.getElementById('confirmDeleteBtn').addEventListener('click', deleteLocation);
    document.getElementById('locationModal').addEventListener('hidden.bs.modal', resetModal);

    // Search — debounced 400ms, resets to page 1
    searchInput.addEventListener('input', function () {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(() => {
            currentSearch = this.value.trim();
            currentPage   = 1;
            loadLocations();
        }, 400);
    });

    // Page size change
    pageSizeSelect.addEventListener('change', function () {
        currentSize = parseInt(this.value, 10);
        currentPage = 1;
        loadLocations();
    });

    // Clear field errors on input
    ['locationName','city','state','county'].forEach(id =>
        document.getElementById(id).addEventListener('input', () => clearFieldError(id, id + 'Error')));

    // ── Init ──────────────────────────────────────────────────
    renderHeader();
    loadLocations();
});
