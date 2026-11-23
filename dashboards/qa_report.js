/**
 * ============================================================================
 * QA REPORTS — QA SPECIALIST PERFORMANCE SCORECARD & DETAILED VISUALS
 * dashboards/qa_report.js
 * 
 * Implements the 7 required vertical bar charts, tables beneath each, 
 * the Master Logs table at the end, and full Excel & PDF exports.
 * ============================================================================
 */

// Global Chart.js instances registry to allow clean destroying/re-rendering
window.qaReportChartInstances = {};

/**
 * Normalizes QA names to standard directory names
 */
function normalizeQASpecialistName(raw) {
    if (!raw) return 'Unassigned QA';
    const s = String(raw).trim();
    const l = s.toLowerCase();
    if (l.includes('arabella')) return 'Arabella Morales';
    if (l.includes('janryl')) return 'Janryl Jay Canaway';
    if (l.includes('john michael') || l.includes('jofrancisco')) return 'John Michael Francisco';
    if (l.includes('julius')) return 'Julius Rod Dayag';
    if (l.includes('yesha')) return 'Yesha Nicholai Lao';
    return s;
}

/**
 * Safely destroys an existing chart instance before re-creating
 */
function destroyChartInstance(chartId) {
    if (window.qaReportChartInstances[chartId]) {
        try {
            window.qaReportChartInstances[chartId].destroy();
        } catch (e) {
            console.warn(`Error destroying chart ${chartId}:`, e);
        }
        delete window.qaReportChartInstances[chartId];
    }
}

/**
 * Primary Entry Point: Renders all 7 requested vertical bar charts,
 * their corresponding data tables, and the Master Log table.
 */
function renderQASpecialistReportCharts() {
    if (typeof buildQATasksDataset === 'function' && (!window.qaTasksData || window.qaTasksData.length === 0)) {
        buildQATasksDataset();
    }

    const allTasks = window.qaTasksData || [];
    const sheetData = typeof getQASheetData === 'function' ? getQASheetData() : (window.QA_MONITORING_DATA || {});

    // Filter controls in QA Specialist Tab
    const selectedQA = document.getElementById('qa-report-filter-specialist')?.value || 'ALL';
    const dateRange = document.getElementById('qa-trend-range-select')?.value || 'all';

    // Apply QA and Date filters to dataset
    const filteredTasks = allTasks.filter(t => {
        if (selectedQA !== 'ALL' && t.specialist !== selectedQA) return false;
        // Date filtering
        if (dateRange !== 'all') {
            const today = new Date().toISOString().slice(0, 10);
            const taskDate = (t.date || '').slice(0, 10);
            if (dateRange === 'today' && taskDate !== today) return false;
        }
        return true;
    });

    // 1. Chart 1: Total QA Tasked Logged (Overall Chart)
    renderChartTotalQATasksLogged(filteredTasks);

    // 2. Chart 2: RTH Compliance (Waybill Validation)
    renderChartRTHComplianceWaybill(sheetData, selectedQA);

    // 3. Chart 3: QA Assigned Tickets (SMS / Call / Others)
    renderChartQAAssignedTickets(sheetData, selectedQA);

    // 4. Chart 4: Account Merging (Merged vs Locations Checked)
    renderChartAccountMerging(sheetData, selectedQA);

    // 5. Chart 5: IT Schedule Monitoring (Linked vs Checked)
    renderChartITScheduleMonitoring(sheetData, selectedQA);

    // 6. Chart 6: Other Task (Times Logged vs Hours)
    renderChartOtherTasks(filteredTasks, selectedQA);

    // 7. Chart 7: RTH Compliance (Dispatch QA)
    renderChartRTHComplianceDispatch(sheetData, selectedQA);

    // 8. Master Logs Table at the End
    renderMasterLogsTable(filteredTasks);
}

/**
 * ----------------------------------------------------------------------------
 * CHART 1: TOTAL QA TASKS LOGGED (OVERALL CHART)
 * Vertical Bar Chart: Tasks Logged, Tickets Checked, Hours, and Pacing
 * Table Beneath: Reading what's in the chart
 * ----------------------------------------------------------------------------
 */
