/**
 * Waybill QA & Dispatch Operational Dashboard - Application Logic
 * Professional Blue & Light Blue Theme
 */

// Live Google Sheet Configuration
const GOOGLE_SHEET_ID = "1l_WgHYJnoFJ4MrOpr6NtCwamwo-_cwdgoIb7tZ1Z-7A";
let lastSyncTimestamp = null;
let isSyncing = false;
let autoSyncInterval = null;

let allData = [];
let filteredData = [];

// Filter State
const filters = {
    date: 'ALL',
    dateField: 'initial_val_date', // Default: Filter by Validation Date (QA Initial)
    qa: 'ALL',
    dispatch: 'ALL',
    initialStatus: 'ALL',
    dispatchStatus: 'ALL',
    finalStatus: 'ALL',
    search: ''
};

// Pagination & Sorting State
let pagination = {
    page: 1,
    pageSize: 25,
    sortField: 'initial_val_date',
    sortAsc: false
};

// Chart instances for cleanup & redrawing
let charts = {};

// Multi-Date Selection State for Custom Report Builder
let crSelectedDates = new Set(['ALL']);

// Line Trend Chart States
const qaTrendState = {
    metric: 'total', // 'total' | 'initial' | 'final'
    grouping: 'day', // 'day' | 'week' | 'month'
    range: 'all'     // 'all' | 'today' | 'yesterday' | 'day_last_week' | 'this_week' | 'last_week' | 'this_month'
};

const dispTrendState = {
    metric: 'override', // 'override' | 'all'
    grouping: 'day',    // 'day' | 'week' | 'month'
    range: 'all'        // 'all' | 'today' | 'yesterday' | 'day_last_week' | 'this_week' | 'last_week' | 'this_month'
};

// Corporate Brand Palettes for Specialist Multi-Line Graphs
const QA_COLORS = {
    'Julius Rod Dayag': '#2563eb',       // Royal Blue
    'Yesha Nicholai Lao': '#0284c7',     // Sky Blue
    'Arabella Morales': '#059669',       // Emerald
    'Janryl Jay Canaway': '#7c3aed',     // Purple / Violet
    'John Michael Francisco': '#d97706'  // Amber
};

const DISPATCH_COLORS = {
    'Danica Faye Quintos': '#2563eb',    // Royal Blue
    'Daniel Madarable': '#6366f1',       // Indigo
    'Kim Novero': '#0d9488'              // Teal
};

const FALLBACK_PALETTE = [
    '#e11d48', '#0891b2', '#4f46e5', '#ca8a04', '#16a34a',
    '#9333ea', '#db2777', '#ea580c', '#0284c7', '#475569'
];

document.addEventListener('DOMContentLoaded', () => {
    initData();
});

function initData() {
    // 1. Immediately render cached records if available so page loads with zero delay
    if (window.WAYBILL_RECORDS && Array.isArray(window.WAYBILL_RECORDS) && window.WAYBILL_RECORDS.length > 0) {
        allData = window.WAYBILL_RECORDS;
        setupDashboard();
        updateSyncStatusUI("Showing cached data. Checking live sheet...", "pending");
    }

    // 2. Fetch live data directly from Google Sheets (works on any domain without server)
    syncGoogleSheetDirect(false);
}

function setupDashboard() {
    initFilterControls();
    initCustomReportBuilder();
    setupEventListeners();
    
    // Check URL search params or hash
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.has('date')) {
        filters.date = urlParams.get('date');
    }
    const initialTab = urlParams.get('tab') || window.location.hash.replace('#', '');
    if (initialTab && ['overview', 'qa-report', 'dispatch-report', 'waybills', 'progress-report', 'custom-report'].includes(initialTab)) {
        switchTab(initialTab);
    }

    if (urlParams.has('preset')) {
        applyCustomReportPreset(urlParams.get('preset'));
    }
    
    applyFilters();
}

function initFilterControls() {
    renderDatePills();

    // Populate QA dropdown
    const qaSelect = document.getElementById('filter-qa');
    if (qaSelect) {
        const qas = [...new Set([
            ...allData.map(r => r.initial_validated_by),
            ...allData.map(r => r.final_validated_by)
        ].filter(Boolean))].sort();
        
        qaSelect.innerHTML = '<option value="ALL">All QA Specialists</option>';
        qas.forEach(name => {
            qaSelect.innerHTML += `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`;
        });
    }

    // Populate Dispatch dropdown
    const dispSelect = document.getElementById('filter-dispatch');
    if (dispSelect) {
        const disps = [...new Set(allData.map(r => r.overridden_by).filter(Boolean))].sort();
        dispSelect.innerHTML = '<option value="ALL">All Dispatch Specialists</option>';
        disps.forEach(name => {
            dispSelect.innerHTML += `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`;
        });
    }

    // Sync date field dropdown
    const dateFieldSelect = document.getElementById('filter-date-field');
    if (dateFieldSelect) {
        dateFieldSelect.value = filters.dateField;
    }
}

function renderDatePills() {
    const uniqueDates = [...new Set(allData.map(r => r[filters.dateField]).filter(Boolean))].sort((a, b) => {
        const da = a.split('/').map(Number);
        const db = b.split('/').map(Number);
        return (da[0] * 100 + da[1]) - (db[0] * 100 + db[1]);
    });

    const datePillsContainer = document.getElementById('date-pills');
    if (!datePillsContainer) return;
    
    datePillsContainer.innerHTML = '';
    
    // "All Days" pill
    const allBtn = document.createElement('button');
    const isAllActive = filters.date === 'ALL';
    allBtn.className = `date-pill px-3 py-1.5 text-xs font-semibold rounded-lg transition-all duration-150 border ${
        isAllActive ? 'bg-blue-600 text-white border-blue-600 shadow-sm' : 'bg-white text-slate-700 border-slate-200 hover:border-sky-300 hover:bg-sky-50'
    }`;
    allBtn.textContent = 'All Days';
    allBtn.dataset.date = 'ALL';
    allBtn.onclick = () => selectDate('ALL');
    datePillsContainer.appendChild(allBtn);

    const todayStr = '10/13/2026';

    uniqueDates.forEach(d => {
        const rowsForDate = allData.filter(r => r[filters.dateField] === d);
        const count = rowsForDate.length;
        const relatedWbDates = [...new Set(rowsForDate.map(r => r.date).filter(Boolean))];
        const isSelected = filters.date === d;

        const btn = document.createElement('button');
        btn.className = `date-pill px-2.5 py-1.5 text-xs font-medium rounded-lg transition-all duration-150 border flex items-center gap-1.5 ${
            isSelected 
                ? 'bg-blue-600 text-white border-blue-600 shadow-sm font-semibold' 
                : 'bg-white text-slate-700 border-slate-200 hover:border-sky-300 hover:bg-sky-50'
        }`;

        let labelHtml = `<span>${d}</span>`;
        if (d === todayStr) {
            labelHtml += `<span class="text-[9px] px-1 py-0.2 rounded font-extrabold uppercase ${isSelected ? 'bg-white text-blue-700' : 'bg-emerald-500 text-white'}">Today</span>`;
        }
        labelHtml += `<span class="text-[10px] px-1.5 py-0.5 rounded-full font-bold ${isSelected ? 'bg-blue-700 text-blue-100' : 'bg-slate-100 text-slate-500'}">${count}</span>`;

        btn.innerHTML = labelHtml;
        btn.dataset.date = d;
        btn.title = filters.dateField === 'initial_val_date' 
            ? `Validation Date: ${d} (Actual Waybill Date: ${relatedWbDates.join(', ')}) • ${count} waybills`
            : `${d} • ${count} waybills`;
        btn.onclick = () => selectDate(d);
        datePillsContainer.appendChild(btn);
    });
}

function selectDate(dateVal) {
    filters.date = dateVal;
    renderDatePills();
    applyFilters();
}

function setupEventListeners() {
    // Dropdowns
    const dateSelect = document.getElementById('filter-date-select');
    if (dateSelect) {
        dateSelect.addEventListener('change', (e) => selectDate(e.target.value));
    }

    const dateFieldSelect = document.getElementById('filter-date-field');
    if (dateFieldSelect) {
        dateFieldSelect.addEventListener('change', (e) => {
            filters.dateField = e.target.value;
            filters.date = 'ALL'; // Reset selected day when dimension changes
            renderDatePills();
            applyFilters();
        });
    }

    const qaSelect = document.getElementById('filter-qa');
    if (qaSelect) {
        qaSelect.addEventListener('change', (e) => {
            filters.qa = e.target.value;
            applyFilters();
        });
    }

    const dispSelect = document.getElementById('filter-dispatch');
    if (dispSelect) {
        dispSelect.addEventListener('change', (e) => {
            filters.dispatch = e.target.value;
            applyFilters();
        });
    }

    const initStatSelect = document.getElementById('filter-initial-status');
    if (initStatSelect) {
        initStatSelect.addEventListener('change', (e) => {
            filters.initialStatus = e.target.value;
            applyFilters();
        });
    }

    const dispStatSelect = document.getElementById('filter-dispatch-status');
    if (dispStatSelect) {
        dispStatSelect.addEventListener('change', (e) => {
            filters.dispatchStatus = e.target.value;
            applyFilters();
        });
    }

    const finalStatSelect = document.getElementById('filter-final-status');
    if (finalStatSelect) {
        finalStatSelect.addEventListener('change', (e) => {
            filters.finalStatus = e.target.value;
            applyFilters();
        });
    }

    // Search Box
    const searchInput = document.getElementById('table-search');
    if (searchInput) {
        let debounceTimer;
        searchInput.addEventListener('input', (e) => {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                filters.search = e.target.value.trim().toLowerCase();
                pagination.page = 1;
                applyFilters();
            }, 250);
        });
    }

    // Reset button
    const resetBtn = document.getElementById('btn-reset-filters');
    if (resetBtn) {
        resetBtn.addEventListener('click', resetAllFilters);
    }

    // Tab Navigation
    document.querySelectorAll('.nav-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            const targetTab = tab.dataset.tab;
            switchTab(targetTab);
        });
    });

    // Pagination items per page
    const pageSizeSelect = document.getElementById('page-size-select');
    if (pageSizeSelect) {
        pageSizeSelect.addEventListener('change', (e) => {
            pagination.pageSize = parseInt(e.target.value, 10);
            pagination.page = 1;
            renderWaybillTable();
        });
    }

    // File Upload Handler
    const fileInput = document.getElementById('file-upload-input');
    if (fileInput) {
        fileInput.addEventListener('change', handleFileUpload);
    }
}

function resetAllFilters() {
    filters.date = 'ALL';
    filters.dateField = 'date';
    filters.qa = 'ALL';
    filters.dispatch = 'ALL';
    filters.initialStatus = 'ALL';
    filters.dispatchStatus = 'ALL';
    filters.finalStatus = 'ALL';
    filters.search = '';

    const searchInput = document.getElementById('table-search');
    if (searchInput) searchInput.value = '';

    const qaSelect = document.getElementById('filter-qa');
    if (qaSelect) qaSelect.value = 'ALL';

    const dispSelect = document.getElementById('filter-dispatch');
    if (dispSelect) dispSelect.value = 'ALL';

    const initStatSelect = document.getElementById('filter-initial-status');
    if (initStatSelect) initStatSelect.value = 'ALL';

    const dispStatSelect = document.getElementById('filter-dispatch-status');
    if (dispStatSelect) dispStatSelect.value = 'ALL';

    const finalStatSelect = document.getElementById('filter-final-status');
    if (finalStatSelect) finalStatSelect.value = 'ALL';

    const dateFieldSelect = document.getElementById('filter-date-field');
    if (dateFieldSelect) dateFieldSelect.value = 'date';

    selectDate('ALL');
}

function switchTab(tabId) {
    if (window.history && window.history.replaceState) {
        window.history.replaceState(null, null, `#${tabId}`);
    }

    document.querySelectorAll('.nav-tab').forEach(btn => {
        if (btn.dataset.tab === tabId) {
            btn.className = 'nav-tab flex items-center gap-2 py-3 px-4 border-b-2 font-medium text-sm border-blue-600 text-blue-600 bg-blue-50/50 rounded-t-lg';
        } else {
            btn.className = 'nav-tab flex items-center gap-2 py-3 px-4 border-b-2 font-medium text-sm border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300';
        }
    });

    document.querySelectorAll('.tab-panel').forEach(panel => {
        panel.classList.toggle('hidden', panel.id !== `tab-${tabId}`);
    });

    // Re-render charts or preview if tab opened
    if (tabId === 'overview') {
        renderOverviewCharts();
    } else if (tabId === 'qa-report') {
        renderQACharts();
        renderQATrendLineChart();
    } else if (tabId === 'dispatch-report') {
        renderDispatchCharts();
        renderDispatchTrendLineChart();
    } else if (tabId === 'custom-report') {
        onCustomReportConfigChange();
    }
}

function applyFilters() {
    filteredData = allData.filter(r => {
        // Date Filter
        if (filters.date !== 'ALL') {
            const targetDate = r[filters.dateField];
            if (targetDate !== filters.date) return false;
        }

        // QA Filter (checks if person acted as initial or final QA)
        if (filters.qa !== 'ALL') {
            if (r.initial_validated_by !== filters.qa && r.final_validated_by !== filters.qa) {
                return false;
            }
        }

        // Dispatch Filter
        if (filters.dispatch !== 'ALL') {
            if (r.overridden_by !== filters.dispatch) {
                return false;
            }
        }

        // Initial Status Filter
        if (filters.initialStatus !== 'ALL') {
            if (r.qa_initial_status !== filters.initialStatus) return false;
        }

        // Dispatch Status Filter
        if (filters.dispatchStatus !== 'ALL') {
            if (r.dispatch_status !== filters.dispatchStatus) return false;
        }

        // Final Status Filter
        if (filters.finalStatus !== 'ALL') {
            if (filters.finalStatus === 'Pending') {
                if (r.final_val_status === 'Valid' || r.final_val_status === 'Invalid') return false;
            } else {
                if (r.final_val_status !== filters.finalStatus) return false;
            }
        }

        // Global search
        if (filters.search) {
            const q = filters.search;
            const match = 
                (r.waybill_no && r.waybill_no.toLowerCase().includes(q)) ||
                (r.rider && r.rider.toLowerCase().includes(q)) ||
                (r.initial_validated_by && r.initial_validated_by.toLowerCase().includes(q)) ||
                (r.final_validated_by && r.final_validated_by.toLowerCase().includes(q)) ||
                (r.overridden_by && r.overridden_by.toLowerCase().includes(q)) ||
                (r.qa_initial_remarks && r.qa_initial_remarks.toLowerCase().includes(q)) ||
                (r.final_qa_remarks && r.final_qa_remarks.toLowerCase().includes(q));
            if (!match) return false;
        }

        return true;
    });

    updateKpiCards();
    updateFilterBadge();
    renderOverviewCharts();
    renderQAReportTable();
    renderDispatchReportTable();
    renderWaybillTable();
    renderExecutiveSummaryView();
}

