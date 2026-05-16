/**
 * User Master Logic
 */
document.addEventListener('DOMContentLoaded', function () {
    // Initialize DataTable
    let table1 = document.querySelector('#table1');
    if (table1) {
        let dataTable = new simpleDatatables.DataTable(table1, {
            searchable: true,
            fixedHeight: false,
            perPage: 10
        });
    }

    // Add New Button Click
    const addNewBtn = document.getElementById('addNewBtn');
    if (addNewBtn) {
        addNewBtn.addEventListener('click', function() {
            // This will be replaced with modal or navigation logic later
            console.log('Add New User button clicked');
            // Example: window.location.href = '/Masters/User/Add';
        });
    }

    // Example of handling table actions
    document.addEventListener('click', function(e) {
        if (e.target.closest('.btn-outline-primary')) {
            console.log('Edit clicked');
        }
        if (e.target.closest('.btn-outline-danger')) {
            console.log('Delete clicked');
        }
    });
});
