/**
 * ============================================================================
 * WAYBILL VALIDATION Q.A. DASHBOARD MODULE
 * dashboards/waybill.js
 * 
 * Manages Waybill QA monitoring records, metrics, tables, 
 * and full client-side Excel & PDF data export.
 * ============================================================================
 */

function getPharmacyQAData() {
    return (window.QA_MONITORING_DATA && window.QA_MONITORING_DATA.pharmacy) || [];
}

function getDailyWaybillLogData() {
    return (window.QA_MONITORING_DATA && window.QA_MONITORING_DATA.daily_waybill_log) || [];
}

/**
 * Export Waybill Validation Report to Excel (.xlsx)
 */
function exportWaybillExcel() {
    const pharmacy = getPharmacyQAData();
    const dailyLog = getDailyWaybillLogData();

    if (pharmacy.length === 0 && dailyLog.length === 0) {
        showNotification('No Waybill QA data available to export.', 'error');
        return;
    }

    if (typeof XLSX === 'undefined') {
        showNotification('SheetJS library is loading. Please wait...', 'error');
        return;
    }

    const wb = XLSX.utils.book_new();

    // Sheet 1: Pharmacy Waybill Sessions
    if (pharmacy.length > 0) {
        const rows1 = pharmacy.map(r => ({
            'Monitoring ID': r.monitoring_id || '',
            'QA Specialist': r.qa || '',
            'Email': r.email || '',
            'Date': r.date || '',
            'Time Started': r.time_started || '',
            'Time Ended': r.time_ended || '',
            'Hours': Number(r.hours) || 0,
            'Scope': r.scope || '',
            'Validated Waybills': Number(r.validated_count) || 0,
            'Status': r.status || '',
            'Issues / Findings': r.issues || ''
        }));
        const ws1 = XLSX.utils.json_to_sheet(rows1);
        XLSX.utils.book_append_sheet(wb, ws1, 'Waybill QA Sessions');
    }

    // Sheet 2: Daily Waybill Quota Log
    if (dailyLog.length > 0) {
        const rows2 = dailyLog.map(r => ({
            'Date': r.date || '',
            'Total Waybills in Scope': Number(r.total_waybills) || 0,
            'Quota Target %': r.quota_pct || '20%',
            'Target per QA': Number(r.target_per_qa) || 0,
            'Arabella': Number(r.arabella) || 0,
            'Janryl': Number(r.janryl) || 0,
            'John Michael': Number(r.john_michael) || 0,
            'Julius': Number(r.julius) || 0,
            'Yesha': Number(r.yesha) || 0,
            'Total Validated': Number(r.total_validated) || 0,
            'Remaining': Number(r.remaining) || 0,
            'Status': r.status || ''
        }));
        const ws2 = XLSX.utils.json_to_sheet(rows2);
        XLSX.utils.book_append_sheet(wb, ws2, 'Daily Quota Log');
    }

    const filename = `1Life_Waybill_QA_Report_${new Date().toISOString().slice(0, 10)}.xlsx`;
    gasDownloadExcel(wb, fileName);
    showNotification(`Downloaded ${filename}`, 'success');
}

/**
 * Export Waybill Validation Report to PDF (.pdf)
 */
function exportWaybillPDF() {
    if (typeof exportModulePDF === 'function') {
        exportModulePDF('pharmacy');
    } else {
        showNotification('Exporting PDF...', 'info');
        window.print();
    }
}

// Attach to window
window.exportWaybillExcel = exportWaybillExcel;
window.exportWaybillPDF = exportWaybillPDF;