function updateFilterBadge() {
    let activeCount = 0;
    if (filters.date !== 'ALL') activeCount++;
    if (filters.qa !== 'ALL') activeCount++;
    if (filters.dispatch !== 'ALL') activeCount++;
    if (filters.initialStatus !== 'ALL') activeCount++;
    if (filters.dispatchStatus !== 'ALL') activeCount++;
    if (filters.finalStatus !== 'ALL') activeCount++;
    if (filters.search) activeCount++;

    const badge = document.getElementById('active-filters-count');
    if (badge) {
        if (activeCount > 0) {
            badge.textContent = `${activeCount} Active`;
            badge.classList.remove('hidden');
        } else {
            badge.classList.add('hidden');
        }
    }

    const filterContextText = document.getElementById('filter-context-text');
    if (filterContextText) {
        let text = '';
        if (filters.date === 'ALL') {
            text = 'Showing All Dates';
        } else {
            const isValDate = filters.dateField === 'initial_val_date';
            const relatedWbDates = [...new Set(filteredData.map(r => r.date).filter(Boolean))];
            if (isValDate) {
                text = `Filtered by Validation Date: ${filters.date}`;
                if (relatedWbDates.length > 0) {
                    text += ` (Actual Waybill Date: ${relatedWbDates.join(', ')})`;
                }
            } else {
                text = `Filtered by Waybill Date: ${filters.date}`;
            }
        }
        if (filters.qa !== 'ALL') text += ` • QA: ${filters.qa}`;
        if (filters.dispatch !== 'ALL') text += ` • Dispatch: ${filters.dispatch}`;
        filterContextText.textContent = text;
    }
}

function updateKpiCards() {
    const total = filteredData.length;

    // Initial QA
    const initValid = filteredData.filter(r => r.qa_initial_status === 'Valid').length;
    const initInvalid = filteredData.filter(r => r.qa_initial_status === 'Invalid').length;
    const initPending = filteredData.filter(r => r.qa_initial_status === 'For Validation').length;
    const initTotalDone = initValid + initInvalid;
    const initValidPct = total > 0 ? ((initValid / total) * 100).toFixed(1) : 0;
    const initInvalidPct = total > 0 ? ((initInvalid / total) * 100).toFixed(1) : 0;
    const initPendingPct = total > 0 ? ((initPending / total) * 100).toFixed(1) : 0;

    // Dispatch
    const dispOverride = filteredData.filter(r => r.dispatch_status === 'Override Done').length;
    const dispPending = filteredData.filter(r => r.dispatch_status === 'Pending').length;
    const dispNoAction = filteredData.filter(r => r.dispatch_status === 'No Action').length;
    const dispResolutionRate = initInvalid > 0 ? ((dispOverride / initInvalid) * 100).toFixed(1) : 0;

    // Final QA
    const finalValid = filteredData.filter(r => r.final_val_status === 'Valid').length;
    const finalInvalid = filteredData.filter(r => r.final_val_status === 'Invalid').length;
    const finalTotal = finalValid + finalInvalid;
    const finalValidRate = finalTotal > 0 ? ((finalValid / finalTotal) * 100).toFixed(1) : 0;

    // DOM Updates
    setText('kpi-total-waybills', total.toLocaleString());
    
    let subText = 'Total waybills logged across all dates';
    if (filters.date !== 'ALL') {
        const relatedWbDates = [...new Set(filteredData.map(r => r.date).filter(Boolean))];
        if (filters.dateField === 'initial_val_date') {
            subText = `Validated on ${filters.date} (Waybill Date: ${relatedWbDates.join(', ') || 'N/A'})`;
        } else {
            subText = `Waybill Date: ${filters.date}`;
        }
    }
    setText('kpi-total-sub', subText);

    setText('kpi-init-total', initTotalDone.toLocaleString());
    setText('kpi-init-valid', `${initValid.toLocaleString()} (${initValidPct}%)`);
    setText('kpi-init-invalid', `${initInvalid.toLocaleString()} (${initInvalidPct}%)`);
    setText('kpi-init-pending', `${initPending.toLocaleString()} (${initPendingPct}%)`);
    setProgressBar('kpi-init-bar', total > 0 ? (initTotalDone / total) * 100 : 0);

    setText('kpi-disp-override', dispOverride.toLocaleString());
    setText('kpi-disp-rate', `${dispResolutionRate}% of invalid resolved`);
    setText('kpi-disp-pending', dispPending.toLocaleString());
    setText('kpi-disp-noaction', dispNoAction.toLocaleString());
    setProgressBar('kpi-disp-bar', initInvalid > 0 ? (dispOverride / initInvalid) * 100 : 0);

    setText('kpi-final-total', finalTotal.toLocaleString());
    setText('kpi-final-valid', `${finalValid.toLocaleString()} (${finalValidRate}%)`);
    setText('kpi-final-invalid', finalInvalid.toLocaleString());
    setText('kpi-final-pipeline', (total - finalTotal).toLocaleString());
    setProgressBar('kpi-final-bar', total > 0 ? (finalTotal / total) * 100 : 0);

    // Funnel numbers
    setText('funnel-step1-count', total.toLocaleString());
    setText('funnel-step2-count', initTotalDone.toLocaleString());
    setText('funnel-step2-pct', `${total > 0 ? ((initTotalDone / total) * 100).toFixed(1) : 0}% Processed`);
    setText('funnel-step3-count', initInvalid.toLocaleString());
    setText('funnel-step3-pct', `${initInvalidPct}% Re-routed`);
    setText('funnel-step4-count', dispOverride.toLocaleString());
    setText('funnel-step4-pct', `${dispResolutionRate}% Resolved`);
    setText('funnel-step5-count', finalTotal.toLocaleString());
    setText('funnel-step5-pct', `${finalValidRate}% Pass Rate`);
}

function setText(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
}

function setProgressBar(id, pct) {
    const el = document.getElementById(id);
    if (el) el.style.width = `${Math.min(100, Math.max(0, pct))}%`;
}

function renderOverviewCharts() {
    // 1. Daily Volume Trend Chart
    const ctxTrend = document.getElementById('chart-daily-trend')?.getContext('2d');
    if (ctxTrend) {
        if (charts.dailyTrend) charts.dailyTrend.destroy();

        // Group by validation date
        const dateKey = filters.dateField;
        const dateMap = {};
        const wbMap = {};

        allData.forEach(r => {
            const d = r[dateKey] || r.initial_val_date || r.date;
            if (!d) return;
            if (!dateMap[d]) {
                dateMap[d] = { total: 0, initValid: 0, dispOverride: 0, finalValid: 0 };
                wbMap[d] = new Set();
            }
            dateMap[d].total++;
            if (r.date) wbMap[d].add(r.date);
            if (r.qa_initial_status === 'Valid') dateMap[d].initValid++;
            if (r.dispatch_status === 'Override Done') dateMap[d].dispOverride++;
            if (r.final_val_status === 'Valid') dateMap[d].finalValid++;
        });

        const sortedDates = Object.keys(dateMap).sort((a, b) => {
            const da = a.split('/').map(Number);
            const db = b.split('/').map(Number);
            return (da[0] * 100 + da[1]) - (db[0] * 100 + db[1]);
        });

        charts.dailyTrend = new Chart(ctxTrend, {
            type: 'bar',
            data: {
                labels: sortedDates,
                datasets: [
                    {
                        label: 'Total Waybills',
                        data: sortedDates.map(d => dateMap[d].total),
                        backgroundColor: 'rgba(14, 165, 233, 0.4)',
                        borderColor: '#0284c7',
                        borderWidth: 1.5,
                        borderRadius: 6
                    },
                    {
                        label: 'Initial Valid',
                        data: sortedDates.map(d => dateMap[d].initValid),
                        backgroundColor: 'rgba(37, 99, 235, 0.7)',
                        borderColor: '#1d4ed8',
                        borderWidth: 1.5,
                        borderRadius: 6
                    },
                    {
                        label: 'Dispatch Overrides',
                        data: sortedDates.map(d => dateMap[d].dispOverride),
                        backgroundColor: 'rgba(99, 102, 241, 0.8)',
                        borderColor: '#4f46e5',
                        borderWidth: 1.5,
                        borderRadius: 6
                    },
                    {
                        label: 'Final Validated',
                        data: sortedDates.map(d => dateMap[d].finalValid),
                        backgroundColor: 'rgba(16, 185, 129, 0.85)',
                        borderColor: '#059669',
                        borderWidth: 1.5,
                        borderRadius: 6
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'top',
                        labels: { font: { family: "'Inter', sans-serif", size: 11 } }
                    },
                    tooltip: {
                        padding: 10,
                        boxPadding: 4,
                        callbacks: {
                            title: (items) => {
                                const d = sortedDates[items[0].dataIndex];
                                const wbs = Array.from(wbMap[d] || []).join(', ');
                                return (filters.dateField === 'initial_val_date' ? `Validation Date: ${d}` : `Date: ${d}`) + 
                                       (wbs ? ` (Waybill Date: ${wbs})` : '');
                            }
                        }
                    }
                },
                scales: {
                    x: { grid: { display: false } },
                    y: { 
                        beginAtZero: true, 
                        grid: { color: 'rgba(226, 232, 240, 0.6)' }
                    }
                }
            }
        });
    }

    // 2. Initial QA Breakdown Doughnut
    const ctxInit = document.getElementById('chart-initial-breakdown')?.getContext('2d');
    if (ctxInit) {
        if (charts.initDoughnut) charts.initDoughnut.destroy();

        const v = filteredData.filter(r => r.qa_initial_status === 'Valid').length;
        const inv = filteredData.filter(r => r.qa_initial_status === 'Invalid').length;
        const pend = filteredData.filter(r => r.qa_initial_status === 'For Validation').length;

        charts.initDoughnut = new Chart(ctxInit, {
            type: 'doughnut',
            data: {
                labels: ['Valid', 'Invalid', 'For Validation'],
                datasets: [{
                    data: [v, inv, pend],
                    backgroundColor: ['#0284c7', '#ef4444', '#94a3b8'],
                    hoverOffset: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'bottom', labels: { font: { size: 11 } } }
                },
                cutout: '68%'
            }
        });
    }

    // 3. Dispatch Status Doughnut
    const ctxDisp = document.getElementById('chart-dispatch-breakdown')?.getContext('2d');
    if (ctxDisp) {
        if (charts.dispDoughnut) charts.dispDoughnut.destroy();

        const ovr = filteredData.filter(r => r.dispatch_status === 'Override Done').length;
        const pnd = filteredData.filter(r => r.dispatch_status === 'Pending').length;
        const na = filteredData.filter(r => r.dispatch_status === 'No Action').length;

        charts.dispDoughnut = new Chart(ctxDisp, {
            type: 'doughnut',
            data: {
                labels: ['Override Done', 'Pending', 'No Action'],
                datasets: [{
                    data: [ovr, pnd, na],
                    backgroundColor: ['#2563eb', '#f59e0b', '#cbd5e1'],
                    hoverOffset: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'bottom', labels: { font: { size: 11 } } }
                },
                cutout: '68%'
            }
        });
    }

    // 4. Common QA Defects / Remarks Bar Chart
    const ctxRemarks = document.getElementById('chart-qa-remarks')?.getContext('2d');
    if (ctxRemarks) {
        if (charts.remarksBar) charts.remarksBar.destroy();

        const remarkCounts = {};
        filteredData.forEach(r => {
            const rm = (r.qa_initial_remarks || '').trim();
            if (rm) {
                // Normalize casing
                const normalized = rm.charAt(0).toUpperCase() + rm.slice(1);
                remarkCounts[normalized] = (remarkCounts[normalized] || 0) + 1;
            }
        });

        const topRemarks = Object.entries(remarkCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 7);

        charts.remarksBar = new Chart(ctxRemarks, {
            type: 'bar',
            indexAxis: 'y',
            data: {
                labels: topRemarks.map(t => t[0]),
                datasets: [{
                    label: 'Occurrences',
                    data: topRemarks.map(t => t[1]),
                    backgroundColor: 'rgba(2, 132, 199, 0.75)',
                    borderColor: '#0284c7',
                    borderWidth: 1,
                    borderRadius: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false }
                },
                scales: {
                    x: { beginAtZero: true, grid: { color: 'rgba(226, 232, 240, 0.6)' } },
                    y: { grid: { display: false } }
                }
            }
        });
    }
}

// ==========================================
// QA TEAM REPORT (INITIAL & FINAL)
// ==========================================
function renderQAReportTable() {
    const tbody = document.getElementById('qa-report-tbody');
    if (!tbody) return;

    // Get list of all QA names
    const qaNames = [...new Set([
        ...allData.map(r => r.initial_validated_by),
        ...allData.map(r => r.final_validated_by)
    ].filter(Boolean))].sort();

    let html = '';
    let totInitHandled = 0;
    let totInitValid = 0;
    let totInitInvalid = 0;
    let totInitPending = 0;
    let totFinalHandled = 0;
    let totFinalValid = 0;
    let totFinalInvalid = 0;
    let totCombined = 0;

    qaNames.forEach(qa => {
        // If QA filter is active, only show matching
        if (filters.qa !== 'ALL' && filters.qa !== qa) return;

        // Data for this QA in current filtered set
        const initRows = filteredData.filter(r => r.initial_validated_by === qa);
        const finalRows = filteredData.filter(r => r.final_validated_by === qa);

        const initHandled = initRows.length;
        const initValid = initRows.filter(r => r.qa_initial_status === 'Valid').length;
        const initInvalid = initRows.filter(r => r.qa_initial_status === 'Invalid').length;
        const initPending = initRows.filter(r => r.qa_initial_status === 'For Validation').length;
        const initValidPct = initHandled > 0 ? ((initValid / initHandled) * 100).toFixed(1) : 0;

        const finalHandled = finalRows.length;
        const finalValid = finalRows.filter(r => r.final_val_status === 'Valid').length;
        const finalInvalid = finalRows.filter(r => r.final_val_status === 'Invalid').length;
        const finalValidPct = finalHandled > 0 ? ((finalValid / finalHandled) * 100).toFixed(1) : 0;

        const combined = initHandled + finalHandled;

        totInitHandled += initHandled;
        totInitValid += initValid;
        totInitInvalid += initInvalid;
        totInitPending += initPending;
        totFinalHandled += finalHandled;
        totFinalValid += finalValid;
        totFinalInvalid += finalInvalid;
        totCombined += combined;

        html += `
        <tr class="hover:bg-sky-50/50 transition-colors border-b border-slate-100">
            <td class="px-4 py-3 font-semibold text-slate-800 flex items-center gap-2">
                <div class="w-7 h-7 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-bold">
                    ${escapeHtml(qa.split(' ').map(n=>n[0]).join('').slice(0, 2))}
                </div>
                <span>${escapeHtml(qa)}</span>
            </td>
            <td class="px-4 py-3 text-right font-semibold text-slate-700">${initHandled.toLocaleString()}</td>
            <td class="px-4 py-3 text-right text-emerald-600 font-medium">${initValid.toLocaleString()}</td>
            <td class="px-4 py-3 text-right text-rose-600 font-medium">${initInvalid.toLocaleString()}</td>
            <td class="px-4 py-3 text-right text-slate-400">${initPending.toLocaleString()}</td>
            <td class="px-4 py-3 text-right">
                <span class="inline-block px-2 py-0.5 text-xs rounded-full bg-blue-50 text-blue-700 font-semibold border border-blue-200">
                    ${initValidPct}%
                </span>
            </td>
            <td class="px-4 py-3 text-right font-semibold text-slate-700 bg-sky-50/40">${finalHandled.toLocaleString()}</td>
            <td class="px-4 py-3 text-right text-emerald-600 font-medium bg-sky-50/40">${finalValid.toLocaleString()}</td>
            <td class="px-4 py-3 text-right text-rose-600 font-medium bg-sky-50/40">${finalInvalid.toLocaleString()}</td>
            <td class="px-4 py-3 text-right bg-sky-50/40">
                <span class="inline-block px-2 py-0.5 text-xs rounded-full ${finalHandled > 0 ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold' : 'text-slate-400'}">
                    ${finalHandled > 0 ? finalValidPct + '%' : '-'}
                </span>
            </td>
            <td class="px-4 py-3 text-right font-bold text-blue-700">${combined.toLocaleString()}</td>
            <td class="px-4 py-3 text-center">
                <button onclick="filterByQA('${escapeHtml(qa)}')" class="text-xs px-2.5 py-1 bg-white hover:bg-sky-100 text-sky-700 font-medium rounded border border-sky-200 transition">
                    View Records
                </button>
            </td>
        </tr>`;
    });

    tbody.innerHTML = html;

    // Totals row
    const tfoot = document.getElementById('qa-report-tfoot');
    if (tfoot) {
        const overallInitPct = totInitHandled > 0 ? ((totInitValid / totInitHandled) * 100).toFixed(1) : 0;
        const overallFinalPct = totFinalHandled > 0 ? ((totFinalValid / totFinalHandled) * 100).toFixed(1) : 0;
        tfoot.innerHTML = `
        <tr class="bg-blue-100/60 font-bold text-slate-800 border-t-2 border-blue-300">
            <td class="px-4 py-3">TOTAL</td>
            <td class="px-4 py-3 text-right">${totInitHandled.toLocaleString()}</td>
            <td class="px-4 py-3 text-right text-emerald-700">${totInitValid.toLocaleString()}</td>
            <td class="px-4 py-3 text-right text-rose-700">${totInitInvalid.toLocaleString()}</td>
            <td class="px-4 py-3 text-right text-slate-500">${totInitPending.toLocaleString()}</td>
            <td class="px-4 py-3 text-right text-blue-800">${overallInitPct}%</td>
            <td class="px-4 py-3 text-right bg-blue-100">${totFinalHandled.toLocaleString()}</td>
            <td class="px-4 py-3 text-right text-emerald-700 bg-blue-100">${totFinalValid.toLocaleString()}</td>
            <td class="px-4 py-3 text-right text-rose-700 bg-blue-100">${totFinalInvalid.toLocaleString()}</td>
            <td class="px-4 py-3 text-right text-blue-800 bg-blue-100">${overallFinalPct}%</td>
            <td class="px-4 py-3 text-right text-blue-900">${totCombined.toLocaleString()}</td>
            <td class="px-4 py-3 text-center">-</td>
        </tr>`;
    }

    renderQACharts();
}