function renderChartTotalQATasksLogged(tasks) {
    const stats = {};
    const qaList = ['Arabella Morales', 'Janryl Jay Canaway', 'John Michael Francisco', 'Julius Rod Dayag', 'Yesha Nicholai Lao'];
    qaList.forEach(q => stats[q] = { name: q, tasks: 0, tickets: 0, hours: 0 });

    tasks.forEach(t => {
        const name = normalizeQASpecialistName(t.specialist);
        if (!stats[name]) stats[name] = { name, tasks: 0, tickets: 0, hours: 0 };
        stats[name].tasks += 1;
        stats[name].tickets += Number(t.items) || 0;
        stats[name].hours += Number(t.hours) || 0;
    });

    const specialists = Object.values(stats).filter(s => s.tasks > 0 || qaList.includes(s.name));
    const labels = specialists.map(s => s.name.split(' ')[0]);
    const tasksData = specialists.map(s => s.tasks);
    const ticketsData = specialists.map(s => s.tickets);
    const hoursData = specialists.map(s => +s.hours.toFixed(1));
    const pacingData = specialists.map(s => s.hours > 0 ? +(s.tickets / s.hours).toFixed(1) : 0);

    // Vertical Bar Chart
    const canvas = document.getElementById('chart-total-qa-tasks-logged');
    if (canvas) {
        destroyChartInstance('chart-total-qa-tasks-logged');
        const ctx = canvas.getContext('2d');
        window.qaReportChartInstances['chart-total-qa-tasks-logged'] = new Chart(ctx, {
            type: 'bar',
            data: {
                labels,
                datasets: [
                    { label: 'Tasks Logged', data: tasksData, backgroundColor: '#0284c7', borderRadius: 6 },
                    { label: 'Tickets/Items Checked', data: ticketsData, backgroundColor: '#00b4d8', borderRadius: 6 },
                    { label: 'Total Hours Logged', data: hoursData, backgroundColor: '#0d9488', borderRadius: 6 },
                    { label: 'Pacing (Items/Hr)', data: pacingData, backgroundColor: '#f59e0b', borderRadius: 6 }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'top', labels: { boxWidth: 12, font: { size: 11, family: 'Plus Jakarta Sans' } } },
                    tooltip: { mode: 'index', intersect: false }
                },
                scales: {
                    x: { grid: { display: false } },
                    y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.05)' } }
                }
            }
        });
    }

    // Table Beneath
    const tbody = document.getElementById('table-total-qa-tasks-tbody');
    if (tbody) {
        tbody.innerHTML = specialists.map(s => {
            const pacing = s.hours > 0 ? (s.tickets / s.hours).toFixed(1) : '0.0';
            return `
                <tr class="hover:bg-slate-50 dark:hover:bg-slate-800/60 border-b border-slate-100 dark:border-slate-800 text-xs">
                    <td class="px-4 py-2.5 font-bold text-slate-900 dark:text-white">${escapeHtml(s.name)}</td>
                    <td class="px-4 py-2.5 text-right font-mono font-bold text-blue-600 dark:text-cyan-400">${s.tasks.toLocaleString()}</td>
                    <td class="px-4 py-2.5 text-right font-mono font-bold text-teal-600 dark:text-teal-300">${s.tickets.toLocaleString()}</td>
                    <td class="px-4 py-2.5 text-right font-mono text-slate-700 dark:text-slate-300">${s.hours.toFixed(1)}h</td>
                    <td class="px-4 py-2.5 text-right font-mono font-extrabold text-amber-600 dark:text-amber-400">${pacing} / hr</td>
                </tr>
            `;
        }).join('');
    }
}

/**
 * ----------------------------------------------------------------------------
 * CHART 2: RTH COMPLIANCE (WAYBILL VALIDATION)
 * Vertical Bar Chart: Waybills Validated, Hours Logged, Target Quota (20%)
 * Table Beneath: Validated, Hours, Target Quota %, Quota Status, Pacing
 * ----------------------------------------------------------------------------
 */
