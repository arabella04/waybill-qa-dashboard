/**
 * ============================================================================
 * OUTPUT Q.A. DASHBOARD MODULE
 * dashboards/output_qa.js
 * 
 * Manages Output QA report audit records, accuracy metrics, tables, 
 * and full client-side Excel & PDF data export.
 * ============================================================================
 */

function getOutputQAData() {
    return (window.QA_MONITORING_DATA && window.QA_MONITORING_DATA.output_qa) || [];
}

function renderOutputQADashboard() {
    const data = getOutputQAData();
    const searchVal = (document.getElementById('oqa-search-input')?.value || '').toLowerCase().trim();
    const checkerFilter = document.getElementById('oqa-checker-filter')?.value || 'ALL';
    const resultFilter = document.getElementById('oqa-result-filter')?.value || 'ALL';

    const filtered = data.filter(r => {
        const checker = (r.qa_checker || r.qa || '').toLowerCase();
        if (checkerFilter !== 'ALL' && !checker.includes(checkerFilter.toLowerCase())) return false;

        const res = (r.overall_result || '').toUpperCase();
        if (resultFilter === 'Passed' && !res.includes('PASS')) return false;
        if (resultFilter === 'Failed' && res.includes('PASS')) return false;

        if (!searchVal) return true;
        return (
            (r.ticket_no || '').toLowerCase().includes(searchVal) ||
            (r.report_name || '').toLowerCase().includes(searchVal) ||
            (r.data_analyst || '').toLowerCase().includes(searchVal) ||
            checker.includes(searchVal) ||
            (r.remarks || '').toLowerCase().includes(searchVal)
        );
    });

    // Update KPI metrics
    let totalReports = filtered.length;
    let totalPassed = 0;
    let totalHours = 0;
    let accuracyPassCount = 0;

    filtered.forEach(r => {
        const res = (r.overall_result || '').toUpperCase();
        if (res.includes('PASS')) totalPassed++;
        if ((r.accuracy || '').toUpperCase().includes('PASS')) accuracyPassCount++;
        totalHours += Number(r.hours) || 0.5;
    });

    const kpiTotal = document.getElementById('oqa-kpi-total');
    if (kpiTotal) kpiTotal.textContent = totalReports.toLocaleString();

    const kpiPassed = document.getElementById('oqa-kpi-passed');
    if (kpiPassed) kpiPassed.textContent = totalPassed.toLocaleString();

    const kpiPassRate = document.getElementById('oqa-kpi-pass-rate');
    if (kpiPassRate) {
        const pct = totalReports > 0 ? ((totalPassed / totalReports) * 100).toFixed(1) : '100.0';
        kpiPassRate.textContent = `${pct}% Overall Pass Rate`;
    }

    const kpiAccuracy = document.getElementById('oqa-kpi-accuracy');
    if (kpiAccuracy) {
        const accPct = totalReports > 0 ? ((accuracyPassCount / totalReports) * 100).toFixed(1) : '100.0';
        kpiAccuracy.textContent = `${accPct}%`;
    }

    const kpiHours = document.getElementById('oqa-kpi-hours');
    if (kpiHours) {
        const wholeH = Math.floor(totalHours);
        const mins = Math.round((totalHours - wholeH) * 60);
        kpiHours.textContent = `${wholeH}h ${mins}m`;
    }

    // Render Table rows
    const tbody = document.getElementById('oqa-table-tbody');
    if (tbody) {
        if (filtered.length === 0) {
            tbody.innerHTML = '<tr><td colspan="11" class="p-6 text-center text-slate-400 text-xs">No Output QA records match your filters.</td></tr>';
            return;
        }
        tbody.innerHTML = filtered.map(r => {
            const isPass = (r.overall_result || '').toUpperCase().includes('PASS');
            const badgeClass = isPass 
                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300' 
                : 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300';
            return `
                <tr class="hover:bg-slate-50 dark:hover:bg-slate-800/60 transition text-xs border-b border-slate-100 dark:border-slate-800">
                    <td class="px-3 py-2.5 font-mono text-[11px] font-bold text-blue-600 dark:text-cyan-400">${escapeHtml(r.ticket_no || r.monitoring_id || '-')}</td>
                    <td class="px-3 py-2.5 text-slate-600 dark:text-slate-300">${escapeHtml(r.date || '-')}</td>
                    <td class="px-3 py-2.5 font-medium text-slate-800 dark:text-slate-100 max-w-xs truncate" title="${escapeHtml(r.report_name || '')}">${escapeHtml(r.report_name || '-')}</td>
                    <td class="px-3 py-2.5 text-slate-600 dark:text-slate-300">${escapeHtml(r.data_analyst || '-')}</td>
                    <td class="px-3 py-2.5 font-semibold text-slate-900 dark:text-slate-100">${escapeHtml(r.qa_checker || r.qa || '-')}</td>
                    <td class="px-3 py-2.5 text-center font-bold ${r.accuracy === 'PASS' ? 'text-emerald-600' : 'text-rose-600'}">${escapeHtml(r.accuracy || '-')}</td>
                    <td class="px-3 py-2.5 text-center font-bold ${r.completeness === 'PASS' ? 'text-emerald-600' : 'text-rose-600'}">${escapeHtml(r.completeness || '-')}</td>
                    <td class="px-3 py-2.5 text-center font-bold ${r.logic === 'PASS' ? 'text-emerald-600' : 'text-rose-600'}">${escapeHtml(r.logic || '-')}</td>
                    <td class="px-3 py-2.5 text-center font-bold ${r.formatting === 'PASS' ? 'text-emerald-600' : 'text-rose-600'}">${escapeHtml(r.formatting || '-')}</td>
                    <td class="px-3 py-2.5 text-center">
                        <span class="px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase ${badgeClass}">${escapeHtml(r.overall_result || (isPass ? 'PASSED' : 'FAILED'))}</span>
                    </td>
                    <td class="px-3 py-2.5 text-slate-600 dark:text-slate-300 max-w-xs truncate" title="${escapeHtml(r.remarks || '')}">${escapeHtml(r.remarks || 'None')}</td>
                </tr>
            `;
        }).join('');
    }
}

