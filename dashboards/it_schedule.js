/**
 * ============================================================================
 * IT SCHEDULE MONITORING Q.A. DASHBOARD MODULE
 * dashboards/it_schedule.js
 * 
 * Manages IT Schedule Monitoring QA records, metrics, tables, 
 * and full client-side Excel & PDF data export.
 * ============================================================================
 */

function getITScheduleData() {
    return (window.QA_MONITORING_DATA && window.QA_MONITORING_DATA.it_schedule) || [];
}

function renderITScheduleDashboard() {
    const data = getITScheduleData();
    const searchVal = (document.getElementById('itsched-search-input')?.value || '').toLowerCase().trim();
    const qaFilter = document.getElementById('itsched-qa-filter')?.value || 'ALL';

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
    let totalChecked = 0;
    let totalLinked = 0;
    let totalHours = 0;

    filtered.forEach(r => {
        totalChecked += Number(r.checked_count) || 0;
        totalLinked += Number(r.linked_count) || 0;
        totalHours += Number(r.hours) || 0.8;
    });

    const kpiSessions = document.getElementById('itsched-kpi-sessions');
    if (kpiSessions) kpiSessions.textContent = totalSessions.toLocaleString();

    const kpiChecked = document.getElementById('itsched-kpi-checked');
    if (kpiChecked) kpiChecked.textContent = totalChecked.toLocaleString();

    const kpiLinked = document.getElementById('itsched-kpi-linked');
    if (kpiLinked) kpiLinked.textContent = totalLinked.toLocaleString();

    const kpiHours = document.getElementById('itsched-kpi-hours');
    if (kpiHours) {
        const wholeH = Math.floor(totalHours);
        const mins = Math.round((totalHours - wholeH) * 60);
        kpiHours.textContent = `${wholeH}h ${mins}m`;
    }

    // Render Table rows
    const tbody = document.getElementById('itsched-table-tbody');
    if (tbody) {
        if (filtered.length === 0) {
            tbody.innerHTML = '<tr><td colspan="9" class="p-6 text-center text-slate-400 text-xs">No IT Schedule records match your filters.</td></tr>';
            return;
        }
        tbody.innerHTML = filtered.map(r => `
            <tr class="hover:bg-slate-50 dark:hover:bg-slate-800/60 transition text-xs border-b border-slate-100 dark:border-slate-800">
                <td class="px-4 py-2.5 font-mono text-[11px] font-bold text-amber-600 dark:text-amber-400">${escapeHtml(r.monitoring_id || '-')}</td>
                <td class="px-4 py-2.5 font-semibold text-slate-900 dark:text-slate-100">${escapeHtml(r.qa || '-')}</td>
                <td class="px-4 py-2.5 text-slate-600 dark:text-slate-300">${escapeHtml(r.date || '-')}</td>
                <td class="px-4 py-2.5 text-slate-500 font-mono text-[10px]">${escapeHtml(r.time_started || '-')} – ${escapeHtml(r.time_ended || '-')}</td>
                <td class="px-4 py-2.5 text-right font-mono font-bold text-slate-800 dark:text-slate-200">${Number(r.hours || 0).toFixed(2)}h</td>
                <td class="px-4 py-2.5 text-right font-mono font-bold text-blue-600 dark:text-cyan-400">${Number(r.checked_count || 0).toLocaleString()}</td>
                <td class="px-4 py-2.5 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400">${Number(r.linked_count || 0).toLocaleString()}</td>
                <td class="px-4 py-2.5 text-slate-600 dark:text-slate-300 max-w-xs truncate" title="${escapeHtml(r.scope || '')}">${escapeHtml(r.scope || '-')}</td>
                <td class="px-4 py-2.5 text-slate-600 dark:text-slate-300 max-w-xs truncate" title="${escapeHtml(r.issues || '')}">${escapeHtml(r.issues || 'None')}</td>
            </tr>
        `).join('');
    }
}

/**
 * Export IT Schedule Data to Excel (.xlsx)
 */
function exportITScheduleExcel() {
    const data = getITScheduleData();
    if (!data || data.length === 0) {
        showNotification('No IT Schedule data available to export.', 'error');
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
        'Hours': Number(r.hours) || 0.8,
        'Checked Count': Number(r.checked_count) || 0,
        'Linked Count': Number(r.linked_count) || 0,
        'Scope': r.scope || '',
        'Issues': r.issues || '',
        'Status': r.status || ''
    }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, 'IT Schedule QA');
    const filename = `1Life_IT_Schedule_Report_${new Date().toISOString().slice(0, 10)}.xlsx`;
    XLSX.writeFile(wb, filename);
    showNotification(`Downloaded ${filename}`, 'success');
}

/**
 * Export IT Schedule Data to PDF (.pdf)
 */
function exportITSchedulePDF() {
    if (typeof exportModulePDF === 'function') {
        exportModulePDF('it_schedule');
    } else {
        showNotification('Exporting PDF...', 'info');
        window.print();
    }
}

// Attach to window
window.renderITScheduleDashboard = renderITScheduleDashboard;
window.exportITScheduleExcel = exportITScheduleExcel;
window.exportITSchedulePDF = exportITSchedulePDF;