function renderChartRTHComplianceWaybill(sheetData, selectedQA) {
    const pharmacy = sheetData.pharmacy || [];
    const dailyLog = sheetData.daily_waybill_log || [];

    const stats = {};
    const qaList = ['Arabella Morales', 'Janryl Jay Canaway', 'John Michael Francisco', 'Julius Rod Dayag', 'Yesha Nicholai Lao'];
    qaList.forEach(q => stats[q] = { name: q, validated: 0, hours: 0, targetQuota: 166 });

    pharmacy.forEach(r => {
        const name = normalizeQASpecialistName(r.qa);
        if (selectedQA !== 'ALL' && name !== selectedQA) return;
        if (!stats[name]) stats[name] = { name, validated: 0, hours: 0, targetQuota: 166 };
        stats[name].validated += Number(r.validated_count) || 0;
        stats[name].hours += Number(r.hours) || 1.0;
    });

    const specialists = Object.values(stats).filter(s => s.validated > 0 || (selectedQA === 'ALL' && qaList.includes(s.name)));
    const labels = specialists.map(s => s.name.split(' ')[0]);
    const validatedData = specialists.map(s => s.validated);
    const hoursData = specialists.map(s => +s.hours.toFixed(1));
    const quotaData = specialists.map(s => s.targetQuota);

    // Vertical Bar Chart
    const canvas = document.getElementById('chart-rth-compliance-waybill');
    if (canvas) {
        destroyChartInstance('chart-rth-compliance-waybill');
        const ctx = canvas.getContext('2d');
        window.qaReportChartInstances['chart-rth-compliance-waybill'] = new Chart(ctx, {
            type: 'bar',
            data: {
                labels,
                datasets: [
                    { label: 'Waybills Validated', data: validatedData, backgroundColor: '#00b4d8', borderRadius: 6 },
                    { label: 'Target Quota (20% Req)', data: quotaData, backgroundColor: '#e2e8f0', borderColor: '#0284c7', borderWidth: 2, borderRadius: 6 },
                    { label: 'Hours Doing Task', data: hoursData, backgroundColor: '#0d9488', borderRadius: 6 }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'top', labels: { boxWidth: 12, font: { size: 11, family: 'Plus Jakarta Sans' } } }
                },
                scales: {
                    x: { grid: { display: false } },
                    y: { beginAtZero: true }
                }
            }
        });
    }

    // Table Beneath
    const tbody = document.getElementById('table-rth-compliance-waybill-tbody');
    if (tbody) {
        tbody.innerHTML = specialists.map(s => {
            const pacing = s.hours > 0 ? (s.validated / s.hours).toFixed(1) : '0.0';
            const quotaMet = s.validated >= s.targetQuota;
            const pctAchieved = s.targetQuota > 0 ? ((s.validated / s.targetQuota) * 100).toFixed(0) : '100';
            return `
                <tr class="hover:bg-slate-50 dark:hover:bg-slate-800/60 border-b border-slate-100 dark:border-slate-800 text-xs">
                    <td class="px-4 py-2.5 font-bold text-slate-900 dark:text-white">${escapeHtml(s.name)}</td>
                    <td class="px-4 py-2.5 text-right font-mono font-bold text-teal-600 dark:text-cyan-400">${s.validated.toLocaleString()}</td>
                    <td class="px-4 py-2.5 text-right font-mono text-slate-700 dark:text-slate-300">${s.hours.toFixed(1)}h</td>
                    <td class="px-4 py-2.5 text-center font-mono text-slate-500">20% (${s.targetQuota})</td>
                    <td class="px-4 py-2.5 text-center">
                        <span class="px-2 py-0.5 rounded-full text-[10px] font-bold ${quotaMet ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}">
                            ${pctAchieved}% (${quotaMet ? 'Quota Met' : 'In Progress'})
                        </span>
                    </td>
                    <td class="px-4 py-2.5 text-right font-mono font-bold text-blue-600 dark:text-cyan-300">${pacing} waybills/hr</td>
                </tr>
            `;
        }).join('');
    }
}

/**
 * ----------------------------------------------------------------------------
 * CHART 3: QA ASSIGNED TICKETS (SMS / CALL / OTHERS)
 * Vertical Bar Chart: SMS, Call, Others, and Hours
 * Table Beneath: Breakdown + Hours spent checking tickets
 * ----------------------------------------------------------------------------
 */