function renderQACharts() {
    const ctxQA = document.getElementById('chart-qa-comparison')?.getContext('2d');
    if (!ctxQA) return;
    if (charts.qaComparison) charts.qaComparison.destroy();

    const qaNames = [...new Set([
        ...allData.map(r => r.initial_validated_by),
        ...allData.map(r => r.final_validated_by)
    ].filter(Boolean))].sort();

    const initData = qaNames.map(name => filteredData.filter(r => r.initial_validated_by === name).length);
    const finalData = qaNames.map(name => filteredData.filter(r => r.final_validated_by === name).length);

    charts.qaComparison = new Chart(ctxQA, {
        type: 'bar',
        data: {
            labels: qaNames.map(n => n.split(' ')[0] + ' ' + (n.split(' ')[1] ? n.split(' ')[1][0] + '.' : '')),
            datasets: [
                {
                    label: 'Initial Validations',
                    data: initData,
                    backgroundColor: 'rgba(37, 99, 235, 0.8)',
                    borderColor: '#1d4ed8',
                    borderWidth: 1,
                    borderRadius: 4
                },
                {
                    label: 'Final Validations',
                    data: finalData,
                    backgroundColor: 'rgba(2, 132, 199, 0.75)',
                    borderColor: '#0284c7',
                    borderWidth: 1,
                    borderRadius: 4
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'top' },
                tooltip: {
                    callbacks: {
                        title: (items) => qaNames[items[0].dataIndex]
                    }
                }
            },
            scales: {
                x: { grid: { display: false } },
                y: { beginAtZero: true, grid: { color: 'rgba(226, 232, 240, 0.6)' } }
            }
        }
    });

    renderQATrendLineChart();
}

// ==========================================
// QA SPECIALIST MULTI-LINE TREND ENGINE
// ==========================================

function setQATrendMetric(metric) {
    qaTrendState.metric = metric;
    
    // Update button states
    ['total', 'initial', 'final'].forEach(m => {
        const btn = document.getElementById(`btn-qa-metric-${m}`);
        if (!btn) return;
        if (m === metric) {
            btn.className = 'px-2.5 py-1 rounded-md text-xs font-semibold bg-white text-blue-700 shadow-xs transition';
        } else {
            btn.className = 'px-2.5 py-1 rounded-md text-xs font-medium text-slate-600 hover:text-slate-900 transition';
        }
    });

    renderQATrendLineChart();
}

function setQATrendGrouping(grouping) {
    qaTrendState.grouping = grouping;

    // Update button states
    ['day', 'week', 'month'].forEach(g => {
        const btn = document.getElementById(`btn-qa-group-${g}`);
        if (!btn) return;
        if (g === grouping) {
            btn.className = 'px-2.5 py-1 rounded-md text-xs font-semibold bg-white text-blue-700 shadow-xs transition';
        } else {
            btn.className = 'px-2.5 py-1 rounded-md text-xs font-medium text-slate-600 hover:text-slate-900 transition';
        }
    });

    renderQATrendLineChart();
}

function setQATrendRange(rangeVal) {
    qaTrendState.range = rangeVal;
    renderQATrendLineChart();
}

function parseDateStrToObj(str) {
    if (!str) return null;
    const parts = str.split('/');
    if (parts.length === 3) {
        return new Date(parseInt(parts[2], 10), parseInt(parts[0], 10) - 1, parseInt(parts[1], 10));
    }
    const d = new Date(str);
    return isNaN(d.getTime()) ? null : d;
}

function sortDateStrings(arr) {
    return arr.sort((a, b) => {
        const da = parseDateStrToObj(a);
        const db = parseDateStrToObj(b);
        if (!da || !db) return 0;
        return da.getTime() - db.getTime();
    });
}

function getIsoWeek(d) {
    const target = new Date(d.valueOf());
    const dayNr = (d.getDay() + 6) % 7;
    target.setDate(target.getDate() - dayNr + 3);
    const firstThursday = target.valueOf();
    target.setMonth(0, 1);
    if (target.getDay() !== 4) {
        target.setMonth(0, 1 + ((4 - target.getDay()) + 7) % 7);
    }
    const weekNo = 1 + Math.ceil((firstThursday - target) / 604800000);
    return { year: target.getFullYear(), week: weekNo };
}

function formatDateWithDay(d) {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return `${d.getMonth() + 1}/${d.getDate()} (${days[d.getDay()]})`;
}

