document.addEventListener('DOMContentLoaded', function () {
    let table1 = document.querySelector('#table1');
    if (table1) { new simpleDatatables.DataTable(table1); }
    const addNewBtn = document.getElementById('addNewBtn');
    if (addNewBtn) { addNewBtn.addEventListener('click', () => alert('Add New Location clicked')); }
});
