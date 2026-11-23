/**
 * ============================================================================
 * DISPATCH Q.A. DASHBOARD MODULE
 * dashboards/dispatch.js
 * 
 * Manages Dispatch QA monitoring records, metrics, tables, 
 * and full client-side Excel & PDF data export.
 * ============================================================================
 */

function getDispatchQAData() {
    return (window.QA_MONITORING_DATA && window.QA_MONITORING_DATA.dispatch_qa) || [];
}

function renderDispatchQASheetTable() {
    const data = getDispatchQAData();
    const searchVal = (document.getElementById('dispatch-sheet-search')?.value || '').toLowerCase().trim();
    const qaFilter = document.getElementById('dispatch-sheet-qa-filter')?.value || 'ALL';

    const filtered = data.filter(r => {
        const qa = (r.qa || '').toLowerCase();
        if (qaFilter !== 'ALL' && !qa.includes(qaFilter.toLowerCase())) return false;
        if (!searchVal) return true;
        return (
            (r.monitoring_id || '').toLowerCase().includes(searchVal) ||
            qa.includes(searchVal) ||
            (r.scope || '').toLowerCase().includes(searchVal) ||
            (r.issues || '').toLowerCase().includes(searchVal) ||
            (r.date || '').toLowerCase().includes(searchVal)
        );
    });

    // Update KPI metrics
    let totalSessions = filtered.length;
    let totalOverridden = 0;
    let totalHours = 0;

    filtered.forEach(r => {
        totalOverridden += Number(r.overridden_count) || 0;
        totalHours += Number(r.hours) || 0;
    });

    const kpiSessions = document.getElementById('disp-kpi-sessions');
    if (kpiSessions) kpiSessions.textContent = totalSessions.toLocaleString();

    const kpiOverridden = document.getElementById('disp-kpi-overridden');
    if (kpiOverridden) kpiOverridden.textContent = totalOverridden.toLocaleString();

    const kpiHours = document.getElementById('disp-kpi-hours');
    if (kpiHours) {
        const wholeH = Math.floor(totalHours);
        const mins = Math.round((totalHours - wholeH) * 60);
        kpiHours.textContent = `${wholeH}h ${mins}m`;
    }

    const kpiRate = document.getElementById('disp-kpi-rate');
    if (kpiRate) {
        const rate = totalHours > 0 ? (totalOverridden / totalHours).toFixed(1) : '0.0';
        kpiRate.textContent = rate;
    }

    // Render Table rows
    const tbody = document.getElementById('dispatch-sheet-tbody');
    if (tbody) {
        if (filtered.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" class="p-6 text-center text-slate-400 text-xs">No Dispatch QA records match your filters.</td></tr>';
            return;
        }
        tbody.innerHTML = filtered.map(r => `
            <tr class="hover:bg-slate-50 dark:hover:bg-slate-800/60 transition text-xs border-b border-slate-100 dark:border-slate-800">
                <td class="px-4 py-2.5 font-mono text-[11px] font-bold text-teal-600 dark:text-cyan-400">${escapeHtml(r.monitoring_id || '-')}</td>
                <td class="px-4 py-2.5 font-semibold text-slate-900 dark:text-slate-100">${escapeHtml(r.qa || '-')}</td>
                <td class="px-4 py-2.5 text-slate-600 dark:text-slate-300">${escapeHtml(r.date || '-')}</td>
                <td class="px-4 py-2.5 text-slate-500 font-mono text-[10px]">${escapeHtml(r.time_started || '-')} – ${escapeHtml(r.time_ended || '-')}</td>
                <td class="px-4 py-2.5 text-right font-mono font-bold text-slate-800 dark:text-slate-200">${Number(r.hours || 0).toFixed(2)}h</td>
                <td class="px-4 py-2.5 text-slate-600 dark:text-slate-300">${escapeHtml(r.scope || '-')}</td>
                <td class="px-4 py-2.5 text-right font-mono font-bold text-[#00b4d8]">${Number(r.overridden_count || 0).toLocaleString()}</td>
                <td class="px-4 py-2.5 text-slate-600 dark:text-slate-300 max-w-xs truncate" title="${escapeHtml(r.issues || '')}">${escapeHtml(r.issues || 'None')}</td>
            </tr>
        `).join('');
    }
}

/**
 * Export Dispatch QA Data to Excel (.xlsx)
 */
function exportDispatchExcel() {
    const data = getDispatchQAData();
    if (!data || data.length === 0) {
        showNotification('No Dispatch QA data available to export.', 'error');
        return;
    }

    if (typeof XLSX === 'undefined') {
        showNotification('SheetJS library is loading. Please wait...', 'error');
        return;
    }

    const rows = data.map(r => ({
        'Monitoring ID': r.monitoring_id || '',
        'QA Specialist': r.qa || '',
        'Email': r.email || '',
        'Date': r.date || '',
        'Time Started': r.time_started || '',
        'Time Ended': r.time_ended || '',
        'Hours': Number(r.hours) || 0,
        'Scope': r.scope || '',
        'Overridden Count': Number(r.overridden_count) || 0,
        'Status': r.status || '',
        'Issues': r.issues || ''
    }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, 'Dispatch QA');
    const filename = `1Life_Dispatch_QA_Report_${new Date().toISOString().slice(0, 10)}.xlsx`;
    XLSX.writeFile(wb, filename);
    showNotification(`Downloaded ${filename}`, 'success');
}

/**
 * Export Dispatch QA Data to PDF (.pdf)
 */
function exportDispatchPDF() {
    if (typeof exportModulePDF === 'function') {
        exportModulePDF('dispatch_qa');
    } else {
        showNotification('Exporting PDF...', 'info');
        window.print();
    }
}

// Attach to window
window.renderDispatchQASheetTable = renderDispatchQASheetTable;
window.exportDispatchExcel = exportDispatchExcel;
window.exportDispatchPDF = exportDispatchPDF;