function renderQATrendLineChart() {
    const ctx = document.getElementById('chart-qa-trend-line')?.getContext('2d');
    if (!ctx) return;
    if (charts.qaTrendLine) charts.qaTrendLine.destroy();

    // 1. Gather all QA names
    const qaNames = [...new Set([
        ...allData.map(r => r.initial_validated_by),
        ...allData.map(r => r.final_validated_by)
    ].filter(Boolean))].sort();

    if (qaNames.length === 0) return;

    // 2. Determine all distinct sorted validation dates in the dataset
    const allValDates = sortDateStrings([...new Set(allData.map(r => r.initial_val_date).filter(Boolean))]);
    if (allValDates.length === 0) return;

    const maxDateStr = allValDates[allValDates.length - 1];
    const maxDateObj = parseDateStrToObj(maxDateStr) || new Date();
    const secondLatestDateStr = allValDates.length > 1 ? allValDates[allValDates.length - 2] : maxDateStr;

    // Date 7 days prior to latest
    const sevenDaysAgo = new Date(maxDateObj.getTime() - 7 * 24 * 60 * 60 * 1000);
    const targetDayLastWeekStr = `${sevenDaysAgo.getMonth() + 1}/${sevenDaysAgo.getDate()}/${sevenDaysAgo.getFullYear()}`;

    // 3. Filter records according to qaTrendState.range
    let trendPool = allData.filter(r => r.initial_val_date);
    const currentWeekInfo = getIsoWeek(maxDateObj);

    if (qaTrendState.range === 'today') {
        trendPool = trendPool.filter(r => r.initial_val_date === maxDateStr);
    } else if (qaTrendState.range === 'yesterday') {
        trendPool = trendPool.filter(r => r.initial_val_date === secondLatestDateStr);
    } else if (qaTrendState.range === 'day_last_week') {
        const found = trendPool.filter(r => r.initial_val_date === targetDayLastWeekStr);
        trendPool = found.length > 0 ? found : trendPool.filter(r => {
            const d = parseDateStrToObj(r.initial_val_date);
            return d && d <= sevenDaysAgo;
        });
    } else if (qaTrendState.range === 'this_week') {
        trendPool = trendPool.filter(r => {
            const d = parseDateStrToObj(r.initial_val_date);
            if (!d) return false;
            const w = getIsoWeek(d);
            return w.year === currentWeekInfo.year && w.week === currentWeekInfo.week;
        });
    } else if (qaTrendState.range === 'last_week') {
        trendPool = trendPool.filter(r => {
            const d = parseDateStrToObj(r.initial_val_date);
            if (!d) return false;
            const w = getIsoWeek(d);
            return w.year === currentWeekInfo.year && w.week === currentWeekInfo.week - 1;
        });
    } else if (qaTrendState.range === 'this_month') {
        trendPool = trendPool.filter(r => {
            const d = parseDateStrToObj(r.initial_val_date);
            if (!d) return false;
            return d.getFullYear() === maxDateObj.getFullYear() && d.getMonth() === maxDateObj.getMonth();
        });
    }

    // 4. Build time buckets according to qaTrendState.grouping
    const bucketMap = new Map(); // key -> { label, records: [] }

    if (qaTrendState.grouping === 'day') {
        const poolDates = sortDateStrings([...new Set(trendPool.map(r => r.initial_val_date))]);
        poolDates.forEach(dStr => {
            const dObj = parseDateStrToObj(dStr);
            const label = dObj ? formatDateWithDay(dObj) : dStr;
            bucketMap.set(dStr, { label, records: [] });
        });
        trendPool.forEach(r => {
            if (bucketMap.has(r.initial_val_date)) {
                bucketMap.get(r.initial_val_date).records.push(r);
            }
        });
    } else if (qaTrendState.grouping === 'week') {
        // Collect and sort all weeks
        const weekEntries = [];
        trendPool.forEach(r => {
            const d = parseDateStrToObj(r.initial_val_date);
            if (!d) return;
            const w = getIsoWeek(d);
            const key = `${w.year}-W${String(w.week).padStart(2, '0')}`;
            if (!bucketMap.has(key)) {
                bucketMap.set(key, { label: `Week ${w.week} (${w.year})`, records: [], sortVal: w.year * 100 + w.week });
            }
            bucketMap.get(key).records.push(r);
        });
    } else if (qaTrendState.grouping === 'month') {
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        trendPool.forEach(r => {
            const d = parseDateStrToObj(r.initial_val_date);
            if (!d) return;
            const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            if (!bucketMap.has(key)) {
                bucketMap.set(key, { label: `${monthNames[d.getMonth()]} ${d.getFullYear()}`, records: [], sortVal: key });
            }
            bucketMap.get(key).records.push(r);
        });
    }

    // Sort buckets chronologically
    let bucketKeys = Array.from(bucketMap.keys());
    if (qaTrendState.grouping === 'day') {
        bucketKeys = sortDateStrings(bucketKeys);
    } else {
        bucketKeys.sort();
    }
    const xLabels = bucketKeys.map(k => bucketMap.get(k).label);

    // 5. Build line dataset for each QA specialist
    const datasets = qaNames.map((qa, idx) => {
        const counts = bucketKeys.map(k => {
            const rows = bucketMap.get(k).records;
            if (qaTrendState.metric === 'initial') {
                return rows.filter(r => r.initial_validated_by === qa).length;
            } else if (qaTrendState.metric === 'final') {
                return rows.filter(r => r.final_validated_by === qa).length;
            } else {
                // total handled (initial or final)
                return rows.filter(r => r.initial_validated_by === qa || r.final_validated_by === qa).length;
            }
        });

        const color = QA_COLORS[qa] || FALLBACK_PALETTE[idx % FALLBACK_PALETTE.length];

        return {
            label: qa,
            data: counts,
            borderColor: color,
            backgroundColor: color + '18',
            pointBackgroundColor: color,
            pointBorderColor: '#ffffff',
            pointBorderWidth: 1.5,
            pointRadius: 4.5,
            pointHoverRadius: 7,
            borderWidth: 2.5,
            tension: 0.35,
            fill: false
        };
    });

    // 6. Update Summary Note
    const summaryNote = document.getElementById('qa-trend-summary-note');
    if (summaryNote) {
        const metricName = qaTrendState.metric === 'initial' ? 'Initial QA' : (qaTrendState.metric === 'final' ? 'Final QA' : 'Total Handled');
        const rangeNames = {
            all: 'All Time',
            today: `Today (${maxDateStr})`,
            yesterday: `Yesterday (${secondLatestDateStr})`,
            day_last_week: 'Same Day Last Week',
            this_week: 'This Week',
            last_week: 'Last Week',
            this_month: 'This Month'
        };
        const rangeText = rangeNames[qaTrendState.range] || 'Filtered';
        summaryNote.textContent = `${metricName} • ${rangeText} • ${trendPool.length.toLocaleString()} total actions mapped`;
    }

    // 7. Render Chart.js Multi-Line Instance
    charts.qaTrendLine = new Chart(ctx, {
        type: 'line',
        data: {
            labels: xLabels.length > 0 ? xLabels : ['No Data'],
            datasets: datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                mode: 'index',
                intersect: false
            },
            plugins: {
                legend: {
                    display: true,
                    position: 'top',
                    labels: {
                        usePointStyle: true,
                        boxWidth: 8,
                        padding: 15,
                        font: { size: 11, weight: '600' }
                    }
                },
                tooltip: {
                    backgroundColor: 'rgba(15, 23, 42, 0.92)',
                    titleFont: { size: 12, weight: 'bold' },
                    bodyFont: { size: 11 },
                    padding: 10,
                    boxPadding: 4,
                    callbacks: {
                        footer: (items) => {
                            const sum = items.reduce((acc, item) => acc + (item.parsed.y || 0), 0);
                            return `Total Period Validations: ${sum.toLocaleString()}`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: { display: false },
                    ticks: { font: { size: 11 } }
                },
                y: {
                    beginAtZero: true,
                    grid: { color: 'rgba(226, 232, 240, 0.6)' },
                    ticks: {
                        precision: 0,
                        font: { size: 11 }
                    }
                }
            }
        }
    });
}

function filterByQA(qaName) {
    filters.qa = qaName;
    const qaSelect = document.getElementById('filter-qa');
    if (qaSelect) qaSelect.value = qaName;
    applyFilters();
    switchTab('waybills');
}

// ==========================================
// DISPATCH TEAM REPORT
// ==========================================
function renderDispatchReportTable() {
    const tbody = document.getElementById('dispatch-report-tbody');
    if (!tbody) return;

    const dispNames = [...new Set(allData.map(r => r.overridden_by).filter(Boolean))].sort();

    let html = '';
    let totActions = 0;
    let totOverrideDone = 0;
    let totPending = 0;
    let totNoAction = 0;

    const totalOverridesInFilter = filteredData.filter(r => r.dispatch_status === 'Override Done').length;

    dispNames.forEach(name => {
        if (filters.dispatch !== 'ALL' && filters.dispatch !== name) return;

        const dispRows = filteredData.filter(r => r.overridden_by === name);
        const actions = dispRows.length;
        const done = dispRows.filter(r => r.dispatch_status === 'Override Done').length;
        const pending = dispRows.filter(r => r.dispatch_status === 'Pending').length;
        const noAction = dispRows.filter(r => r.dispatch_status === 'No Action').length;
        const resRate = actions > 0 ? ((done / actions) * 100).toFixed(1) : 0;
        const sharePct = totalOverridesInFilter > 0 ? ((done / totalOverridesInFilter) * 100).toFixed(1) : 0;

        totActions += actions;
        totOverrideDone += done;
        totPending += pending;
        totNoAction += noAction;

        html += `
        <tr class="hover:bg-sky-50/50 transition-colors border-b border-slate-100">
            <td class="px-4 py-3 font-semibold text-slate-800 flex items-center gap-2">
                <div class="w-7 h-7 rounded-full bg-sky-100 text-sky-700 flex items-center justify-center text-xs font-bold">
                    ${escapeHtml(name.split(' ').map(n=>n[0]).join('').slice(0, 2))}
                </div>
                <span>${escapeHtml(name)}</span>
            </td>
            <td class="px-4 py-3 text-right font-semibold text-slate-700">${actions.toLocaleString()}</td>
            <td class="px-4 py-3 text-right text-blue-700 font-bold">${done.toLocaleString()}</td>
            <td class="px-4 py-3 text-right text-amber-600 font-medium">${pending.toLocaleString()}</td>
            <td class="px-4 py-3 text-right text-slate-400">${noAction.toLocaleString()}</td>
            <td class="px-4 py-3 text-right">
                <span class="inline-block px-2 py-0.5 text-xs rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold">
                    ${resRate}%
                </span>
            </td>
            <td class="px-4 py-3 text-right">
                <span class="inline-block px-2 py-0.5 text-xs rounded-full bg-sky-50 text-sky-700 border border-sky-200 font-semibold">
                    ${sharePct}%
                </span>
            </td>
            <td class="px-4 py-3 text-center">
                <button onclick="filterByDispatch('${escapeHtml(name)}')" class="text-xs px-2.5 py-1 bg-white hover:bg-sky-100 text-sky-700 font-medium rounded border border-sky-200 transition">
                    View Records
                </button>
            </td>
        </tr>`;
    });

    tbody.innerHTML = html;

    const tfoot = document.getElementById('dispatch-report-tfoot');
    if (tfoot) {
        const overallResRate = totActions > 0 ? ((totOverrideDone / totActions) * 100).toFixed(1) : 0;
        tfoot.innerHTML = `
        <tr class="bg-blue-100/60 font-bold text-slate-800 border-t-2 border-blue-300">
            <td class="px-4 py-3">TOTAL</td>
            <td class="px-4 py-3 text-right">${totActions.toLocaleString()}</td>
            <td class="px-4 py-3 text-right text-blue-800">${totOverrideDone.toLocaleString()}</td>
            <td class="px-4 py-3 text-right text-amber-700">${totPending.toLocaleString()}</td>
            <td class="px-4 py-3 text-right text-slate-500">${totNoAction.toLocaleString()}</td>
            <td class="px-4 py-3 text-right text-blue-800">${overallResRate}%</td>
            <td class="px-4 py-3 text-right text-sky-800">100.0%</td>
            <td class="px-4 py-3 text-center">-</td>
        </tr>`;
    }

    renderDispatchCharts();
}

function renderDispatchCharts() {
    const ctxDisp = document.getElementById('chart-dispatch-comparison')?.getContext('2d');
    if (!ctxDisp) return;
    if (charts.dispatchComparison) charts.dispatchComparison.destroy();

    const dispNames = [...new Set(allData.map(r => r.overridden_by).filter(Boolean))].sort();
    const doneData = dispNames.map(name => filteredData.filter(r => r.overridden_by === name && r.dispatch_status === 'Override Done').length);
    const pendingData = dispNames.map(name => filteredData.filter(r => r.overridden_by === name && r.dispatch_status === 'Pending').length);

    charts.dispatchComparison = new Chart(ctxDisp, {
        type: 'bar',
        data: {
            labels: dispNames,
            datasets: [
                {
                    label: 'Override Done',
                    data: doneData,
                    backgroundColor: '#2563eb',
                    borderRadius: 4
                },
                {
                    label: 'Pending',
                    data: pendingData,
                    backgroundColor: '#f59e0b',
                    borderRadius: 4
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'top' }
            },
            scales: {
                x: { grid: { display: false } },
                y: { beginAtZero: true, grid: { color: 'rgba(226, 232, 240, 0.6)' } }
            }
        }
    });

    renderDispatchTrendLineChart();
}

// ==========================================
// DISPATCH SPECIALIST MULTI-LINE TREND ENGINE
// ==========================================

function setDispTrendMetric(metric) {
    dispTrendState.metric = metric;
    
    // Update button states
    ['override', 'all'].forEach(m => {
        const btn = document.getElementById(`btn-disp-metric-${m}`);
        if (!btn) return;
        if (m === metric) {
            btn.className = 'px-2.5 py-1 rounded-md text-xs font-semibold bg-white text-sky-700 shadow-xs transition';
        } else {
            btn.className = 'px-2.5 py-1 rounded-md text-xs font-medium text-slate-600 hover:text-slate-900 transition';
        }
    });

    renderDispatchTrendLineChart();
}

function setDispTrendGrouping(grouping) {
    dispTrendState.grouping = grouping;

    // Update button states
    ['day', 'week', 'month'].forEach(g => {
        const btn = document.getElementById(`btn-disp-group-${g}`);
        if (!btn) return;
        if (g === grouping) {
            btn.className = 'px-2.5 py-1 rounded-md text-xs font-semibold bg-white text-sky-700 shadow-xs transition';
        } else {
            btn.className = 'px-2.5 py-1 rounded-md text-xs font-medium text-slate-600 hover:text-slate-900 transition';
        }
    });

    renderDispatchTrendLineChart();
}

function setDispTrendRange(rangeVal) {
    dispTrendState.range = rangeVal;
    renderDispatchTrendLineChart();
}

function renderDispatchTrendLineChart() {
    const ctx = document.getElementById('chart-dispatch-trend-line')?.getContext('2d');
    if (!ctx) return;
    if (charts.dispTrendLine) charts.dispTrendLine.destroy();

    // 1. Gather all Dispatch names
    const dispNames = [...new Set(allData.map(r => r.overridden_by).filter(Boolean))].sort();
    if (dispNames.length === 0) return;

    // 2. Determine all distinct sorted validation dates
    const allValDates = sortDateStrings([...new Set(allData.map(r => r.initial_val_date).filter(Boolean))]);
    if (allValDates.length === 0) return;

    const maxDateStr = allValDates[allValDates.length - 1];
    const maxDateObj = parseDateStrToObj(maxDateStr) || new Date();
    const secondLatestDateStr = allValDates.length > 1 ? allValDates[allValDates.length - 2] : maxDateStr;

    // Date 7 days prior to latest
    const sevenDaysAgo = new Date(maxDateObj.getTime() - 7 * 24 * 60 * 60 * 1000);
    const targetDayLastWeekStr = `${sevenDaysAgo.getMonth() + 1}/${sevenDaysAgo.getDate()}/${sevenDaysAgo.getFullYear()}`;

    // 3. Filter records according to dispTrendState.range
    let trendPool = allData.filter(r => r.initial_val_date);
    const currentWeekInfo = getIsoWeek(maxDateObj);

    if (dispTrendState.range === 'today') {
        trendPool = trendPool.filter(r => r.initial_val_date === maxDateStr);
    } else if (dispTrendState.range === 'yesterday') {
        trendPool = trendPool.filter(r => r.initial_val_date === secondLatestDateStr);
    } else if (dispTrendState.range === 'day_last_week') {
        const found = trendPool.filter(r => r.initial_val_date === targetDayLastWeekStr);
        trendPool = found.length > 0 ? found : trendPool.filter(r => {
            const d = parseDateStrToObj(r.initial_val_date);
            return d && d <= sevenDaysAgo;
        });
    } else if (dispTrendState.range === 'this_week') {
        trendPool = trendPool.filter(r => {
            const d = parseDateStrToObj(r.initial_val_date);
            if (!d) return false;
            const w = getIsoWeek(d);
            return w.year === currentWeekInfo.year && w.week === currentWeekInfo.week;
        });
    } else if (dispTrendState.range === 'last_week') {
        trendPool = trendPool.filter(r => {
            const d = parseDateStrToObj(r.initial_val_date);
            if (!d) return false;
            const w = getIsoWeek(d);
            return w.year === currentWeekInfo.year && w.week === currentWeekInfo.week - 1;
        });
    } else if (dispTrendState.range === 'this_month') {
        trendPool = trendPool.filter(r => {
            const d = parseDateStrToObj(r.initial_val_date);
            if (!d) return false;
            return d.getFullYear() === maxDateObj.getFullYear() && d.getMonth() === maxDateObj.getMonth();
        });
    }

    // 4. Build time buckets according to dispTrendState.grouping
    const bucketMap = new Map();

    if (dispTrendState.grouping === 'day') {
        const poolDates = sortDateStrings([...new Set(trendPool.map(r => r.initial_val_date))]);
        poolDates.forEach(dStr => {
            const dObj = parseDateStrToObj(dStr);
            const label = dObj ? formatDateWithDay(dObj) : dStr;
            bucketMap.set(dStr, { label, records: [] });
        });
        trendPool.forEach(r => {
            if (bucketMap.has(r.initial_val_date)) {
                bucketMap.get(r.initial_val_date).records.push(r);
            }
        });
    } else if (dispTrendState.grouping === 'week') {
        trendPool.forEach(r => {
            const d = parseDateStrToObj(r.initial_val_date);
            if (!d) return;
            const w = getIsoWeek(d);
            const key = `${w.year}-W${String(w.week).padStart(2, '0')}`;
            if (!bucketMap.has(key)) {
                bucketMap.set(key, { label: `Week ${w.week} (${w.year})`, records: [] });
            }
            bucketMap.get(key).records.push(r);
        });
    } else if (dispTrendState.grouping === 'month') {
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        trendPool.forEach(r => {
            const d = parseDateStrToObj(r.initial_val_date);
            if (!d) return;
            const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            if (!bucketMap.has(key)) {
                bucketMap.set(key, { label: `${monthNames[d.getMonth()]} ${d.getFullYear()}`, records: [] });
            }
            bucketMap.get(key).records.push(r);
        });
    }

    // Sort buckets chronologically
    let bucketKeys = Array.from(bucketMap.keys());
    if (dispTrendState.grouping === 'day') {
        bucketKeys = sortDateStrings(bucketKeys);
    } else {
        bucketKeys.sort();
    }
    const xLabels = bucketKeys.map(k => bucketMap.get(k).label);

    // 5. Build line dataset for each Dispatch specialist
    const datasets = dispNames.map((name, idx) => {
        const counts = bucketKeys.map(k => {
            const rows = bucketMap.get(k).records;
            if (dispTrendState.metric === 'override') {
                return rows.filter(r => r.overridden_by === name && r.dispatch_status === 'Override Done').length;
            } else {
                return rows.filter(r => r.overridden_by === name).length;
            }
        });

        const color = DISPATCH_COLORS[name] || FALLBACK_PALETTE[idx % FALLBACK_PALETTE.length];

        return {
            label: name,
            data: counts,
            borderColor: color,
            backgroundColor: color + '18',
            pointBackgroundColor: color,
            pointBorderColor: '#ffffff',
            pointBorderWidth: 1.5,
            pointRadius: 4.5,
            pointHoverRadius: 7,
            borderWidth: 2.5,
            tension: 0.35,
            fill: false
        };
    });

    // 6. Update Summary Note
    const summaryNote = document.getElementById('disp-trend-summary-note');
    if (summaryNote) {
        const metricName = dispTrendState.metric === 'override' ? 'Override Done' : 'All Actions';
        const rangeNames = {
            all: 'All Time',
            today: `Today (${maxDateStr})`,
            yesterday: `Yesterday (${secondLatestDateStr})`,
            day_last_week: 'Same Day Last Week',
            this_week: 'This Week',
            last_week: 'Last Week',
            this_month: 'This Month'
        };
        const rangeText = rangeNames[dispTrendState.range] || 'Filtered';
        const totalActions = datasets.reduce((sum, ds) => sum + ds.data.reduce((a, b) => a + b, 0), 0);
        summaryNote.textContent = `${metricName} • ${rangeText} • ${totalActions.toLocaleString()} override resolutions mapped`;
    }

    // 7. Render Chart.js Multi-Line Instance
    charts.dispTrendLine = new Chart(ctx, {
        type: 'line',
        data: {
            labels: xLabels.length > 0 ? xLabels : ['No Data'],
            datasets: datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                mode: 'index',
                intersect: false
            },
            plugins: {
                legend: {
                    display: true,
                    position: 'top',
                    labels: {
                        usePointStyle: true,
                        boxWidth: 8,
                        padding: 15,
                        font: { size: 11, weight: '600' }
                    }
                },
                tooltip: {
                    backgroundColor: 'rgba(15, 23, 42, 0.92)',
                    titleFont: { size: 12, weight: 'bold' },
                    bodyFont: { size: 11 },
                    padding: 10,
                    boxPadding: 4,
                    callbacks: {
                        footer: (items) => {
                            const sum = items.reduce((acc, item) => acc + (item.parsed.y || 0), 0);
                            return `Total Period Overrides: ${sum.toLocaleString()}`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: { display: false },
                    ticks: { font: { size: 11 } }
                },
                y: {
                    beginAtZero: true,
                    grid: { color: 'rgba(226, 232, 240, 0.6)' },
                    ticks: {
                        precision: 0,
                        font: { size: 11 }
                    }
                }
            }
        }
    });
}

function filterByDispatch(dispName) {
    filters.dispatch = dispName;
    const dispSelect = document.getElementById('filter-dispatch');
    if (dispSelect) dispSelect.value = dispName;
    applyFilters();
    switchTab('waybills');
}

// ==========================================
// WAYBILL DATA EXPLORER & PAGINATION
// ==========================================
function renderWaybillTable() {
    const tbody = document.getElementById('waybills-table-tbody');
    if (!tbody) return;

    // Sorting
    const sorted = [...filteredData].sort((a, b) => {
        let va = a[pagination.sortField] || '';
        let vb = b[pagination.sortField] || '';
        if (typeof va === 'string') va = va.toLowerCase();
        if (typeof vb === 'string') vb = vb.toLowerCase();
        if (va < vb) return pagination.sortAsc ? -1 : 1;
        if (va > vb) return pagination.sortAsc ? 1 : -1;
        return 0;
    });

    const totalRecords = sorted.length;
    const totalPages = Math.max(1, Math.ceil(totalRecords / pagination.pageSize));
    pagination.page = Math.min(pagination.page, totalPages);

    const startIndex = (pagination.page - 1) * pagination.pageSize;
    const pageRecords = sorted.slice(startIndex, startIndex + pagination.pageSize);

    let html = '';
    if (pageRecords.length === 0) {
        html = `
        <tr>
            <td colspan="10" class="px-6 py-12 text-center text-slate-400">
                <div class="flex flex-col items-center justify-center">
                    <svg class="w-10 h-10 mb-2 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                    <p class="text-sm font-medium">No waybill records match the current filters</p>
                    <button onclick="resetAllFilters()" class="mt-2 text-xs text-blue-600 hover:underline">Clear all filters</button>
                </div>
            </td>
        </tr>`;
    } else {
        pageRecords.forEach(r => {
            const initBadge = getStatusBadge(r.qa_initial_status);
            const dispBadge = getStatusBadge(r.dispatch_status);
            const finalBadge = getStatusBadge(r.final_val_status, true);

            html += `
            <tr class="hover:bg-sky-50/40 transition-colors border-b border-slate-100 text-xs cursor-pointer" onclick="openWaybillModal('${escapeHtml(r.waybill_no)}')">
                <td class="px-3 py-2.5 whitespace-nowrap">
                    <span class="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-100 text-slate-700 border border-slate-200" title="Actual Waybill Intake Date">
                        ${escapeHtml(r.date)}
                    </span>
                </td>
                <td class="px-3 py-2.5 whitespace-nowrap">
                    <span class="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-blue-50 text-blue-700 border border-blue-200" title="Initial QA Validation Date">
                        ${escapeHtml(r.initial_val_date || '-')}
                    </span>
                </td>
                <td class="px-3 py-2.5 font-bold text-blue-700 whitespace-nowrap font-mono hover:underline">
                    ${escapeHtml(r.waybill_no)}
                </td>
                <td class="px-3 py-2.5 text-slate-700 font-medium whitespace-nowrap max-w-[130px] truncate" title="${escapeHtml(r.rider)}">
                    ${escapeHtml(r.rider)}
                </td>
                <td class="px-3 py-2.5 whitespace-nowrap">${initBadge}</td>
                <td class="px-3 py-2.5 text-slate-600 whitespace-nowrap">${escapeHtml(r.initial_validated_by || '-')}</td>
                <td class="px-3 py-2.5 whitespace-nowrap">${dispBadge}</td>
                <td class="px-3 py-2.5 text-slate-600 whitespace-nowrap">${escapeHtml(r.overridden_by || '-')}</td>
                <td class="px-3 py-2.5 whitespace-nowrap">${finalBadge}</td>
                <td class="px-3 py-2.5 text-slate-600 whitespace-nowrap">${escapeHtml(r.final_validated_by || '-')}</td>
                <td class="px-3 py-2.5 text-slate-500 max-w-[160px] truncate" title="${escapeHtml(r.qa_initial_remarks || r.final_qa_remarks || '')}">
                    ${escapeHtml(r.qa_initial_remarks || r.final_qa_remarks || '-')}
                </td>
            </tr>`;
        });
    }

    tbody.innerHTML = html;

    // Update pagination controls
    setText('table-showing-start', totalRecords > 0 ? (startIndex + 1).toLocaleString() : '0');
    setText('table-showing-end', Math.min(startIndex + pagination.pageSize, totalRecords).toLocaleString());
    setText('table-total-records', totalRecords.toLocaleString());
    setText('table-current-page', `${pagination.page} of ${totalPages}`);

    const prevBtn = document.getElementById('table-btn-prev');
    const nextBtn = document.getElementById('table-btn-next');
    if (prevBtn) prevBtn.disabled = pagination.page <= 1;
    if (nextBtn) nextBtn.disabled = pagination.page >= totalPages;
}

function prevPage() {
    if (pagination.page > 1) {
        pagination.page--;
        renderWaybillTable();
    }
}

function nextPage() {
    const totalPages = Math.ceil(filteredData.length / pagination.pageSize);
    if (pagination.page < totalPages) {
        pagination.page++;
        renderWaybillTable();
    }
}

function sortTable(field) {
    if (pagination.sortField === field) {
        pagination.sortAsc = !pagination.sortAsc;
    } else {
        pagination.sortField = field;
        pagination.sortAsc = true;
    }
    renderWaybillTable();
}

function getStatusBadge(status, isFinal = false) {
    if (!status) {
        return `<span class="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-400">Pending</span>`;
    }
    if (status === 'Valid') {
        return `<span class="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">Valid</span>`;
    }
    if (status === 'Invalid') {
        return `<span class="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-rose-50 text-rose-700 border border-rose-200">Invalid</span>`;
    }
    if (status === 'For Validation') {
        return `<span class="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-amber-50 text-amber-700 border border-amber-200">For Validation</span>`;
    }
    if (status === 'Override Done') {
        return `<span class="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-blue-50 text-blue-700 border border-blue-200">Override Done</span>`;
    }
    if (status === 'Pending') {
        return `<span class="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-amber-50 text-amber-700 border border-amber-200">Pending</span>`;
    }
    if (status === 'No Action') {
        return `<span class="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-normal bg-slate-100 text-slate-500">No Action</span>`;
    }
    return `<span class="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-normal bg-slate-100 text-slate-600">${escapeHtml(status)}</span>`;
}

// ==========================================
// WAYBILL DETAIL MODAL
// ==========================================
function openWaybillModal(wbNo) {
    const item = allData.find(r => r.waybill_no === wbNo);
    if (!item) return;

    const modal = document.getElementById('waybill-modal');
    if (!modal) return;

    setText('modal-wb-no', item.waybill_no);
    setText('modal-rider', item.rider || 'Unassigned');
    setText('modal-date', item.date);

    // Initial QA
    setText('modal-init-status', item.qa_initial_status || 'Pending');
    setText('modal-init-date', item.initial_val_date || 'N/A');
    setText('modal-init-by', item.initial_validated_by || 'Unassigned');
    setText('modal-init-remarks', item.qa_initial_remarks || 'None');

    // Dispatch
    setText('modal-disp-status', item.dispatch_status || 'No Action');
    setText('modal-disp-date', item.dispatch_date || 'N/A');
    setText('modal-disp-by', item.overridden_by || 'None');
    setText('modal-old-mdc', item.old_mdc_creation || 'None');

    // Final QA
    setText('modal-final-status', item.final_val_status || 'Pending Final Review');
    setText('modal-final-date', item.final_val_date || 'N/A');
    setText('modal-final-by', item.final_validated_by || 'Unassigned');
    setText('modal-final-remarks', item.final_qa_remarks || 'None');

    // Pharma
    setText('modal-pharma-remarks', item.pharma_remarks || 'None');

    modal.classList.remove('hidden');
}

function closeWaybillModal() {
    const modal = document.getElementById('waybill-modal');
    if (modal) modal.classList.add('hidden');
}

// ==========================================
// EXECUTIVE SUMMARY & PROGRESS VIEW
// ==========================================
function renderExecutiveSummaryView() {
    const total = allData.length;
    const initValid = allData.filter(r => r.qa_initial_status === 'Valid').length;
    const initInvalid = allData.filter(r => r.qa_initial_status === 'Invalid').length;
    const initPending = allData.filter(r => r.qa_initial_status === 'For Validation').length;

    const dispOverride = allData.filter(r => r.dispatch_status === 'Override Done').length;
    const dispPending = allData.filter(r => r.dispatch_status === 'Pending').length;

    const finalValid = allData.filter(r => r.final_val_status === 'Valid').length;
    const finalInvalid = allData.filter(r => r.final_val_status === 'Invalid').length;
    const finalTotal = finalValid + finalInvalid;

    setText('rep-tot-waybills', total.toLocaleString());
    setText('rep-tot-init-eval', (initValid + initInvalid).toLocaleString());
    setText('rep-tot-init-valid', initValid.toLocaleString());
    setText('rep-tot-init-invalid', initInvalid.toLocaleString());
    setText('rep-tot-init-pend', initPending.toLocaleString());
    setText('rep-tot-disp-override', dispOverride.toLocaleString());
    setText('rep-tot-disp-pend', dispPending.toLocaleString());
    setText('rep-tot-final-eval', finalTotal.toLocaleString());
    setText('rep-tot-final-valid', finalValid.toLocaleString());
    setText('rep-tot-final-invalid', finalInvalid.toLocaleString());
}

// ==========================================
// EXCEL EXPORT (SHEETJS)
// ==========================================
function exportProgressReportExcel() {
    if (typeof XLSX === 'undefined') {
        showNotification("SheetJS library is still loading. Please try again in a moment.", "error");
        return;
    }

    const wb = XLSX.utils.book_new();

    // 1. Executive Summary Sheet
    const total = filteredData.length;
    const initValid = filteredData.filter(r => r.qa_initial_status === 'Valid').length;
    const initInvalid = filteredData.filter(r => r.qa_initial_status === 'Invalid').length;
    const initPending = filteredData.filter(r => r.qa_initial_status === 'For Validation').length;
    const dispOverride = filteredData.filter(r => r.dispatch_status === 'Override Done').length;
    const dispPending = filteredData.filter(r => r.dispatch_status === 'Pending').length;
    const finalValid = filteredData.filter(r => r.final_val_status === 'Valid').length;
    const finalInvalid = filteredData.filter(r => r.final_val_status === 'Invalid').length;
    const finalDone = finalValid + finalInvalid;

    const summaryData = [
        ["WAYBILL QA & DISPATCH PROGRESS REPORT"],
        ["Generated Date", new Date().toLocaleString()],
        ["Filter Applied", filters.date === 'ALL' ? 'All Dates' : `Day: ${filters.date}`],
        [],
        ["METRIC / STAGE", "COUNT", "PERCENTAGE", "DESCRIPTION"],
        ["Total Waybills Logged", total, "100.0%", "Total waybills matching active criteria"],
        ["Initial QA Evaluated", initValid + initInvalid, `${total > 0 ? (((initValid + initInvalid)/total)*100).toFixed(1) : 0}%`, "Total waybills checked in Initial QA"],
        ["  - Initial Valid", initValid, `${total > 0 ? ((initValid/total)*100).toFixed(1) : 0}%`, "Cleared first QA stage"],
        ["  - Initial Invalid", initInvalid, `${total > 0 ? ((initInvalid/total)*100).toFixed(1) : 0}%`, "Defects flagged, escalated to Dispatch"],
        ["  - Initial Pending (For Validation)", initPending, `${total > 0 ? ((initPending/total)*100).toFixed(1) : 0}%`, "Pending Initial QA evaluation"],
        ["Dispatch Invalid Review", initInvalid, "100.0%", "Invalid waybills subject to Dispatch override"],
        ["  - Dispatch Override Done", dispOverride, `${initInvalid > 0 ? ((dispOverride/initInvalid)*100).toFixed(1) : 0}%`, "Resolved and overridden by Dispatch"],
        ["  - Dispatch Review Pending", dispPending, `${initInvalid > 0 ? ((dispPending/initInvalid)*100).toFixed(1) : 0}%`, "Pending corrective action by Dispatch"],
        ["Final QA Evaluated", finalDone, `${total > 0 ? ((finalDone/total)*100).toFixed(1) : 0}%`, "Waybills reached Final QA"],
        ["  - Final Valid", finalValid, `${finalDone > 0 ? ((finalValid/finalDone)*100).toFixed(1) : 0}%`, "Approved in Final QA"],
        ["  - Final Invalid", finalInvalid, `${finalDone > 0 ? ((finalInvalid/finalDone)*100).toFixed(1) : 0}%`, "Rejected in Final QA"]
    ];
    const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
    XLSX.utils.book_append_sheet(wb, wsSummary, "Summary");

    // 2. Daily Validation Breakdown Sheet (Grouped by Validation Date)
    const dailyRows = [
        ["DAILY QA VALIDATION & WAYBILL BREAKDOWN"],
        [],
        ["Validation Date (QA)", "Actual Waybill Date", "Total Waybills", "Initial Valid", "Initial Invalid", "Initial Pending", "Initial Valid %", "Dispatch Override", "Final Valid", "Final Invalid", "Total Final Validated"]
    ];

    const valDateMap = {};
    filteredData.forEach(r => {
        const vd = r.initial_val_date || 'Pending';
        if (!valDateMap[vd]) {
            valDateMap[vd] = { total: 0, initValid: 0, initInvalid: 0, initPending: 0, dispOverride: 0, finalValid: 0, finalInvalid: 0, wbDates: new Set() };
        }
        const st = valDateMap[vd];
        st.total++;
        if (r.date) st.wbDates.add(r.date);
        if (r.qa_initial_status === 'Valid') st.initValid++;
        else if (r.qa_initial_status === 'Invalid') st.initInvalid++;
        else if (r.qa_initial_status === 'For Validation') st.initPending++;

        if (r.dispatch_status === 'Override Done') st.dispOverride++;

        if (r.final_val_status === 'Valid') st.finalValid++;
        else if (r.final_val_status === 'Invalid') st.finalInvalid++;
    });

    const sortedValDates = Object.keys(valDateMap).sort((a, b) => {
        if (a === 'Pending') return 1;
        if (b === 'Pending') return -1;
        const [m1, d1, y1] = a.split('/').map(Number);
        const [m2, d2, y2] = b.split('/').map(Number);
        return (y1 - y2) || (m1 - m2) || (d1 - d2);
    });

    sortedValDates.forEach(vd => {
        const st = valDateMap[vd];
        const wbDatesStr = Array.from(st.wbDates).sort().join(', ') || '-';
        const vPct = st.total > 0 ? `${((st.initValid / st.total) * 100).toFixed(1)}%` : '0%';
        dailyRows.push([
            vd, wbDatesStr, st.total, st.initValid, st.initInvalid, st.initPending, vPct,
            st.dispOverride, st.finalValid, st.finalInvalid, st.finalValid + st.finalInvalid
        ]);
    });

    const wsDaily = XLSX.utils.aoa_to_sheet(dailyRows);
    XLSX.utils.book_append_sheet(wb, wsDaily, "Daily Breakdown");

    // 3. QA Performance Sheet
    const qaHeaders = [
        ["QA Specialist", "Initial Handled", "Initial Valid", "Initial Invalid", "Initial Pending", "Initial Valid %", "Final Handled", "Final Valid", "Final Invalid", "Final Valid %", "Combined Validations"]
    ];
    const qas = [...new Set([
        ...allData.map(r => r.initial_validated_by),
        ...allData.map(r => r.final_validated_by)
    ].filter(Boolean))].sort();

    qas.forEach(qa => {
        const initRows = filteredData.filter(r => r.initial_validated_by === qa);
        const finalRows = filteredData.filter(r => r.final_validated_by === qa);
        const ih = initRows.length;
        const iv = initRows.filter(r => r.qa_initial_status === 'Valid').length;
        const ii = initRows.filter(r => r.qa_initial_status === 'Invalid').length;
        const ip = initRows.filter(r => r.qa_initial_status === 'For Validation').length;
        const fh = finalRows.length;
        const fv = finalRows.filter(r => r.final_val_status === 'Valid').length;
        const fi = finalRows.filter(r => r.final_val_status === 'Invalid').length;
        qaHeaders.push([
            qa, ih, iv, ii, ip, ih > 0 ? `${((iv/ih)*100).toFixed(1)}%` : '0%',
            fh, fv, fi, fh > 0 ? `${((fv/fh)*100).toFixed(1)}%` : '0%',
            ih + fh
        ]);
    });
    const wsQA = XLSX.utils.aoa_to_sheet(qaHeaders);
    XLSX.utils.book_append_sheet(wb, wsQA, "QA Performance");

    // 4. Dispatch Team Sheet
    const dispHeaders = [
        ["Dispatch Specialist", "Total Actions", "Override Done", "Pending Review", "No Action", "Override Resolution %"]
    ];
    const disps = [...new Set(allData.map(r => r.overridden_by).filter(Boolean))].sort();
    disps.forEach(name => {
        const dRows = filteredData.filter(r => r.overridden_by === name);
        const act = dRows.length;
        const done = dRows.filter(r => r.dispatch_status === 'Override Done').length;
        const pend = dRows.filter(r => r.dispatch_status === 'Pending').length;
        const na = dRows.filter(r => r.dispatch_status === 'No Action').length;
        dispHeaders.push([
            name, act, done, pend, na, act > 0 ? `${((done/act)*100).toFixed(1)}%` : '0%'
        ]);
    });
    const wsDisp = XLSX.utils.aoa_to_sheet(dispHeaders);
    XLSX.utils.book_append_sheet(wb, wsDisp, "Dispatch Performance");

    // 5. Raw Filtered Records Sheet
    const recordRows = [
        ["Waybill Date (Intake)", "Validation Date (QA)", "Waybill No.", "Rider", "Initial QA Status", "Initial QA Remarks", "Initial Validated By", "(Old MDC) Creation", "Dispatch Status", "Dispatch Date", "Overridden By", "Final Val Status", "Final Val Date", "Final QA Remarks", "Final Validated By", "Pharma Remarks"]
    ];
    filteredData.forEach(r => {
        recordRows.push([
            r.date, r.initial_val_date || '-', r.waybill_no, r.rider, r.qa_initial_status,
            r.qa_initial_remarks, r.initial_validated_by, r.old_mdc_creation,
            r.dispatch_status, r.dispatch_date, r.overridden_by,
            r.final_val_status, r.final_val_date, r.final_qa_remarks,
            r.final_validated_by, r.pharma_remarks
        ]);
    });
    const wsRecords = XLSX.utils.aoa_to_sheet(recordRows);
    XLSX.utils.book_append_sheet(wb, wsRecords, "Waybills");

    const fileName = `Waybill_QA_Dispatch_Progress_Report_${new Date().toISOString().slice(0, 10)}.xlsx`;
    XLSX.writeFile(wb, fileName);
    showNotification(`Excel progress report downloaded: ${fileName}`, "success");
}

function downloadPreGeneratedExcel() {
    // Works both when uploaded to any web domain and when running locally
    const link = document.createElement('a');
    link.href = 'Waybill_QA_Dispatch_Progress_Report.xlsx';
    link.download = 'Waybill_QA_Dispatch_Progress_Report.xlsx';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showNotification("Downloading pre-generated Excel progress report...", "info");
}

// ==========================================
// DIRECT CLIENT-SIDE GOOGLE SHEETS LIVE SYNC
// Works on any web domain, GitHub Pages, or local host without server backend!
// ==========================================

function syncGoogleSheet() {
    syncGoogleSheetDirect(true);
}

function syncGoogleSheetDirect(isManual = true) {
    if (isSyncing) return;
    isSyncing = true;

    const btn = document.getElementById('btn-sync-sheet');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = `<svg class="animate-spin -ml-1 mr-2 h-4 w-4 text-white inline" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path></svg> Syncing...`;
    }

    updateSyncStatusUI("Fetching live data from Google Sheets...", "syncing");
    if (isManual) {
        showNotification("Connecting to Google Sheets...", "info");
    }

    // Primary: JSONP method (100% immune to CORS on any domain)
    // Secondary: Direct CSV fetch
    fetchGoogleSheetViaJSONP()
        .catch(err => {
            console.warn("JSONP attempt failed, trying CSV export fetch...", err);
            return fetchGoogleSheetViaCSV();
        })
        .then(newRecords => {
            if (!newRecords || newRecords.length === 0) {
                throw new Error("No waybill records returned from Google Sheets");
            }

            allData = newRecords;
            lastSyncTimestamp = new Date();
            
            initFilterControls();
            initCustomReportBuilder();
            applyFilters();

            const timeStr = lastSyncTimestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            updateSyncStatusUI(`Live Synced at ${timeStr} • ${allData.length.toLocaleString()} rows`, "success");

            if (isManual) {
                showNotification(`Successfully synced ${allData.length.toLocaleString()} live records from Google Sheets!`, "success");
            }
        })
        .catch(err => {
            console.error("Live sync failed:", err);
            const statusMsg = allData.length > 0 
                ? `Offline/Cached Mode (${allData.length.toLocaleString()} records)` 
                : "Could not connect to Google Sheets";
            updateSyncStatusUI(statusMsg, "warning");

            if (isManual) {
                showNotification("Could not reach Google Sheets. Showing cached data.", "error");
            }
        })
        .finally(() => {
            isSyncing = false;
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = `<svg class="w-4 h-4 mr-1.5 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg> Sync Sheet`;
            }
        });
}