function renderChartQAAssignedTickets(sheetData, selectedQA) {
    const outputQA = sheetData.output_qa || [];

    const stats = {};
    const qaList = ['Arabella Morales', 'Janryl Jay Canaway', 'John Michael Francisco', 'Julius Rod Dayag', 'Yesha Nicholai Lao'];
    qaList.forEach(q => stats[q] = { name: q, sms: 0, call: 0, others: 0, total: 0, hours: 0 });

    outputQA.forEach(r => {
        const name = normalizeQASpecialistName(r.qa_checker || r.qa);
        if (selectedQA !== 'ALL' && name !== selectedQA) return;
        if (!stats[name]) stats[name] = { name, sms: 0, call: 0, others: 0, total: 0, hours: 0 };

        const text = `${r.report_name || ''} ${r.ticket_no || ''} ${r.remarks || ''}`.toLowerCase();
        if (text.includes('sms') || text.includes('text') || text.includes('otp')) {
            stats[name].sms += 1;
        } else if (text.includes('call') || text.includes('phone') || text.includes('voice')) {
            stats[name].call += 1;
        } else {
            stats[name].others += 1;
        }
        stats[name].total += 1;
        stats[name].hours += Number(r.hours) || 0.5;
    });

    const specialists = Object.values(stats).filter(s => s.total > 0 || (selectedQA === 'ALL' && qaList.includes(s.name)));
    const labels = specialists.map(s => s.name.split(' ')[0]);
    const smsData = specialists.map(s => s.sms);
    const callData = specialists.map(s => s.call);
    const othersData = specialists.map(s => s.others);
    const hoursData = specialists.map(s => +s.hours.toFixed(1));

    // Vertical Stacked Bar Chart
    const canvas = document.getElementById('chart-qa-assigned-tickets');
    if (canvas) {
        destroyChartInstance('chart-qa-assigned-tickets');
        const ctx = canvas.getContext('2d');
        window.qaReportChartInstances['chart-qa-assigned-tickets'] = new Chart(ctx, {
            type: 'bar',
            data: {
                labels,
                datasets: [
                    { label: 'SMS Tickets', data: smsData, backgroundColor: '#0284c7', borderRadius: 4 },
                    { label: 'Call Tickets', data: callData, backgroundColor: '#0d9488', borderRadius: 4 },
                    { label: 'Other Tickets', data: othersData, backgroundColor: '#64748b', borderRadius: 4 },
                    { label: 'Hours Spent', data: hoursData, backgroundColor: '#f59e0b', borderRadius: 4 }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { position: 'top', labels: { boxWidth: 12, font: { size: 11, family: 'Plus Jakarta Sans' } } } },
                scales: { x: { grid: { display: false } }, y: { beginAtZero: true } }
            }
        });
    }

    // Table Beneath
    const tbody = document.getElementById('table-qa-assigned-tickets-tbody');
    if (tbody) {
        tbody.innerHTML = specialists.map(s => {
            const pacing = s.hours > 0 ? (s.total / s.hours).toFixed(1) : '0.0';
            return `
                <tr class="hover:bg-slate-50 dark:hover:bg-slate-800/60 border-b border-slate-100 dark:border-slate-800 text-xs">
                    <td class="px-4 py-2.5 font-bold text-slate-900 dark:text-white">${escapeHtml(s.name)}</td>
                    <td class="px-4 py-2.5 text-right font-mono font-bold text-sky-600 dark:text-sky-400">${s.sms}</td>
                    <td class="px-4 py-2.5 text-right font-mono font-bold text-teal-600 dark:text-teal-400">${s.call}</td>
                    <td class="px-4 py-2.5 text-right font-mono text-slate-500">${s.others}</td>
                    <td class="px-4 py-2.5 text-right font-mono font-bold text-blue-600 dark:text-cyan-400">${s.total}</td>
                    <td class="px-4 py-2.5 text-right font-mono text-slate-700 dark:text-slate-300">${s.hours.toFixed(1)}h</td>
                    <td class="px-4 py-2.5 text-right font-mono font-bold text-amber-600 dark:text-amber-400">${pacing} / hr</td>
                </tr>
            `;
        }).join('');
    }
}

/**
 * ----------------------------------------------------------------------------
 * CHART 4: ACCOUNT MERGING
 * Vertical Bar Chart: Accounts Merged vs Run Locations Checked
 * Table Beneath: Hours spent, locations checked, merged accounts, pacing
 * ----------------------------------------------------------------------------
 */