/**
 * Export Output QA Data to Excel (.xlsx)
 */
function exportOutputQAExcel() {
    const data = getOutputQAData();
    if (!data || data.length === 0) {
        showNotification('No Output QA data available to export.', 'error');
        return;
    }

    if (typeof XLSX === 'undefined') {
        showNotification('SheetJS library is loading. Please wait...', 'error');
        return;
    }

    const rows = data.map(r => ({
        'Ticket #': r.ticket_no || r.monitoring_id || '',
        'Date': r.date || '',
        'Report / Dashboard': r.report_name || '',
        'Cutoff Date': r.cutoff_date || '',
        'Data Analyst': r.data_analyst || '',
        'QA Checker': r.qa_checker || r.qa || '',
        'QA Start': r.qa_start || '',
        'QA End': r.qa_end || '',
        'Hours': Number(r.hours) || 0.5,
        'Accuracy': r.accuracy || '',
        'Completeness': r.completeness || '',
        'Logic': r.logic || '',
        'Formatting': r.formatting || '',
        'Overall Result': r.overall_result || '',
        'Remarks': r.remarks || '',
        'Resolution Status': r.resolution_status || ''
    }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, 'Output QA Audits');
    const filename = `1Life_Output_QA_Report_${new Date().toISOString().slice(0, 10)}.xlsx`;
    XLSX.writeFile(wb, filename);
    showNotification(`Downloaded ${filename}`, 'success');
}

/**
 * Export Output QA Data to PDF (.pdf)
 */
function exportOutputQAPDF() {
    if (typeof exportModulePDF === 'function') {
        exportModulePDF('output_qa');
    } else {
        showNotification('Exporting PDF...', 'info');
        window.print();
    }
}

// Attach to window
window.renderOutputQADashboard = renderOutputQADashboard;
window.exportOutputQAExcel = exportOutputQAExcel;
window.exportOutputQAPDF = exportOutputQAPDF;
