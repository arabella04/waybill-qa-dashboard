/**
 * ============================================================================
 * ACCOUNT MERGING Q.A. DASHBOARD MODULE
 * dashboards/account_merging.js
 * 
 * Manages Account Merging QA monitoring records, metrics, tables, 
 * and full client-side Excel & PDF data export.
 * ============================================================================
 */

function getAccountMergingData() {
    const raw = (window.QA_MONITORING_DATA && window.QA_MONITORING_DATA.account_merging) || [];
    return raw;
}

function renderAccountMergingDashboard() {
    const data = getAccountMergingData();
    const searchVal = (document.getElementById('am-search-input')?.value || '').toLowerCase().trim();
    const qaFilter = document.getElementById('am-qa-filter')?.value || 'ALL';

    const filtered = data.filter(r => {
        const qa = (r.qa || '').toLowerCase();
        if (qaFilter !== 'ALL' && !qa.includes(qaFilter.toLowerCase())) return false;
        if (!searchVal) return true;
        return (
            (r.monitoring_id || '').toLowerCase().includes(searchVal) ||
            qa.includes(searchVal) ||
            (r.locations_checked || '').toLowerCase().includes(searchVal) ||
            (r.date || '').toLowerCase().includes(searchVal)
        );
    });

    // Update KPI metrics
    let totalSessions = filtered.length;
    let totalLocations = 0;
    let totalHours = 0;
    let totalMerged = 0;
    const specialistStats = {};

    filtered.forEach(r => {
        const locCount = Number(r.locations_count) || 0;
        const hrs = Number(r.hours) || 0;
        const merged = Number(r.merged_accounts) || 0;
        totalLocations += locCount;
        totalHours += hrs;
        totalMerged += merged;

        const spName = (r.qa || 'Unassigned').trim();
        if (!specialistStats[spName]) {
            specialistStats[spName] = { sessions: 0, locations: 0, merged: 0, hours: 0 };
        }
        specialistStats[spName].sessions += 1;
        specialistStats[spName].locations += locCount;
        specialistStats[spName].merged += merged;
        specialistStats[spName].hours += hrs;
    });

    const kpiSessions = document.getElementById('am-kpi-sessions');
    if (kpiSessions) kpiSessions.textContent = totalSessions.toLocaleString();

    const kpiLocations = document.getElementById('am-kpi-locations');
    if (kpiLocations) kpiLocations.textContent = totalLocations.toLocaleString();

    const kpiHours = document.getElementById('am-kpi-hours');
    if (kpiHours) {
        const wholeH = Math.floor(totalHours);
        const mins = Math.round((totalHours - wholeH) * 60);
        kpiHours.textContent = `${wholeH}h ${mins}m`;
    }

    const kpiRate = document.getElementById('am-kpi-rate');
    if (kpiRate) {
        const rate = totalHours > 0 ? (totalLocations / totalHours).toFixed(1) : '0.0';
        kpiRate.textContent = rate;
    }

    // Render Specialist Cards
    const cardsContainer = document.getElementById('am-specialist-cards');
    if (cardsContainer) {
        cardsContainer.innerHTML = Object.entries(specialistStats).map(([name, s]) => {
            const avgRate = s.hours > 0 ? (s.locations / s.hours).toFixed(1) : '0';
            return `
                <div class="ws-subcard p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#123036] text-xs">
                    <div class="font-bold text-slate-800 dark:text-white truncate">${escapeHtml(name)}</div>
                    <div class="mt-2 grid grid-cols-2 gap-1 text-[11px] text-slate-500 dark:text-slate-400">
                        <div>Locations: <strong class="text-blue-600 dark:text-cyan-400 font-mono">${s.locations}</strong></div>
                        <div>Hours: <strong class="text-slate-700 dark:text-slate-200 font-mono">${s.hours.toFixed(1)}h</strong></div>
                        <div>Merged: <strong class="text-emerald-600 dark:text-emerald-400 font-mono">${s.merged}</strong></div>
                        <div>Rate: <strong class="text-amber-600 dark:text-amber-400 font-mono">${avgRate}/h</strong></div>
                    </div>
                </div>
            `;
        }).join('');
    }

    // Render Table rows
    const tbody = document.getElementById('am-table-tbody');
    if (tbody) {
        if (filtered.length === 0) {
            tbody.innerHTML = '<tr><td colspan="9" class="p-6 text-center text-slate-400 text-xs">No Account Merging records match your filters.</td></tr>';
            return;
        }
        tbody.innerHTML = filtered.map(r => `
            <tr class="hover:bg-slate-50 dark:hover:bg-slate-800/60 transition text-xs border-b border-slate-100 dark:border-slate-800">
                <td class="px-4 py-2.5 font-mono text-[11px] font-bold text-indigo-600 dark:text-indigo-400">${escapeHtml(r.monitoring_id || '-')}</td>
                <td class="px-4 py-2.5 font-semibold text-slate-900 dark:text-slate-100">${escapeHtml(r.qa || '-')}</td>
                <td class="px-4 py-2.5 font-mono text-[10px] text-slate-400">${escapeHtml(r.email || '-')}</td>
                <td class="px-4 py-2.5 text-slate-600 dark:text-slate-300">${escapeHtml(r.date || '-')}</td>
                <td class="px-4 py-2.5 text-slate-500 font-mono text-[10px]">${escapeHtml(r.time_started || '-')} – ${escapeHtml(r.time_ended || '-')}</td>
                <td class="px-4 py-2.5 text-right font-mono font-bold text-slate-800 dark:text-slate-200">${Number(r.hours || 0).toFixed(2)}h</td>
                <td class="px-4 py-2.5 text-slate-700 dark:text-slate-300 max-w-xs truncate" title="${escapeHtml(r.locations_checked || '')}">${escapeHtml(r.locations_checked || '-')}</td>
                <td class="px-4 py-2.5 text-right font-mono font-bold text-blue-600 dark:text-cyan-400">${Number(r.locations_count || 0).toLocaleString()}</td>
                <td class="px-4 py-2.5 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400">${Number(r.merged_accounts || 0).toLocaleString()}</td>
            </tr>
        `).join('');
    }
}

/**
 * Export Account Merging Data to Excel (.xlsx)
 */
function exportAccountMergingExcel() {
    const data = getAccountMergingData();
    if (!data || data.length === 0) {
        showNotification('No Account Merging data available to export.', 'error');
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
        'Locations Checked': r.locations_checked || '',
        '# Locations Checked': Number(r.locations_count) || 0,
        '# Merged Accounts': Number(r.merged_accounts) || 0,
        'Modified By': r.modified_by || ''
    }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, 'Account Merging QA');
    const filename = `1Life_Account_Merging_Report_${new Date().toISOString().slice(0, 10)}.xlsx`;
    gasDownloadExcel(wb, fileName);
    showNotification(`Downloaded ${filename}`, 'success');
}

/**
 * Export Account Merging Data to PDF (.pdf)
 */
function exportAccountMergingPDF() {
    if (typeof exportModulePDF === 'function') {
        exportModulePDF('account_merging');
    } else {
        showNotification('Exporting PDF...', 'info');
        window.print();
    }
}

// Attach to window
window.renderAccountMergingDashboard = renderAccountMergingDashboard;
window.exportAccountMergingExcel = exportAccountMergingExcel;
window.exportAccountMergingPDF = exportAccountMergingPDF;