function renderChartAccountMerging(sheetData, selectedQA) {
    const merging = sheetData.account_merging || [];

    const stats = {};
    const qaList = ['Arabella Morales', 'Janryl Jay Canaway', 'John Michael Francisco', 'Julius Rod Dayag', 'Yesha Nicholai Lao'];
    qaList.forEach(q => stats[q] = { name: q, merged: 0, locations: 0, hours: 0 });

    merging.forEach(r => {
        const name = normalizeQASpecialistName(r.qa);
        if (selectedQA !== 'ALL' && name !== selectedQA) return;
        if (!stats[name]) stats[name] = { name, merged: 0, locations: 0, hours: 0 };
        stats[name].merged += Number(r.merged_accounts) || 0;
        stats[name].locations += Number(r.locations_count) || 0;
        stats[name].hours += Number(r.hours) || 1.0;
    });

    const specialists = Object.values(stats).filter(s => s.locations > 0 || (selectedQA === 'ALL' && qaList.includes(s.name)));
    const labels = specialists.map(s => s.name.split(' ')[0]);
    const mergedData = specialists.map(s => s.merged);
    const locationsData = specialists.map(s => s.locations);
    const hoursData = specialists.map(s => +s.hours.toFixed(1));

    // Vertical Bar Chart
    const canvas = document.getElementById('chart-account-merging-vertical');
    if (canvas) {
        destroyChartInstance('chart-account-merging-vertical');
        const ctx = canvas.getContext('2d');
        window.qaReportChartInstances['chart-account-merging-vertical'] = new Chart(ctx, {
            type: 'bar',
            data: {
                labels,
                datasets: [
                    { label: 'Accounts Merged', data: mergedData, backgroundColor: '#0d9488', borderRadius: 6 },
                    { label: 'Run Locations Checked', data: locationsData, backgroundColor: '#0284c7', borderRadius: 6 },
                    { label: 'Hours Spent', data: hoursData, backgroundColor: '#f59e0b', borderRadius: 6 }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { position: 'top', labels: { boxWidth: 12, font: { size: 11, family: 'Plus Jakarta Sans' } } } },
                scales: { x: { grid: { display: false } }, y: { beginAtZero: true } }
            }
        });
    }

    // Table Beneath
    const tbody = document.getElementById('table-account-merging-tbody');
    if (tbody) {
        tbody.innerHTML = specialists.map(s => {
            const locRate = s.hours > 0 ? (s.locations / s.hours).toFixed(1) : '0.0';
            return `
                <tr class="hover:bg-slate-50 dark:hover:bg-slate-800/60 border-b border-slate-100 dark:border-slate-800 text-xs">
                    <td class="px-4 py-2.5 font-bold text-slate-900 dark:text-white">${escapeHtml(s.name)}</td>
                    <td class="px-4 py-2.5 text-right font-mono font-bold text-teal-600 dark:text-teal-400">${s.merged.toLocaleString()}</td>
                    <td class="px-4 py-2.5 text-right font-mono font-bold text-blue-600 dark:text-cyan-400">${s.locations.toLocaleString()}</td>
                    <td class="px-4 py-2.5 text-right font-mono text-slate-700 dark:text-slate-300">${s.hours.toFixed(1)}h</td>
                    <td class="px-4 py-2.5 text-right font-mono font-bold text-amber-600 dark:text-amber-400">${locRate} loc/hr</td>
                </tr>
            `;
        }).join('');
    }
}

/**
 * ----------------------------------------------------------------------------
 * CHART 5: IT SCHEDULE MONITORING
 * Vertical Bar Chart: Run Locations Checked vs Runs Linked
 * Table Beneath: Locations Checked, Runs Linked, Linking %, Hours
 * ----------------------------------------------------------------------------
 */
function renderChartITScheduleMonitoring(sheetData, selectedQA) {
    const itsched = sheetData.it_schedule || [];

    const stats = {};
    const qaList = ['Arabella Morales', 'Janryl Jay Canaway', 'John Michael Francisco', 'Julius Rod Dayag', 'Yesha Nicholai Lao'];
    qaList.forEach(q => stats[q] = { name: q, checked: 0, linked: 0, hours: 0 });

    itsched.forEach(r => {
        const name = normalizeQASpecialistName(r.qa);
        if (selectedQA !== 'ALL' && name !== selectedQA) return;
        if (!stats[name]) stats[name] = { name, checked: 0, linked: 0, hours: 0 };
        stats[name].checked += Number(r.checked_count) || 0;
        stats[name].linked += Number(r.linked_count) || 0;
        stats[name].hours += Number(r.hours) || 0.8;
    });

    const specialists = Object.values(stats).filter(s => s.checked > 0 || (selectedQA === 'ALL' && qaList.includes(s.name)));
    const labels = specialists.map(s => s.name.split(' ')[0]);
    const checkedData = specialists.map(s => s.checked);
    const linkedData = specialists.map(s => s.linked);
    const hoursData = specialists.map(s => +s.hours.toFixed(1));

    // Vertical Bar Chart
    const canvas = document.getElementById('chart-it-schedule-vertical');
    if (canvas) {
        destroyChartInstance('chart-it-schedule-vertical');
        const ctx = canvas.getContext('2d');
        window.qaReportChartInstances['chart-it-schedule-vertical'] = new Chart(ctx, {
            type: 'bar',
            data: {
                labels,
                datasets: [
                    { label: 'Run Locations Checked', data: checkedData, backgroundColor: '#0284c7', borderRadius: 6 },
                    { label: 'Runs Linked', data: linkedData, backgroundColor: '#0d9488', borderRadius: 6 },
                    { label: 'Hours Spent', data: hoursData, backgroundColor: '#f59e0b', borderRadius: 6 }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { position: 'top', labels: { boxWidth: 12, font: { size: 11, family: 'Plus Jakarta Sans' } } } },
                scales: { x: { grid: { display: false } }, y: { beginAtZero: true } }
            }
        });
    }

    // Table Beneath
    const tbody = document.getElementById('table-it-schedule-tbody');
    if (tbody) {
        tbody.innerHTML = specialists.map(s => {
            const linkPct = s.checked > 0 ? ((s.linked / s.checked) * 100).toFixed(1) : '0.0';
            const rate = s.hours > 0 ? (s.checked / s.hours).toFixed(1) : '0.0';
            return `
                <tr class="hover:bg-slate-50 dark:hover:bg-slate-800/60 border-b border-slate-100 dark:border-slate-800 text-xs">
                    <td class="px-4 py-2.5 font-bold text-slate-900 dark:text-white">${escapeHtml(s.name)}</td>
                    <td class="px-4 py-2.5 text-right font-mono font-bold text-blue-600 dark:text-cyan-400">${s.checked.toLocaleString()}</td>
                    <td class="px-4 py-2.5 text-right font-mono font-bold text-teal-600 dark:text-teal-400">${s.linked.toLocaleString()}</td>
                    <td class="px-4 py-2.5 text-center font-mono font-semibold text-emerald-600 dark:text-emerald-400">${linkPct}%</td>
                    <td class="px-4 py-2.5 text-right font-mono text-slate-700 dark:text-slate-300">${s.hours.toFixed(1)}h</td>
                    <td class="px-4 py-2.5 text-right font-mono font-bold text-amber-600 dark:text-amber-400">${rate} loc/hr</td>
                </tr>
            `;
        }).join('');
    }
}

