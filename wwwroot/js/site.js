// ── Global Toast Helper ───────────────────────────────────────────────────────
// Usage: showToast('Party saved successfully.')
//        showToast('Something went wrong.', 'error')
//        showToast('Record deleted.', 'warning')
//
// Types: 'success' | 'error' | 'warning' | 'info'

function showToast(message, type = 'success') {
    const styles = {
        success: { background: 'linear-gradient(135deg, #1a7a3c, #28a745)', icon: '✓' },
        error:   { background: 'linear-gradient(135deg, #b02a37, #dc3545)', icon: '✕' },
        warning: { background: 'linear-gradient(135deg, #d4600a, #fd7e14)', icon: '⚠' },
        info:    { background: 'linear-gradient(135deg, #0a58ca, #0d6efd)', icon: 'ℹ' },
    };

    const style = styles[type] || styles.success;

    Toastify({
        text: style.icon + '  ' + message,
        duration: 3500,
        gravity: 'top',
        position: 'right',
        stopOnFocus: true,
        style: {
            background: style.background,
            borderRadius: '8px',
            padding: '12px 20px',
            fontSize: '14px',
            fontWeight: '500',
            boxShadow: '0 4px 15px rgba(0,0,0,0.2)',
            minWidth: '280px',
        },
        onClick: function () {}
    }).showToast();
}