function fetchGoogleSheetViaJSONP() {
    return new Promise((resolve, reject) => {
        const callbackName = 'gvizCallback_' + Date.now();
        const script = document.createElement('script');
        const timeout = setTimeout(() => {
            cleanup();
            reject(new Error("Google Sheets JSONP request timed out"));
        }, 12000);

        function cleanup() {
            clearTimeout(timeout);
            delete window[callbackName];
            if (script.parentNode) {
                script.parentNode.removeChild(script);
            }
        }

        window[callbackName] = function(response) {
            cleanup();
            try {
                if (!response || !response.table || !response.table.rows) {
                    reject(new Error("Malformed Google Visualization response"));
                    return;
                }
                const parsed = parseGVizRows(response.table.rows);
                resolve(parsed);
            } catch (e) {
                reject(e);
            }
        };

        script.onerror = function() {
            cleanup();
            reject(new Error("JSONP script load error"));
        };

        const cacheBust = Date.now();
        script.src = `https://docs.google.com/spreadsheets/d/${GOOGLE_SHEET_ID}/gviz/tq?tqx=responseHandler:${callbackName}&_=${cacheBust}`;
        document.head.appendChild(script);
    });
}

function parseGVizRows(rows) {
    const headers = [
        "date", "waybill_no", "rider", "qa_initial_status", "initial_val_date",
        "qa_initial_remarks", "initial_validated_by", "old_mdc_creation",
        "dispatch_status", "dispatch_date", "overridden_by", "final_val_status",
        "final_val_date", "final_qa_remarks", "final_validated_by", "pharma_remarks"
    ];

    const records = [];
    for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        const c = r.c || [];
        if (!c || c.length < 2) continue;

        // Waybill column is index 1
        const wbCell = c[1];
        if (!wbCell) continue;

        const wbVal = String(wbCell.f !== undefined ? wbCell.f : (wbCell.v !== null ? wbCell.v : '')).trim();
        // Check if row has a numeric waybill number (minimum 8 digits)
        if (!(/^\d{8,}$/.test(wbVal))) {
            continue;
        }

        const rec = {};
        for (let colIdx = 0; colIdx < headers.length; colIdx++) {
            const cell = c[colIdx];
            if (!cell) {
                rec[headers[colIdx]] = '';
            } else {
                let val = cell.f !== undefined ? cell.f : cell.v;
                if (val === null || val === undefined) {
                    val = '';
                } else if (typeof val === 'string' && val.startsWith('Date(')) {
                    // Extract Date(YYYY,M,D)
                    const parts = val.replace('Date(', '').replace(')', '').split(',');
                    if (parts.length >= 3) {
                        val = `${parseInt(parts[1], 10) + 1}/${parts[2].trim()}/${parts[0].trim()}`;
                    }
                }
                rec[headers[colIdx]] = String(val).trim();
            }
        }
        records.push(rec);
    }
    return records;
}

