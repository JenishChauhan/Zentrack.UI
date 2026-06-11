/**
 * Party Master - party.js
 * Server-side search + pagination. No simpleDatatables dependency.
 */

document.addEventListener('DOMContentLoaded', function () {

    // ── State ────────────────────────────────────────────────
    let deletePartyId = null;
    let currentPage   = 1;
    let currentSearch = '';
    let currentSize   = 10;
    let currentSort   = 'partyName';
    let currentDir    = 'asc';
    let searchTimer   = null;

    // ── DOM refs ─────────────────────────────────────────────
    const partyModal     = new bootstrap.Modal(document.getElementById('partyModal'));
    const deleteModal    = new bootstrap.Modal(document.getElementById('deleteModal'));
    const partyForm      = document.getElementById('partyForm');
    const saveBtn        = document.getElementById('savePartyBtn');
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
    const GST_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
    const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;
    const MOB_REGEX = /^[6-9][0-9]{9}$/;

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
        ['partyName','gstNo','panNo','mobileNo'].forEach(id =>
            document.getElementById(id).classList.remove('is-invalid','is-valid'));
        ['partyNameError','gstNoError','panNoError','mobileNoError'].forEach(id => {
            const el = document.getElementById(id); if (el) el.textContent = '';
        });
        hideModalAlert();
    }
    function validateForm() {
        clearAllErrors();
        let valid   = true;
        const name  = document.getElementById('partyName').value.trim();
        const gst   = document.getElementById('gstNo').value.trim();
        const pan   = document.getElementById('panNo').value.trim();
        const mob   = document.getElementById('mobileNo').value.trim();
        if (!name)              { setFieldError('partyName','partyNameError','Party name is required.'); valid = false; }
        else if (name.length>100){ setFieldError('partyName','partyNameError','Max 100 characters.'); valid = false; }
        if (gst && !GST_REGEX.test(gst)) { setFieldError('gstNo','gstNoError','Invalid GST format (e.g. 22AAAAA0000A1Z5).'); valid = false; }
        if (pan && !PAN_REGEX.test(pan)) { setFieldError('panNo','panNoError','Invalid PAN format (e.g. AAAAA9999A).'); valid = false; }
        if (mob && !MOB_REGEX.test(mob)) { setFieldError('mobileNo','mobileNoError','Enter valid 10-digit mobile starting with 6-9.'); valid = false; }
        return valid;
    }

    // ── Modal reset / populate ────────────────────────────────
    function resetModal() {
        partyForm.reset();
        document.getElementById('partyID').value = '';
        document.getElementById('isActiveWrapper').classList.add('d-none');
        document.getElementById('isActive').checked = true;
        document.getElementById('partyModalLabel').textContent = 'Add New Party';
        clearAllErrors();
    }
    function populateModal(p) {
        document.getElementById('partyModalLabel').textContent  = 'Edit Party';
        document.getElementById('partyID').value                = p.partyID;
        document.getElementById('partyName').value              = p.partyName      || '';
        document.getElementById('partyType').value              = p.partyType      || '';
        document.getElementById('gstNo').value                  = p.gstNo          || '';
        document.getElementById('panNo').value                  = p.panNo          || '';
        document.getElementById('contactPerson').value          = p.contactPerson  || '';
        document.getElementById('mobileNo').value               = p.mobileNo       || '';
        document.getElementById('address').value                = p.address        || '';
        document.getElementById('isActive').checked             = p.isActive;
        document.getElementById('isActiveWrapper').classList.remove('d-none');
    }

    // ── Sortable columns config ───────────────────────────────
    const COLUMNS = [
        { key: null,            label: '#',              sortable: false },
        { key: 'partyName',     label: 'Party Name',     sortable: true  },
        { key: 'partyType',     label: 'Type',           sortable: true  },
        { key: 'gstNo',         label: 'GST No',         sortable: true  },
        { key: 'contactPerson', label: 'Contact Person', sortable: true  },
        { key: 'mobileNo',      label: 'Mobile',         sortable: true  },
        { key: 'isActive',      label: 'Status',         sortable: true  },
        { key: null,            label: 'Action',         sortable: false },
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
                loadParties();
            });
        });
    }

    // ── Render table + pagination ─────────────────────────────
    function renderTable(result) {
        renderHeader();   // re-render header with current sort indicators
        const tbody      = document.getElementById('partyTableBody');
        const pagination = document.getElementById('pagination');
        const infoLabel  = document.getElementById('gridInfo');
        const parties    = result.data;
        const total      = result.totalRecords;
        const totalPages = result.totalPages;
        const page       = result.page;
        const size       = result.pageSize;

        // Rows
        if (!parties || parties.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted py-3">No parties found.</td></tr>';
        } else {
            tbody.innerHTML = parties.map((p, i) => `
                <tr>
                    <td>${(page - 1) * size + i + 1}</td>
                    <td>${escHtml(p.partyName)}</td>
                    <td>${escHtml(p.partyType || '-')}</td>
                    <td>${escHtml(p.gstNo || '-')}</td>
                    <td>${escHtml(p.contactPerson || '-')}</td>
                    <td>${escHtml(p.mobileNo || '-')}</td>
                    <td><span class="badge ${p.isActive ? 'bg-success' : 'bg-secondary'}">${p.isActive ? 'Active' : 'Inactive'}</span></td>
                    <td>
                        <button class="btn btn-sm btn-outline-primary me-1 edit-btn" data-id="${p.partyID}" title="Edit"><i class="bi bi-pencil"></i></button>
                        <button class="btn btn-sm btn-outline-danger delete-btn" data-id="${p.partyID}" data-name="${escHtml(p.partyName)}" title="Delete"><i class="bi bi-trash"></i></button>
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
                a.addEventListener('click', e => { e.preventDefault(); currentPage = pg; loadParties(); });
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
    function loadParties() {
        document.getElementById('partyTableBody').innerHTML =
            '<tr><td colspan="8" class="text-center py-3"><div class="spinner-border spinner-border-sm"></div> Loading...</td></tr>';

        const params = new URLSearchParams({
            page:     currentPage,
            pageSize: currentSize,
            search:   currentSearch,
            sortBy:   currentSort,
            sortDir:  currentDir
        });

        fetch(`${CONFIG.API_BASE_URL}/Party?${params}`, { method: 'GET', headers: authHeaders() })
            .then(r => r.json())
            .then(res => {
                if (res.success) renderTable(res.data);
                else document.getElementById('partyTableBody').innerHTML =
                    `<tr><td colspan="8" class="text-center text-danger">${escHtml(res.message)}</td></tr>`;
            })
            .catch(() => {
                document.getElementById('partyTableBody').innerHTML =
                    '<tr><td colspan="8" class="text-center text-danger">Failed to connect to API.</td></tr>';
            });
    }

    // ── API: Save ─────────────────────────────────────────────
    function saveParty() {
        if (!validateForm()) return;
        const id     = document.getElementById('partyID').value;
        const isEdit = !!id;
        const body   = {
            partyName:     document.getElementById('partyName').value.trim(),
            partyType:     document.getElementById('partyType').value || null,
            gstNo:         document.getElementById('gstNo').value.trim() || null,
            panNo:         document.getElementById('panNo').value.trim() || null,
            contactPerson: document.getElementById('contactPerson').value.trim() || null,
            mobileNo:      document.getElementById('mobileNo').value.trim() || null,
            address:       document.getElementById('address').value.trim() || null,
        };
        if (isEdit) body.isActive = document.getElementById('isActive').checked;

        setSaveBusy(true);
        fetch(isEdit ? `${CONFIG.API_BASE_URL}/Party/${id}` : `${CONFIG.API_BASE_URL}/Party`, {
            method:  isEdit ? 'PUT' : 'POST',
            headers: authHeaders(),
            body:    JSON.stringify(body)
        })
        .then(r => r.json())
        .then(res => {
            setSaveBusy(false);
            if (res.success) {
                partyModal.hide();
                showToast(`Party ${isEdit ? 'updated' : 'created'} successfully.`, 'success');
                loadParties();
            } else {
                showModalAlert(res.message || 'Something went wrong.');
            }
        })
        .catch(() => { setSaveBusy(false); showModalAlert('Failed to connect to API.'); });
    }

    // ── API: Delete ───────────────────────────────────────────
    function deleteParty() {
        if (!deletePartyId) return;
        fetch(`${CONFIG.API_BASE_URL}/Party/${deletePartyId}`, { method: 'DELETE', headers: authHeaders() })
            .then(r => r.json())
            .then(res => {
                deleteModal.hide();
                if (res.success) { showToast('Party deleted successfully.', 'success'); loadParties(); }
                else showToast(res.message || 'Delete failed.', 'error');
            })
            .catch(() => { deleteModal.hide(); showToast('Failed to connect to API.', 'error'); });
    }

    // ── Event delegation for edit/delete buttons ──────────────
    document.querySelector('.card-body').addEventListener('click', function (e) {
        const editBtn   = e.target.closest('.edit-btn');
        const deleteBtn = e.target.closest('.delete-btn');
        if (editBtn) {
            fetch(`${CONFIG.API_BASE_URL}/Party/${editBtn.dataset.id}`, { method: 'GET', headers: authHeaders() })
                .then(r => r.json())
                .then(res => {
                    if (res.success) { resetModal(); populateModal(res.data); partyModal.show(); }
                    else showToast(res.message, 'error');
                })
                .catch(() => showToast('Failed to load party details.', 'error'));
        }
        if (deleteBtn) {
            deletePartyId = deleteBtn.dataset.id;
            document.getElementById('deletePartyName').textContent = deleteBtn.dataset.name;
            deleteModal.show();
        }
    });

    // ── Top-level events ──────────────────────────────────────
    document.getElementById('addNewBtn').addEventListener('click', () => { resetModal(); partyModal.show(); });
    saveBtn.addEventListener('click', saveParty);
    document.getElementById('confirmDeleteBtn').addEventListener('click', deleteParty);
    document.getElementById('partyModal').addEventListener('hidden.bs.modal', resetModal);

    // Search — debounced 400ms, resets to page 1
    searchInput.addEventListener('input', function () {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(() => {
            currentSearch = this.value.trim();
            currentPage   = 1;
            loadParties();
        }, 400);
    });

    // Page size change
    pageSizeSelect.addEventListener('change', function () {
        currentSize = parseInt(this.value, 10);
        currentPage = 1;
        loadParties();
    });

    // Clear field errors on input
    ['partyName','gstNo','panNo','mobileNo'].forEach(id =>
        document.getElementById(id).addEventListener('input', () => clearFieldError(id, id + 'Error')));

    // ── Init ──────────────────────────────────────────────────
    renderHeader();
    loadParties();
});