/**
 * ----------------------------------------------------------------------------
 * CHART 6: OTHER TASK
 * Vertical Bar Chart: Times QA logged in Other Tasks vs Hours
 * Table Beneath: Times Logged, Hours Spent, Description / Notes
 * ----------------------------------------------------------------------------
 */
function renderChartOtherTasks(tasks, selectedQA) {
    const knownCategories = ['Waybill / Pharmacy QA', 'Account Merging', 'IT Schedule Monitoring', 'Dispatch QA', 'Output QA'];
    const otherTasks = tasks.filter(t => !knownCategories.includes(t.category) || t.is_other);

    const stats = {};
    const qaList = ['Arabella Morales', 'Janryl Jay Canaway', 'John Michael Francisco', 'Julius Rod Dayag', 'Yesha Nicholai Lao'];
    qaList.forEach(q => stats[q] = { name: q, times: 0, hours: 0, notes: [] });

    otherTasks.forEach(t => {
        const name = normalizeQASpecialistName(t.specialist);
        if (selectedQA !== 'ALL' && name !== selectedQA) return;
        if (!stats[name]) stats[name] = { name, times: 0, hours: 0, notes: [] };
        stats[name].times += 1;
        stats[name].hours += Number(t.hours) || 0.5;
        if (t.description && !stats[name].notes.includes(t.description)) {
            stats[name].notes.push(t.description);
        }
    });

    const specialists = Object.values(stats);
    const labels = specialists.map(s => s.name.split(' ')[0]);
    const timesData = specialists.map(s => s.times);
    const hoursData = specialists.map(s => +s.hours.toFixed(1));

    // Vertical Bar Chart
    const canvas = document.getElementById('chart-other-tasks-vertical');
    if (canvas) {
        destroyChartInstance('chart-other-tasks-vertical');
        const ctx = canvas.getContext('2d');
        window.qaReportChartInstances['chart-other-tasks-vertical'] = new Chart(ctx, {
            type: 'bar',
            data: {
                labels,
                datasets: [
                    { label: 'Times Logged in Other Tasks', data: timesData, backgroundColor: '#0284c7', borderRadius: 6 },
                    { label: 'Hours Spent', data: hoursData, backgroundColor: '#f59e0b', borderRadius: 6 }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { position: 'top', labels: { boxWidth: 12, font: { size: 11, family: 'Plus Jakarta Sans' } } } },
                scales: { x: { grid: { display: false } }, y: { beginAtZero: true } }
            }
        });
    }

    // Table Beneath
    const tbody = document.getElementById('table-other-tasks-tbody');
    if (tbody) {
        tbody.innerHTML = specialists.map(s => {
            const notePreview = s.notes.slice(0, 2).join('; ') || 'Standard QA Support / Ad-hoc Sync';
            return `
                <tr class="hover:bg-slate-50 dark:hover:bg-slate-800/60 border-b border-slate-100 dark:border-slate-800 text-xs">
                    <td class="px-4 py-2.5 font-bold text-slate-900 dark:text-white">${escapeHtml(s.name)}</td>
                    <td class="px-4 py-2.5 text-right font-mono font-bold text-blue-600 dark:text-cyan-400">${s.times}</td>
                    <td class="px-4 py-2.5 text-right font-mono font-bold text-slate-700 dark:text-slate-300">${s.hours.toFixed(1)}h</td>
                    <td class="px-4 py-2.5 text-slate-600 dark:text-slate-300 max-w-sm truncate" title="${escapeHtml(s.notes.join('\n'))}">${escapeHtml(notePreview)}</td>
                </tr>
            `;
        }).join('');
    }
}