function fetchGoogleSheetViaCSV() {
    const cacheBust = Date.now();
    const csvUrl = `https://docs.google.com/spreadsheets/d/${GOOGLE_SHEET_ID}/export?format=csv&_=${cacheBust}`;
    
    return fetch(csvUrl, { mode: 'cors' })
        .then(res => {
            if (!res.ok) throw new Error(`HTTP error ${res.status}`);
            return res.text();
        })
        .then(csvText => {
            if (typeof XLSX !== 'undefined') {
                const workbook = XLSX.read(csvText, { type: 'string' });
                const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
                const rows = XLSX.utils.sheet_to_json(firstSheet, { header: 1 });
                return parseCSVRows(rows);
            } else {
                throw new Error("SheetJS XLSX is required for CSV parsing");
            }
        });
}

function parseCSVRows(rows) {
    let headerRowIndex = -1;
    for (let i = 0; i < Math.min(20, rows.length); i++) {
        const row = rows[i] || [];
        const str = JSON.stringify(row);
        if (str.includes('Waybill No') || (row[1] && String(row[1]).includes('Waybill'))) {
            headerRowIndex = i;
            break;
        }
    }

    if (headerRowIndex === -1) headerRowIndex = 8; // fallback to default row 8

    const records = [];
    for (let i = headerRowIndex + 1; i < rows.length; i++) {
        const r = rows[i];
        if (!r || r.length < 2) continue;
        const wb = String(r[1] || '').trim();
        if (!wb || !(/^\d{8,}$/.test(wb))) continue;

        records.push({
            date: String(r[0] || '').trim(),
            waybill_no: wb,
            rider: String(r[2] || '').trim(),
            qa_initial_status: String(r[3] || '').trim(),
            initial_val_date: String(r[4] || '').trim(),
            qa_initial_remarks: String(r[5] || '').trim(),
            initial_validated_by: String(r[6] || '').trim(),
            old_mdc_creation: String(r[7] || '').trim(),
            dispatch_status: String(r[8] || '').trim(),
            dispatch_date: String(r[9] || '').trim(),
            overridden_by: String(r[10] || '').trim(),
            final_val_status: String(r[11] || '').trim(),
            final_val_date: String(r[12] || '').trim(),
            final_qa_remarks: String(r[13] || '').trim(),
            final_validated_by: String(r[14] || '').trim(),
            pharma_remarks: String(r[15] || '').trim()
        });
    }
    return records;
}

function updateSyncStatusUI(statusText, type = "success") {
    const badge = document.getElementById('live-sheet-status-badge');
    if (badge) {
        if (type === 'success') {
            badge.className = 'inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/20 text-emerald-200 border border-emerald-400/30';
            badge.innerHTML = `<span class="w-1.5 h-1.5 rounded-full bg-emerald-400 mr-1.5 animate-pulse"></span> ${escapeHtml(statusText)}`;
        } else if (type === 'syncing') {
            badge.className = 'inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-sky-500/20 text-sky-200 border border-sky-400/30';
            badge.innerHTML = `<span class="w-1.5 h-1.5 rounded-full bg-sky-400 mr-1.5 animate-ping"></span> ${escapeHtml(statusText)}`;
        } else {
            badge.className = 'inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/20 text-amber-200 border border-amber-400/30';
            badge.innerHTML = `<span class="w-1.5 h-1.5 rounded-full bg-amber-400 mr-1.5"></span> ${escapeHtml(statusText)}`;
        }
    }
}

function handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const firstSheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[firstSheetName];
            const json = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

            // Find header row (looks for 'Waybill No.' or 'Date')
            let headerRowIndex = 0;
            for (let i = 0; i < Math.min(20, json.length); i++) {
                const rowStr = JSON.stringify(json[i]);
                if (rowStr.includes('Waybill No') || rowStr.includes('QA Status')) {
                    headerRowIndex = i;
                    break;
                }
            }

            const parsed = [];
            for (let i = headerRowIndex + 1; i < json.length; i++) {
                const row = json[i];
                if (!row || row.length === 0) continue;
                parsed.push({
                    date: String(row[0] || '').trim(),
                    waybill_no: String(row[1] || '').trim(),
                    rider: String(row[2] || '').trim(),
                    qa_initial_status: String(row[3] || '').trim(),
                    initial_val_date: String(row[4] || '').trim(),
                    qa_initial_remarks: String(row[5] || '').trim(),
                    initial_validated_by: String(row[6] || '').trim(),
                    old_mdc_creation: String(row[7] || '').trim(),
                    dispatch_status: String(row[8] || '').trim(),
                    dispatch_date: String(row[9] || '').trim(),
                    overridden_by: String(row[10] || '').trim(),
                    final_val_status: String(row[11] || '').trim(),
                    final_val_date: String(row[12] || '').trim(),
                    final_qa_remarks: String(row[13] || '').trim(),
                    final_validated_by: String(row[14] || '').trim(),
                    pharma_remarks: String(row[15] || '').trim()
                });
            }

            if (parsed.length > 0) {
                allData = parsed;
                initFilterControls();
                initCustomReportBuilder();
                applyFilters();
                showNotification(`Loaded ${parsed.length} records from ${file.name}!`, "success");
            } else {
                showNotification("Could not find valid waybill records in file.", "error");
            }
        } catch (err) {
            console.error("Error parsing uploaded file:", err);
            showNotification("Error parsing file. Please upload an Excel or CSV file.", "error");
        }
    };
    reader.readAsArrayBuffer(file);
}

function showNotification(msg, type = "info") {
    const el = document.getElementById('toast-notification');
    if (!el) return;
    el.textContent = msg;
    
    if (type === 'error') {
        el.className = 'fixed bottom-5 right-5 z-50 px-4 py-3 rounded-lg shadow-lg text-white font-medium text-xs bg-rose-600 transition-all duration-300 transform translate-y-0 opacity-100';
    } else if (type === 'success') {
        el.className = 'fixed bottom-5 right-5 z-50 px-4 py-3 rounded-lg shadow-lg text-white font-medium text-xs bg-emerald-600 transition-all duration-300 transform translate-y-0 opacity-100';
    } else {
        el.className = 'fixed bottom-5 right-5 z-50 px-4 py-3 rounded-lg shadow-lg text-white font-medium text-xs bg-blue-600 transition-all duration-300 transform translate-y-0 opacity-100';
    }

    setTimeout(() => {
        el.className += ' opacity-0 translate-y-4 pointer-events-none';
    }, 4000);
}

function toggleAutoSync(enable) {
    if (autoSyncInterval) {
        clearInterval(autoSyncInterval);
        autoSyncInterval = null;
    }
    if (enable) {
        showNotification("Auto-sync enabled (checks every 60s)", "info");
        autoSyncInterval = setInterval(() => {
            syncGoogleSheetDirect(false);
        }, 60000);
    } else {
        showNotification("Auto-sync disabled", "info");
    }
}

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// ==========================================
// CUSTOMIZABLE EXCEL REPORT BUILDER ENGINE
// ==========================================

const CR_COLUMNS = [
    // Intake Group
    { id: 'waybill_no', label: 'Waybill No.', group: 'Intake Info', default: true },
    { id: 'rider', label: 'Rider Name', group: 'Intake Info', default: true },
    { id: 'date', label: 'Actual Waybill Date', group: 'Intake Info', default: false },
    // Initial QA Group
    { id: 'initial_val_date', label: 'Validation Date (QA)', group: 'Initial QA Stage', default: true },
    { id: 'qa_initial_status', label: 'Initial QA Status', group: 'Initial QA Stage', default: true },
    { id: 'initial_validated_by', label: 'Initial QA Validator', group: 'Initial QA Stage', default: true },
    { id: 'qa_initial_remarks', label: 'Initial QA Remarks', group: 'Initial QA Stage', default: true },
    // Dispatch Group
    { id: 'dispatch_status', label: 'Dispatch Status', group: 'Dispatch Team', default: true },
    { id: 'overridden_by', label: 'Dispatch Overridden By', group: 'Dispatch Team', default: false },
    { id: 'dispatch_date', label: 'Dispatch Status Date', group: 'Dispatch Team', default: false },
    { id: 'old_mdc_creation', label: '(Old MDC) Creation', group: 'Dispatch Team', default: false },
    // Final QA Group
    { id: 'final_val_status', label: 'Final QA Status', group: 'Final QA Stage', default: false },
    { id: 'final_validated_by', label: 'Final QA Validator', group: 'Final QA Stage', default: false },
    { id: 'final_qa_remarks', label: 'Final QA Remarks', group: 'Final QA Stage', default: false },
    { id: 'final_val_date', label: 'Final QA Date', group: 'Final QA Stage', default: false },
    // Other
    { id: 'pharma_remarks', label: 'Pharma Remarks', group: 'Other Details', default: false }
];

