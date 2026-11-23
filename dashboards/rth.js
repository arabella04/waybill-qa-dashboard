/**
 * ============================================================================
 * RTH NOTES & INVALID DOCUMENTS DASHBOARD MODULE
 * dashboards/rth.js
 * 
 * Manages RTH Defect analysis, multi-checkbox date filtering (per day & weekly),
 * KPI defect metrics, rider error rankings, and full client-side Excel & PDF data export.
 * ============================================================================
 */

function exportRTHNotesExcel() {
    if (typeof exportRTHReportExcelDirect === 'function') {
        exportRTHReportExcelDirect();
    } else if (typeof exportModuleExcel === 'function') {
        exportModuleExcel('invalid_waybills');
    }
}

function exportRTHNotesPDF() {
    if (typeof exportRTHReportPDFDirect === 'function') {
        exportRTHReportPDFDirect();
    } else if (typeof exportModulePDF === 'function') {
        exportModulePDF('invalid_waybills');
    }
}

// Attach to window
window.exportRTHNotesExcel = exportRTHNotesExcel;
window.exportRTHNotesPDF = exportRTHNotesPDF;