/**
 * ----------------------------------------------------------------------------
 * CHART 7: RTH COMPLIANCE (DISPATCH QA)
 * Vertical Bar Chart: Overrides Count vs Hours Spent
 * Table Beneath: Sessions, Overridden Count, Hours, Pacing
 * ----------------------------------------------------------------------------
 */
function renderChartRTHComplianceDispatch(sheetData, selectedQA) {
    const dispatch = sheetData.dispatch_qa || [];

    const stats = {};
    const qaList = ['Arabella Morales', 'Janryl Jay Canaway', 'John Michael Francisco', 'Julius Rod Dayag', 'Yesha Nicholai Lao'];
    qaList.forEach(q => stats[q] = { name: q, sessions: 0, overridden: 0, hours: 0 });

    dispatch.forEach(r => {
        const name = normalizeQASpecialistName(r.qa);
        if (selectedQA !== 'ALL' && name !== selectedQA) return;
        if (!stats[name]) stats[name] = { name, sessions: 0, overridden: 0, hours: 0 };
        stats[name].sessions += 1;
        stats[name].overridden += Number(r.overridden_count) || 0;
        stats[name].hours += Number(r.hours) || 1.0;
    });

    const specialists = Object.values(stats).filter(s => s.sessions > 0 || (selectedQA === 'ALL' && qaList.includes(s.name)));
    const labels = specialists.map(s => s.name.split(' ')[0]);
    const overriddenData = specialists.map(s => s.overridden);
    const hoursData = specialists.map(s => +s.hours.toFixed(1));

    // Vertical Bar Chart
    const canvas = document.getElementById('chart-rth-compliance-dispatch-vertical');
    if (canvas) {
        destroyChartInstance('chart-rth-compliance-dispatch-vertical');
        const ctx = canvas.getContext('2d');
        window.qaReportChartInstances['chart-rth-compliance-dispatch-vertical'] = new Chart(ctx, {
            type: 'bar',
            data: {
                labels,
                datasets: [
                    { label: 'Dispatch Overrides Count', data: overriddenData, backgroundColor: '#00b4d8', borderRadius: 6 },
                    { label: 'Hours Spent', data: hoursData, backgroundColor: '#f59e0b', borderRadius: 6 }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { position: 'top', labels: { boxWidth: 12, font: { size: 11, family: 'Plus Jakarta Sans' } } } },
                scales: { x: { grid: { display: false } }, y: { beginAtZero: true } }
            }
        });
    }

    // Table Beneath
    const tbody = document.getElementById('table-rth-compliance-dispatch-tbody');
    if (tbody) {
        tbody.innerHTML = specialists.map(s => {
            const pacing = s.hours > 0 ? (s.overridden / s.hours).toFixed(1) : '0.0';
            return `
                <tr class="hover:bg-slate-50 dark:hover:bg-slate-800/60 border-b border-slate-100 dark:border-slate-800 text-xs">
                    <td class="px-4 py-2.5 font-bold text-slate-900 dark:text-white">${escapeHtml(s.name)}</td>
                    <td class="px-4 py-2.5 text-right font-mono font-bold text-teal-600 dark:text-teal-400">${s.sessions}</td>
                    <td class="px-4 py-2.5 text-right font-mono font-bold text-blue-600 dark:text-cyan-400">${s.overridden.toLocaleString()}</td>
                    <td class="px-4 py-2.5 text-right font-mono text-slate-700 dark:text-slate-300">${s.hours.toFixed(1)}h</td>
                    <td class="px-4 py-2.5 text-right font-mono font-bold text-amber-600 dark:text-amber-400">${pacing} overrides/hr</td>
                </tr>
            `;
        }).join('');
    }
}