let crSelectedColumns = new Set(CR_COLUMNS.filter(c => c.default).map(c => c.id));
let crMatchingRecords = [];

function initCustomReportBuilder() {
    const container = document.getElementById('cr-column-selector-container');
    if (!container) return;

    // 1. Populate Multi-Date Checklist Selector
    renderCustomReportDateCheckboxes();

    // 2. Populate QA Dropdown
    const qaSelect = document.getElementById('cr-filter-qa');
    if (qaSelect) {
        const qas = [...new Set(allData.map(r => r.initial_validated_by).filter(Boolean))].sort();
        const currentVal = qaSelect.value;
        qaSelect.innerHTML = '<option value="ALL">All QA Specialists</option>';
        qas.forEach(name => {
            qaSelect.innerHTML += `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`;
        });
        if (currentVal && qas.includes(currentVal)) {
            qaSelect.value = currentVal;
        }
    }

    // 3. Populate Dispatch Dropdown
    const dispSelect = document.getElementById('cr-filter-dispatcher');
    if (dispSelect) {
        const disps = [...new Set(allData.map(r => r.overridden_by).filter(Boolean))].sort();
        const currentVal = dispSelect.value;
        dispSelect.innerHTML = '<option value="ALL">All Dispatch Specialists</option>';
        disps.forEach(name => {
            dispSelect.innerHTML += `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`;
        });
        if (currentVal && disps.includes(currentVal)) {
            dispSelect.value = currentVal;
        }
    }

    // 4. Render Column Checkboxes grouped by stage
    renderCustomReportColumnCheckboxes();

    // 5. Trigger initial filtering and preview
    onCustomReportConfigChange();
}

function renderCustomReportDateCheckboxes() {
    const container = document.getElementById('cr-date-checklist');
    if (!container) return;

    const allValDates = sortDateStrings([...new Set(allData.map(r => r.initial_val_date).filter(Boolean))]);
    if (allValDates.length === 0) {
        container.innerHTML = '<div class="text-slate-400 p-2 text-center text-xs">No validation dates found</div>';
        return;
    }

    const latestDate = allValDates[allValDates.length - 1];
    const secondLatestDate = allValDates.length > 1 ? allValDates[allValDates.length - 2] : null;

    const isAll = crSelectedDates.has('ALL') || (crSelectedDates.size === allValDates.length && allValDates.length > 0);

    // Option: "All Dates (Full Dataset)"
    let html = `
        <label class="flex items-center justify-between p-1.5 rounded-lg ${isAll ? 'bg-blue-50/80 border-blue-200 text-blue-900 font-semibold' : 'bg-white hover:bg-slate-100/80 text-slate-700'} border border-slate-200/80 cursor-pointer select-none transition text-xs">
            <div class="flex items-center gap-2">
                <input type="checkbox" ${isAll ? 'checked' : ''} onchange="toggleCustomReportDate('ALL', this.checked)" class="rounded text-blue-600 focus:ring-0">
                <span>All Dates (Full Dataset)</span>
            </div>
            <span class="text-[10px] px-1.5 py-0.5 rounded-full font-bold bg-blue-100 text-blue-700">${allData.length.toLocaleString()}</span>
        </label>
    `;

    // Reverse chronological order (latest dates first)
    const reversedDates = [...allValDates].reverse();
    reversedDates.forEach(dStr => {
        const isChecked = isAll || crSelectedDates.has(dStr);
        const count = allData.filter(r => r.initial_val_date === dStr).length;
        const dObj = parseDateStrToObj(dStr);
        const dayName = dObj ? ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][dObj.getDay()] : '';
        const isToday = dStr === latestDate;
        const isYesterday = dStr === secondLatestDate;

        html += `
            <label class="flex items-center justify-between p-1.5 rounded-lg ${isChecked ? 'bg-blue-50/50 border-blue-200' : 'bg-white hover:bg-slate-100/60'} border border-slate-200/70 cursor-pointer select-none transition text-xs">
                <div class="flex items-center gap-2">
                    <input type="checkbox" ${isChecked ? 'checked' : ''} onchange="toggleCustomReportDate('${escapeHtml(dStr)}', this.checked)" class="rounded text-blue-600 focus:ring-0">
                    <span class="font-medium text-slate-800">${escapeHtml(dStr)}</span>
                    <span class="text-slate-400 text-[11px]">(${dayName})</span>
                    ${isToday ? '<span class="text-[9px] px-1 py-0.2 rounded font-extrabold uppercase bg-emerald-100 text-emerald-800">Today</span>' : ''}
                    ${isYesterday ? '<span class="text-[9px] px-1 py-0.2 rounded font-semibold bg-slate-200 text-slate-700">Yesterday</span>' : ''}
                </div>
                <span class="text-[10px] px-1.5 py-0.5 rounded-full font-bold ${isChecked ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-500'}">${count.toLocaleString()}</span>
            </label>
        `;
    });

    container.innerHTML = html;

    // Update summary text & badge
    const summaryEl = document.getElementById('cr-selected-dates-summary');
    const badgeEl = document.getElementById('cr-selected-dates-badge');
    if (summaryEl && badgeEl) {
        if (isAll) {
            summaryEl.textContent = `All Dates Selected (${allValDates.length} dates)`;
            badgeEl.textContent = 'All';
            badgeEl.className = 'px-2 py-0.2 rounded-full font-bold bg-blue-100 text-blue-700 text-[10px]';
        } else if (crSelectedDates.size > 0) {
            const arr = Array.from(crSelectedDates);
            summaryEl.textContent = arr.join(', ');
            summaryEl.title = arr.join(', ');
            badgeEl.textContent = `${arr.length} selected`;
            badgeEl.className = 'px-2 py-0.2 rounded-full font-bold bg-emerald-100 text-emerald-700 text-[10px]';
        } else {
            summaryEl.textContent = 'No dates selected (0 matching)';
            badgeEl.textContent = '0 selected';
            badgeEl.className = 'px-2 py-0.2 rounded-full font-bold bg-rose-100 text-rose-700 text-[10px]';
        }
    }
}

function toggleCustomReportDate(dateStr, isChecked) {
    const allValDates = sortDateStrings([...new Set(allData.map(r => r.initial_val_date).filter(Boolean))]);

    if (dateStr === 'ALL') {
        if (isChecked) {
            crSelectedDates = new Set(['ALL']);
        } else {
            crSelectedDates = new Set();
        }
    } else {
        if (crSelectedDates.has('ALL')) {
            crSelectedDates = new Set(allValDates);
            crSelectedDates.delete(dateStr);
        } else {
            if (isChecked) {
                crSelectedDates.add(dateStr);
            } else {
                crSelectedDates.delete(dateStr);
            }
            if (crSelectedDates.size === allValDates.length) {
                crSelectedDates = new Set(['ALL']);
            }
        }
    }

    renderCustomReportDateCheckboxes();
    onCustomReportConfigChange();
}

function setCustomReportDates(mode) {
    const allValDates = sortDateStrings([...new Set(allData.map(r => r.initial_val_date).filter(Boolean))]);
    if (allValDates.length === 0) return;

    const latestDate = allValDates[allValDates.length - 1];
    const secondLatestDate = allValDates.length > 1 ? allValDates[allValDates.length - 2] : latestDate;

    if (mode === 'all') {
        crSelectedDates = new Set(['ALL']);
    } else if (mode === 'today') {
        crSelectedDates = new Set([latestDate]);
    } else if (mode === 'yesterday') {
        crSelectedDates = new Set([secondLatestDate]);
    } else if (mode === 'clear') {
        crSelectedDates = new Set();
    }

    renderCustomReportDateCheckboxes();
    onCustomReportConfigChange();
}

function renderCustomReportColumnCheckboxes() {
    const container = document.getElementById('cr-column-selector-container');
    if (!container) return;

    const groups = {};
    CR_COLUMNS.forEach(col => {
        if (!groups[col.group]) groups[col.group] = [];
        groups[col.group].push(col);
    });

    let html = '';
    for (const [groupName, cols] of Object.entries(groups)) {
        html += `
            <div class="p-3 bg-slate-50/80 rounded-xl border border-slate-100">
                <div class="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">${escapeHtml(groupName)}</div>
                <div class="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    ${cols.map(col => {
                        const isChecked = crSelectedColumns.has(col.id) ? 'checked' : '';
                        return `
                            <label class="flex items-center gap-2 p-1.5 rounded-lg bg-white border border-slate-200/70 hover:border-blue-300 hover:bg-blue-50/30 cursor-pointer select-none transition text-xs">
                                <input type="checkbox" value="${escapeHtml(col.id)}" ${isChecked} onchange="toggleCustomReportColumn('${escapeHtml(col.id)}', this.checked)" class="rounded text-blue-600 focus:ring-0">
                                <span class="font-medium text-slate-700 truncate" title="${escapeHtml(col.label)}">${escapeHtml(col.label)}</span>
                            </label>
                        `;
                    }).join('')}
                </div>
            </div>
        `;
    }
    container.innerHTML = html;
}

function toggleCustomReportColumn(colId, isChecked) {
    if (isChecked) {
        crSelectedColumns.add(colId);
    } else {
        crSelectedColumns.delete(colId);
    }
    onCustomReportConfigChange();
}

function setCustomReportColumns(mode) {
    if (mode === 'all') {
        crSelectedColumns = new Set(CR_COLUMNS.map(c => c.id));
    } else if (mode === 'none') {
        crSelectedColumns = new Set();
    } else if (mode === 'user_minimal') {
        // User requested: waybill id + rider name + initial validator
        crSelectedColumns = new Set(['waybill_no', 'rider', 'initial_validated_by']);
    }
    renderCustomReportColumnCheckboxes();
    onCustomReportConfigChange();
}

function onCustomReportConfigChange() {
    const isAllDates = crSelectedDates.has('ALL');
    const hasAnyDatesSelected = isAllDates || crSelectedDates.size > 0;
    const initVal = document.getElementById('cr-filter-initial')?.value || 'ALL';
    const dispVal = document.getElementById('cr-filter-dispatch')?.value || 'ALL';
    const finalVal = document.getElementById('cr-filter-final')?.value || 'ALL';
    const qaVal = document.getElementById('cr-filter-qa')?.value || 'ALL';
    const dispatcherVal = document.getElementById('cr-filter-dispatcher')?.value || 'ALL';
    const searchVal = (document.getElementById('cr-search-keyword')?.value || '').trim().toLowerCase();

    crMatchingRecords = allData.filter(r => {
        // Multi-Date match (against Validation Date)
        if (!hasAnyDatesSelected) return false;
        if (!isAllDates && !crSelectedDates.has(r.initial_val_date)) return false;

        // Initial Status match
        if (initVal !== 'ALL' && r.qa_initial_status !== initVal) return false;

        // Dispatch Status match
        if (dispVal === 'NOT_OVERRIDDEN') {
            if (r.dispatch_status === 'Override Done') return false;
        } else if (dispVal !== 'ALL' && r.dispatch_status !== dispVal) {
            return false;
        }

        // Final Status match
        if (finalVal === 'PENDING') {
            if (r.final_val_status === 'Valid' || r.final_val_status === 'Invalid') return false;
        } else if (finalVal !== 'ALL' && r.final_val_status !== finalVal) {
            return false;
        }

        // QA Specialist match
        if (qaVal !== 'ALL' && r.initial_validated_by !== qaVal) return false;

        // Dispatch Specialist match
        if (dispatcherVal !== 'ALL' && r.overridden_by !== dispatcherVal) return false;

        // Keyword search across waybill_no, rider, remarks
        if (searchVal) {
            const wb = (r.waybill_no || '').toLowerCase();
            const rider = (r.rider || '').toLowerCase();
            const initRem = (r.qa_initial_remarks || '').toLowerCase();
            const finalRem = (r.final_qa_remarks || '').toLowerCase();
            if (!wb.includes(searchVal) && !rider.includes(searchVal) && !initRem.includes(searchVal) && !finalRem.includes(searchVal)) {
                return false;
            }
        }

        return true;
    });

    // Update counts & labels
    const matchCount = crMatchingRecords.length;
    const matchPill = document.getElementById('custom-filter-match-pill');
    if (matchPill) {
        matchPill.textContent = `${matchCount.toLocaleString()} Matching`;
        if (matchCount === 0) {
            matchPill.className = 'text-xs font-bold text-rose-700 bg-rose-50 px-2.5 py-1 rounded-full border border-rose-200';
        } else {
            matchPill.className = 'text-xs font-bold text-blue-700 bg-blue-50 px-2.5 py-1 rounded-full border border-blue-200';
        }
    }

    const countBadge = document.getElementById('cr-preview-count-badge');
    if (countBadge) {
        countBadge.textContent = `${matchCount.toLocaleString()} Matching Records`;
    }

    const colsCountNote = document.getElementById('cr-cols-count-note');
    if (colsCountNote) {
        colsCountNote.textContent = `${crSelectedColumns.size} of ${CR_COLUMNS.length} columns selected`;
    }

    renderCustomReportPreview();
}

function renderCustomReportPreview() {
    const thead = document.getElementById('cr-preview-thead');
    const tbody = document.getElementById('cr-preview-tbody');
    if (!thead || !tbody) return;

    const activeCols = CR_COLUMNS.filter(c => crSelectedColumns.has(c.id));

    if (activeCols.length === 0) {
        thead.innerHTML = '<tr><th class="px-4 py-3 text-slate-500 font-semibold">Column Selection</th></tr>';
        tbody.innerHTML = '<tr><td class="px-4 py-6 text-center text-slate-400 font-medium">Please select at least one column above to preview and export.</td></tr>';
        return;
    }

    // Render Table Header
    thead.innerHTML = `
        <tr class="text-slate-600 uppercase text-[10px] tracking-wider font-semibold border-b border-slate-200 bg-slate-50">
            <th class="px-3 py-2.5 w-10 text-center text-slate-400">#</th>
            ${activeCols.map(c => `<th class="px-3 py-2.5 whitespace-nowrap">${escapeHtml(c.label)}</th>`).join('')}
        </tr>
    `;

    // Render Table Rows (First 10 rows for snappy preview)
    const previewRows = crMatchingRecords.slice(0, 10);
    if (previewRows.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="${activeCols.length + 1}" class="px-4 py-8 text-center text-slate-400 font-medium">
                    No waybill records match the current filter criteria.
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = previewRows.map((r, idx) => {
        const cells = activeCols.map(c => {
            const rawVal = r[c.id];
            let cellContent = escapeHtml(rawVal || '-');

            // Format status badges
            if (c.id === 'qa_initial_status') {
                if (rawVal === 'Valid') cellContent = '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">Valid</span>';
                else if (rawVal === 'Invalid') cellContent = '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">Invalid</span>';
                else if (rawVal === 'For Validation') cellContent = '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">For Validation</span>';
            } else if (c.id === 'dispatch_status') {
                if (rawVal === 'Override Done') cellContent = '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">Override Done</span>';
                else if (rawVal === 'Pending') cellContent = '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">Pending</span>';
                else cellContent = `<span class="text-slate-400">${escapeHtml(rawVal || 'No Action')}</span>`;
            } else if (c.id === 'final_val_status') {
                if (rawVal === 'Valid') cellContent = '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">Valid</span>';
                else if (rawVal === 'Invalid') cellContent = '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">Invalid</span>';
                else cellContent = `<span class="text-slate-400">Pending</span>`;
            } else if (c.id === 'waybill_no') {
                cellContent = `<span class="font-mono font-bold text-blue-700">${cellContent}</span>`;
            } else if (c.id === 'rider') {
                cellContent = `<span class="font-semibold text-slate-800">${cellContent}</span>`;
            } else if (c.id === 'initial_validated_by' || c.id === 'overridden_by' || c.id === 'final_validated_by') {
                cellContent = `<span class="font-medium text-slate-700">${cellContent}</span>`;
            }

            return `<td class="px-3 py-2 whitespace-nowrap text-xs text-slate-700">${cellContent}</td>`;
        }).join('');

        return `
            <tr class="hover:bg-blue-50/30 transition-colors border-b border-slate-100">
                <td class="px-3 py-2 text-center text-slate-400 text-xs font-mono">${idx + 1}</td>
                ${cells}
            </tr>
        `;
    }).join('');
}

function applyCustomReportPreset(presetId) {
    const initSelect = document.getElementById('cr-filter-initial');
    const dispSelect = document.getElementById('cr-filter-dispatch');
    const finalSelect = document.getElementById('cr-filter-final');
    const qaSelect = document.getElementById('cr-filter-qa');
    const dispatcherSelect = document.getElementById('cr-filter-dispatcher');
    const searchInput = document.getElementById('cr-search-keyword');
    const filenameInput = document.getElementById('cr-filename');
    const sheetnameInput = document.getElementById('cr-sheetname');

    // Reset date selection to ALL
    crSelectedDates = new Set(['ALL']);
    renderCustomReportDateCheckboxes();

    if (presetId === 'invalid_pending_override') {
        // USER'S EXACT REQUEST: all waybills that are invalid and didn't override yet
        if (initSelect) initSelect.value = 'Invalid';
        if (dispSelect) dispSelect.value = 'NOT_OVERRIDDEN';
        if (finalSelect) finalSelect.value = 'ALL';
        if (qaSelect) qaSelect.value = 'ALL';
        if (dispatcherSelect) dispatcherSelect.value = 'ALL';
        if (searchInput) searchInput.value = '';

        // Select exact requested columns: waybill id + rider name + initial validator + remarks + date + status
        crSelectedColumns = new Set(['waybill_no', 'rider', 'initial_validated_by', 'qa_initial_status', 'qa_initial_remarks', 'initial_val_date', 'dispatch_status']);
        renderCustomReportColumnCheckboxes();

        if (filenameInput) filenameInput.value = `Invalid_Waybills_Pending_Dispatch_Override_${new Date().toISOString().slice(0, 10)}.xlsx`;
        if (sheetnameInput) sheetnameInput.value = 'Invalid_Pending_Dispatch';
        showNotification("Applied Preset: Invalid & Not Overridden Yet", "info");
    } else if (presetId === 'pending_initial_qa') {
        if (initSelect) initSelect.value = 'For Validation';
        if (dispSelect) dispSelect.value = 'ALL';
        if (finalSelect) finalSelect.value = 'ALL';
        if (qaSelect) qaSelect.value = 'ALL';
        if (dispatcherSelect) dispatcherSelect.value = 'ALL';
        if (searchInput) searchInput.value = '';

        crSelectedColumns = new Set(['waybill_no', 'rider', 'date', 'qa_initial_status']);
        renderCustomReportColumnCheckboxes();

        if (filenameInput) filenameInput.value = `Waybills_Awaiting_Initial_QA_${new Date().toISOString().slice(0, 10)}.xlsx`;
        if (sheetnameInput) sheetnameInput.value = 'Awaiting_Initial_QA';
        showNotification("Applied Preset: Awaiting Initial QA", "info");
    } else if (presetId === 'overridden_awaiting_final') {
        if (initSelect) initSelect.value = 'ALL';
        if (dispSelect) dispSelect.value = 'Override Done';
        if (finalSelect) finalSelect.value = 'PENDING';
        if (qaSelect) qaSelect.value = 'ALL';
        if (dispatcherSelect) dispatcherSelect.value = 'ALL';
        if (searchInput) searchInput.value = '';

        crSelectedColumns = new Set(['waybill_no', 'rider', 'initial_validated_by', 'qa_initial_remarks', 'dispatch_status', 'overridden_by', 'dispatch_date']);
        renderCustomReportColumnCheckboxes();

        if (filenameInput) filenameInput.value = `Dispatch_Overrides_Awaiting_Final_QA_${new Date().toISOString().slice(0, 10)}.xlsx`;
        if (sheetnameInput) sheetnameInput.value = 'Overrides_Pending_Final_QA';
        showNotification("Applied Preset: Overridden Awaiting Final QA", "info");
    } else if (presetId === 'final_qa_rejected') {
        if (initSelect) initSelect.value = 'ALL';
        if (dispSelect) dispSelect.value = 'ALL';
        if (finalSelect) finalSelect.value = 'Invalid';
        if (qaSelect) qaSelect.value = 'ALL';
        if (dispatcherSelect) dispatcherSelect.value = 'ALL';
        if (searchInput) searchInput.value = '';

        crSelectedColumns = new Set(['waybill_no', 'rider', 'initial_validated_by', 'overridden_by', 'final_val_status', 'final_validated_by', 'final_qa_remarks']);
        renderCustomReportColumnCheckboxes();

        if (filenameInput) filenameInput.value = `Final_QA_Rejected_Waybills_${new Date().toISOString().slice(0, 10)}.xlsx`;
        if (sheetnameInput) sheetnameInput.value = 'Final_QA_Rejected';
        showNotification("Applied Preset: Final QA Rejected", "info");
    } else if (presetId === 'user_minimal') {
        // Minimal ID + Rider + Validator
        crSelectedColumns = new Set(['waybill_no', 'rider', 'initial_validated_by']);
        renderCustomReportColumnCheckboxes();

        if (filenameInput) filenameInput.value = `Waybills_ID_Rider_Validator_${new Date().toISOString().slice(0, 10)}.xlsx`;
        if (sheetnameInput) sheetnameInput.value = 'Waybill_List';
        showNotification("Applied Preset: Minimal ID, Rider & Validator", "info");
    } else if (presetId === 'all_records_all_cols') {
        if (initSelect) initSelect.value = 'ALL';
        if (dispSelect) dispSelect.value = 'ALL';
        if (finalSelect) finalSelect.value = 'ALL';
        if (qaSelect) qaSelect.value = 'ALL';
        if (dispatcherSelect) dispatcherSelect.value = 'ALL';
        if (searchInput) searchInput.value = '';

        crSelectedColumns = new Set(CR_COLUMNS.map(c => c.id));
        renderCustomReportColumnCheckboxes();

        if (filenameInput) filenameInput.value = `Full_Waybills_Dataset_${new Date().toISOString().slice(0, 10)}.xlsx`;
        if (sheetnameInput) sheetnameInput.value = 'All_Waybills';
        showNotification("Selected All Columns", "info");
    }

    onCustomReportConfigChange();
}

function resetCustomReportBuilder() {
    const initSelect = document.getElementById('cr-filter-initial');
    const dispSelect = document.getElementById('cr-filter-dispatch');
    const finalSelect = document.getElementById('cr-filter-final');
    const qaSelect = document.getElementById('cr-filter-qa');
    const dispatcherSelect = document.getElementById('cr-filter-dispatcher');
    const searchInput = document.getElementById('cr-search-keyword');
    const filenameInput = document.getElementById('cr-filename');
    const sheetnameInput = document.getElementById('cr-sheetname');

    crSelectedDates = new Set(['ALL']);
    renderCustomReportDateCheckboxes();

    if (initSelect) initSelect.value = 'ALL';
    if (dispSelect) dispSelect.value = 'ALL';
    if (finalSelect) finalSelect.value = 'ALL';
    if (qaSelect) qaSelect.value = 'ALL';
    if (dispatcherSelect) dispatcherSelect.value = 'ALL';
    if (searchInput) searchInput.value = '';

    crSelectedColumns = new Set(CR_COLUMNS.filter(c => c.default).map(c => c.id));
    renderCustomReportColumnCheckboxes();

    if (filenameInput) filenameInput.value = 'Custom_Waybill_Report.xlsx';
    if (sheetnameInput) sheetnameInput.value = 'Waybills_Report';

    onCustomReportConfigChange();
    showNotification("Custom report builder reset to defaults.", "info");
}

function downloadCustomExcelReport() {
    if (typeof XLSX === 'undefined') {
        showNotification("SheetJS library is still loading. Please try again.", "error");
        return;
    }

    const activeCols = CR_COLUMNS.filter(c => crSelectedColumns.has(c.id));
    if (activeCols.length === 0) {
        showNotification("Please select at least one column to include in the Excel report.", "error");
        return;
    }

    if (crMatchingRecords.length === 0) {
        showNotification("No records match the current filter. Adjust filters before downloading.", "error");
        return;
    }

    const wb = XLSX.utils.book_new();

    // 1. Optional Executive Summary Tab
    const includeKpi = document.getElementById('cr-opt-kpi-summary')?.checked ?? true;
    if (includeKpi) {
        const total = crMatchingRecords.length;
        const initValid = crMatchingRecords.filter(r => r.qa_initial_status === 'Valid').length;
        const initInvalid = crMatchingRecords.filter(r => r.qa_initial_status === 'Invalid').length;
        const initPending = crMatchingRecords.filter(r => r.qa_initial_status === 'For Validation').length;
        const dispOverride = crMatchingRecords.filter(r => r.dispatch_status === 'Override Done').length;
        const finalValid = crMatchingRecords.filter(r => r.final_val_status === 'Valid').length;
        const finalInvalid = crMatchingRecords.filter(r => r.final_val_status === 'Invalid').length;

        const summaryData = [
            ["CUSTOM REPORT EXECUTIVE SUMMARY"],
            ["Generated At", new Date().toLocaleString()],
            ["Total Matching Waybills", total],
            [],
            ["METRIC", "COUNT", "SHARE OF FILTERED"],
            ["Total Records", total, "100.0%"],
            ["Initial QA Valid", initValid, total > 0 ? `${((initValid / total) * 100).toFixed(1)}%` : '0%'],
            ["Initial QA Invalid (Defects)", initInvalid, total > 0 ? `${((initInvalid / total) * 100).toFixed(1)}%` : '0%'],
            ["Initial QA Pending", initPending, total > 0 ? `${((initPending / total) * 100).toFixed(1)}%` : '0%'],
            ["Dispatch Override Done", dispOverride, initInvalid > 0 ? `${((dispOverride / initInvalid) * 100).toFixed(1)}%` : '0%'],
            ["Final QA Valid", finalValid, (finalValid + finalInvalid) > 0 ? `${((finalValid / (finalValid + finalInvalid)) * 100).toFixed(1)}%` : '0%'],
            ["Final QA Invalid", finalInvalid, (finalValid + finalInvalid) > 0 ? `${((finalInvalid / (finalValid + finalInvalid)) * 100).toFixed(1)}%` : '0%'],
            [],
            ["ACTIVE FILTER CRITERIA"],
            ["Validation Dates", crSelectedDates.has('ALL') ? "All Dates (Full Dataset)" : (crSelectedDates.size > 0 ? Array.from(crSelectedDates).join(', ') : "None")],
            ["Initial QA Status", document.getElementById('cr-filter-initial')?.value || 'ALL'],
            ["Dispatch Override Status", document.getElementById('cr-filter-dispatch')?.value || 'ALL'],
            ["Final QA Status", document.getElementById('cr-filter-final')?.value || 'ALL'],
            ["QA Specialist", document.getElementById('cr-filter-qa')?.value || 'ALL'],
            ["Dispatch Specialist", document.getElementById('cr-filter-dispatcher')?.value || 'ALL'],
            ["Search Keyword", document.getElementById('cr-search-keyword')?.value || 'None']
        ];
        const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
        wsSummary['!cols'] = [{ wch: 28 }, { wch: 15 }, { wch: 20 }];
        XLSX.utils.book_append_sheet(wb, wsSummary, "Summary_KPI");
    }

    // 2. Custom Data Sheet
    const headers = activeCols.map(c => c.label);
    const dataRows = [headers];

    crMatchingRecords.forEach(r => {
        const row = activeCols.map(c => {
            const v = r[c.id];
            return v !== undefined && v !== null ? v : '';
        });
        dataRows.push(row);
    });

    const wsData = XLSX.utils.aoa_to_sheet(dataRows);

    // Auto-fit column widths
    const colWidths = activeCols.map((col, idx) => {
        let maxLen = col.label.length;
        // Sample first 100 rows for speed
        const sampleCount = Math.min(crMatchingRecords.length, 100);
        for (let i = 0; i < sampleCount; i++) {
            const val = String(crMatchingRecords[i][col.id] || '');
            if (val.length > maxLen) maxLen = val.length;
        }
        return { wch: Math.min(Math.max(maxLen + 3, 12), 45) };
    });
    wsData['!cols'] = colWidths;

    const sheetName = (document.getElementById('cr-sheetname')?.value || 'Custom_Report').trim().replace(/[:\\/?*\[\]]/g, '_').slice(0, 31) || 'Custom_Report';
    XLSX.utils.book_append_sheet(wb, wsData, sheetName);

    let fileName = (document.getElementById('cr-filename')?.value || 'Custom_Waybill_Report.xlsx').trim();
    if (!fileName.toLowerCase().endsWith('.xlsx')) fileName += '.xlsx';

    XLSX.writeFile(wb, fileName);
    showNotification(`Custom Excel report downloaded: ${fileName} (${crMatchingRecords.length.toLocaleString()} rows)`, "success");
}

function downloadCustomCSVReport() {
    const activeCols = CR_COLUMNS.filter(c => crSelectedColumns.has(c.id));
    if (activeCols.length === 0) {
        showNotification("Please select at least one column to export.", "error");
        return;
    }

    if (crMatchingRecords.length === 0) {
        showNotification("No records match the current filter.", "error");
        return;
    }

    // Build CSV Content
    const csvRows = [];
    csvRows.push(activeCols.map(c => `"${c.label.replace(/"/g, '""')}"`).join(','));

    crMatchingRecords.forEach(r => {
        const row = activeCols.map(c => {
            const v = r[c.id] !== undefined && r[c.id] !== null ? String(r[c.id]) : '';
            return `"${v.replace(/"/g, '""')}"`;
        });
        csvRows.push(row.join(','));
    });

    const csvBlob = new Blob([csvRows.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    let fileName = (document.getElementById('cr-filename')?.value || 'Custom_Waybill_Report').replace(/\.xlsx$/i, '') + '.csv';
    link.href = URL.createObjectURL(csvBlob);
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showNotification(`CSV report downloaded: ${fileName}`, "success");
}