/**
 * ----------------------------------------------------------------------------
 * 8. MASTER / RAW LOGS TABLE AT THE END
 * Columns: Category | Monitoring ID | Q.A. | Date Entry | Time Started | Time Ended | Hours | Details
 * ----------------------------------------------------------------------------
 */
function renderMasterLogsTable(tasks) {
    const tbody = document.getElementById('table-master-qa-logs-tbody');
    if (!tbody) return;

    if (!tasks || tasks.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="p-6 text-center text-slate-400 text-xs">No task entries match your active filters.</td></tr>';
        return;
    }

    tbody.innerHTML = tasks.slice(0, 150).map(t => {
        // Extract Monitoring ID if present in description or generate identifier
        let monId = '-';
        if (t.description && t.description.includes(':')) {
            monId = t.description.split(':')[0].trim();
        } else if (t.category) {
            monId = t.category.slice(0, 4).toUpperCase();
        }

        const catColors = {
            'Waybill / Pharmacy QA': 'bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-cyan-300',
            'Account Merging': 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-300',
            'IT Schedule Monitoring': 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300',
            'Dispatch QA': 'bg-teal-100 text-teal-800 dark:bg-teal-950/60 dark:text-teal-300',
            'Output QA': 'bg-cyan-100 text-cyan-800 dark:bg-cyan-950/60 dark:text-cyan-300'
        };
        const catBadge = catColors[t.category] || 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200';

        return `
            <tr class="hover:bg-slate-50 dark:hover:bg-slate-800/60 border-b border-slate-100 dark:border-slate-800 text-xs">
                <td class="px-3 py-2.5">
                    <span class="px-2 py-0.5 rounded-full text-[10px] font-bold ${catBadge}">${escapeHtml(t.category)}</span>
                </td>
                <td class="px-3 py-2.5 font-mono text-[11px] font-bold text-slate-800 dark:text-slate-200">${escapeHtml(monId)}</td>
                <td class="px-3 py-2.5 font-semibold text-slate-900 dark:text-white">${escapeHtml(t.specialist)}</td>
                <td class="px-3 py-2.5 text-slate-600 dark:text-slate-300">${escapeHtml(t.date || '-')}</td>
                <td class="px-3 py-2.5 font-mono text-[11px] text-slate-500">${escapeHtml(t.time_started || '-')}</td>
                <td class="px-3 py-2.5 font-mono text-[11px] text-slate-500">${escapeHtml(t.time_ended || '-')}</td>
                <td class="px-3 py-2.5 text-right font-mono font-bold text-slate-800 dark:text-slate-200">${Number(t.hours || 0).toFixed(2)}h</td>
                <td class="px-3 py-2.5 text-slate-600 dark:text-slate-300 max-w-md truncate" title="${escapeHtml(t.description || '')}">
                    ${escapeHtml(t.description || '-')}
                </td>
            </tr>
        `;
    }).join('');
}

/**
 * Exports the Complete Comprehensive QA Specialist Report to Excel (.xlsx)
 */
function exportComprehensiveQAReportExcel() {
    if (typeof XLSX === 'undefined') {
        showNotification('SheetJS is loading. Please wait...', 'error');
        return;
    }

    const tasks = window.qaTasksData || [];
    const wb = XLSX.utils.book_new();

    // Sheet 1: Master Log Entries
    const rows = tasks.map(t => ({
        'Category': t.category || '',
        'Monitoring ID': (t.description || '').split(':')[0] || '',
        'QA Specialist': t.specialist || '',
        'Date': t.date || '',
        'Time Started': t.time_started || '',
        'Time Ended': t.time_ended || '',
        'Hours': Number(t.hours) || 0,
        'Items / Checked': Number(t.items) || 0,
        'Pacing': Number(t.iph) || 0,
        'Details': t.description || '',
        'Status': t.status || ''
    }));
    const ws1 = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws1, 'Master QA Task Logs');

    const filename = `1Life_Comprehensive_QA_Report_${new Date().toISOString().slice(0, 10)}.xlsx`;
    XLSX.writeFile(wb, filename);
    showNotification(`Downloaded ${filename}`, 'success');
}

/**
 * Exports the Comprehensive QA Specialist Report to PDF (.pdf)
 */
function exportComprehensiveQAReportPDF() {
    if (typeof exportModulePDF === 'function') {
        exportModulePDF('qa_reports');
    } else {
        window.print();
    }
}

// Expose functions globally on window
window.renderQASpecialistReportCharts = renderQASpecialistReportCharts;
window.exportComprehensiveQAReportExcel = exportComprehensiveQAReportExcel;
window.exportComprehensiveQAReportPDF = exportComprehensiveQAReportPDF;
